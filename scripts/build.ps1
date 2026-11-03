param([switch]$Installer, [Parameter(ValueFromRemainingArguments=$true)][string[]]$Options)
$ErrorActionPreference = 'Stop'
$silent = $env:SILENT -eq '1' -or $Options -contains '/s' -or $Options -contains '--silent'
$root = Split-Path $PSScriptRoot -Parent
try {
  Set-Location -LiteralPath $root
  Write-Host 'Build uses user-scoped portable tools. Administrator rights are not required.'
  $nodeVersion = '22.16.0'
  $node = Get-Command node -ErrorAction SilentlyContinue
  $validNode = $false
  if ($node) { $major = & node -p 'Number(process.versions.node.split(".")[0])'; $validNode = $LASTEXITCODE -eq 0 -and [int]$major -ge 22 }
  if (-not $validNode) {
    if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64') { throw 'Automatic Node bootstrap currently supports Windows x64 only.' }
    $tools = Join-Path $env:LOCALAPPDATA 'SlopMachineFleet\tools'
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
  if ($LASTEXITCODE -ne 0) { throw 'Node verification failed.' }
  if (Test-Path package-lock.json) { & npm.cmd ci --no-audit --no-fund } else { & npm.cmd install --no-audit --no-fund }
  if ($LASTEXITCODE -ne 0) { throw "Dependency acquisition exited $LASTEXITCODE." }
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw "Build exited $LASTEXITCODE." }
  if ($Installer) {
    Write-Host 'Producing an unsigned Squirrel.Windows installer.'
    & npm.cmd run package --workspace apps/desktop
    if ($LASTEXITCODE -ne 0) { throw "Installer packaging exited $LASTEXITCODE." }
    $files = @(Get-ChildItem 'apps/desktop/release' -File | Where-Object { $_.Name -match '(Setup\.exe|\.nupkg|RELEASES)$' })
    if (-not ($files | Where-Object { $_.Name -match 'Setup\.exe$' }) -or -not ($files | Where-Object Extension -eq '.nupkg') -or -not ($files | Where-Object Name -eq 'RELEASES')) { throw 'Squirrel installer payload is incomplete.' }
    $files | ForEach-Object { if ($_.Length -le 0) { throw 'Empty installer payload.' }; Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256 }
  } elseif (-not $silent) {
    if ((Read-Host 'Build succeeded. Run the desktop client? [y/N]') -match '^[yY]$') { & npm.cmd start --workspace apps/desktop; if ($LASTEXITCODE -ne 0) { throw "Desktop exited $LASTEXITCODE." } }
  }
  exit 0
} catch { Write-Error $_; exit 1 }
