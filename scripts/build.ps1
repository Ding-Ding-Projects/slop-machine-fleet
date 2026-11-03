param([switch]$Installer, [Parameter(ValueFromRemainingArguments=$true)][string[]]$Options)
$ErrorActionPreference = 'Stop'
$env:PSModulePath = (Join-Path $PSHOME 'Modules') + ';' + (Join-Path $env:ProgramFiles 'WindowsPowerShell\Modules')
$silent = $env:SILENT -eq '1' -or $Options -contains '/s' -or $Options -contains '--silent'
$runAfter = $env:RUN_AFTER_BUILD -eq '1' -or $Options -contains '/run' -or $Options -contains '--run'
$root = Split-Path $PSScriptRoot -Parent
function Get-SquirrelPayload([string]$Directory) {
  $setup = Get-Item -LiteralPath (Join-Path $Directory 'Setup.exe')
  $releases = Get-Item -LiteralPath (Join-Path $Directory 'RELEASES')
  if ($setup.Length -le 0 -or $releases.Length -le 0) { throw 'Squirrel setup or release inventory is empty.' }
  $result = @($setup,$releases)
  foreach ($entry in Get-Content -LiteralPath $releases.FullName) {
    if (-not $entry.Trim()) { continue }
    if ($entry -notmatch '^([a-fA-F0-9]{40})\s+([^/\\\s]+-(?:full|delta)\.nupkg)\s+([0-9]+)$') { throw 'Squirrel RELEASES contains an invalid package entry.' }
    $expectedHash = $matches[1]; $packageName = $matches[2]; $expectedLength = [long]$matches[3]
    $package = Get-Item -LiteralPath (Join-Path $Directory $packageName)
    if ($package.Length -le 0 -or $package.Length -ne $expectedLength -or (Get-FileHash -LiteralPath $package.FullName -Algorithm SHA1).Hash -ne $expectedHash) { throw 'A Squirrel package does not match its release inventory.' }
    $result += $package
  }
  if (-not ($result | Where-Object Name -like '*-full.nupkg')) { throw 'The required full Squirrel package is missing.' }
  return $result
}
try {
  foreach ($signingInput in @('CSC_LINK','CSC_KEY_PASSWORD','WIN_CSC_LINK','WIN_CSC_KEY_PASSWORD','CSC_NAME','WIN_CSC_NAME')) {
    [Environment]::SetEnvironmentVariable($signingInput, $null, 'Process')
  }
  $env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
  Set-Location -LiteralPath $root
  . (Join-Path $PSScriptRoot 'dotnet.ps1') -DefineCacheFunctionsOnly
  if ($Options | Where-Object { $_ -notin @('/s','--silent','/run','--run') }) { throw 'Supported arguments: /s, --silent, /run, --run.' }
  Write-Host 'Build uses user-scoped portable tools. Administrator rights are not required.'
  $nodeVersion = '22.16.0'
  $node = Get-Command node -ErrorAction SilentlyContinue
  $validNode = $false
  if ($node -and (Test-FleetBuildToolPath $node.Source)) { $major = & node -p 'parseInt(process.versions.node)'; $validNode = $LASTEXITCODE -eq 0 -and [int]$major -ge 22 }
  if (-not $validNode) {
    if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64') { throw 'Automatic Node bootstrap currently supports Windows x64 only.' }
    $tools = Get-FleetBuildToolsRoot
    New-Item -ItemType Directory -Force -Path $tools | Out-Null
    $archiveName = "node-v$nodeVersion-win-x64.zip"
    $nodeHome = Join-Path $tools "node-v$nodeVersion-win-x64"
    if (-not (Test-Path (Join-Path $nodeHome 'node.exe'))) {
      $archive = Join-Path $tools $archiveName
      $base = "https://nodejs.org/dist/v$nodeVersion"
      Write-Host "Obtaining Node $nodeVersion from $base"
      Invoke-WebRequest "$base/SHASUMS256.txt" -OutFile (Join-Path $tools 'SHASUMS256.txt') -UseBasicParsing
      $line = Get-Content (Join-Path $tools 'SHASUMS256.txt') | Where-Object { $_ -match "  $([regex]::Escape($archiveName))$" }
      if (@($line).Count -ne 1) { throw 'The official Node checksum inventory is incomplete.' }
      $expected = ($line -split '\s+')[0]
      if (-not (Test-Path $archive) -or (Get-FileHash $archive -Algorithm SHA256).Hash -ne $expected) { Invoke-WebRequest "$base/$archiveName" -OutFile $archive -UseBasicParsing }
      if ((Get-FileHash $archive -Algorithm SHA256).Hash -ne $expected) { throw 'Node download checksum mismatch.' }
      Expand-Archive -LiteralPath $archive -DestinationPath $tools -Force
    }
    $env:PATH = "$nodeHome;$env:PATH"
  }
  & node --version
  & node (Join-Path $PSScriptRoot 'check-vocabulary.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Private source currency validation did not pass.' }
  if ($LASTEXITCODE -ne 0) { throw 'Node verification failed.' }
  . (Join-Path $PSScriptRoot 'dotnet.ps1')
  $workerProject = Join-Path $root 'worker/Fleet.Worker.csproj'
  if (-not (Test-Path $workerProject)) { throw 'The required worker/Fleet.Worker.csproj target is missing.' }
  & dotnet build $workerProject --configuration Release
  if ($LASTEXITCODE -ne 0) { throw "Worker build exited $LASTEXITCODE." }
  if (Test-Path package-lock.json) { & npm.cmd ci --no-audit --no-fund } else { & npm.cmd install --no-audit --no-fund }
  if ($LASTEXITCODE -ne 0) { throw "Dependency acquisition exited $LASTEXITCODE." }
  $env:FLEET_BUILD_TIME = [DateTimeOffset]::UtcNow.ToString('O')
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw "Build exited $LASTEXITCODE." }
  if ($Installer) {
    & dotnet publish $workerProject --configuration Release --runtime win-x64 --self-contained true -p:PublishSingleFile=true --output (Join-Path $root 'release/worker')
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path (Join-Path $root 'release/worker/Fleet.Worker.exe'))) { throw 'The self-contained Windows worker publish is incomplete.' }
    & node (Join-Path $PSScriptRoot 'build-companions.mjs')
    if ($LASTEXITCODE -ne 0) { throw "Portable companion packaging exited $LASTEXITCODE." }
    Write-Host 'Producing an unsigned Squirrel.Windows installer.'
    & npm.cmd run package --workspace apps/desktop
    if ($LASTEXITCODE -ne 0) { throw "Installer packaging exited $LASTEXITCODE." }
    $files = @(Get-SquirrelPayload (Join-Path $root 'apps/desktop/release/squirrel-windows'))
    $distribution = Join-Path $root 'apps/desktop/release'
    foreach ($file in $files) { Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $distribution $file.Name) }
    $source = $env:GITHUB_SHA
    if (-not $source -and (Get-Command git -ErrorAction SilentlyContinue)) { $source = & git rev-parse HEAD; if ($LASTEXITCODE -ne 0) { $source = $null } }
    $receipt = @{ source=$source; sourceDirectory='apps/desktop/release/squirrel-windows'; files=@($files | ForEach-Object { @{ name=$_.Name; bytes=$_.Length; sha256=(Get-FileHash -LiteralPath (Join-Path $distribution $_.Name) -Algorithm SHA256).Hash.ToLowerInvariant() } }) }
    $receipt | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $distribution 'squirrel-payload.json')
    $receipt.files | Format-Table name,bytes,sha256
  } elseif ($runAfter -or (-not $silent -and (Read-Host 'Build succeeded. Run the desktop client? [y/N]') -match '^[yY]$')) {
    & npm.cmd start --workspace apps/desktop
    if ($LASTEXITCODE -ne 0) { throw "Desktop exited $LASTEXITCODE." }
  }
  exit 0
} catch { Write-Error $_; exit 1 }
