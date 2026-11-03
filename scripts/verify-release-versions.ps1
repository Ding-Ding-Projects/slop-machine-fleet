$ErrorActionPreference = 'Stop'
$env:PSModulePath = (Join-Path $PSHOME 'Modules') + ';' + (Join-Path $env:ProgramFiles 'WindowsPowerShell\Modules')
$root = Split-Path $PSScriptRoot -Parent
$version = (Get-Content (Join-Path $root 'apps/desktop/package.json') -Raw | ConvertFrom-Json).version
$identityFile = Join-Path $root 'build-identity.json'
$identity = if (Test-Path $identityFile) { Get-Content $identityFile -Raw | ConvertFrom-Json } else { @{ mode='local'; version=$version; publishable=$false } }
if ($identity.version -ne $version) { throw 'Release version receipt differs from the package producer.' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$squirrel = Join-Path $root 'apps/desktop/release/squirrel-windows'
$full = @(Get-ChildItem $squirrel -File -Filter '*-full.nupkg')
if ($full.Count -ne 1 -or $full[0].Name -ne "SlopMachineFleet-$version-full.nupkg") { throw 'Produced full package filename does not match the derived version.' }
$archive = [IO.Compression.ZipFile]::OpenRead($full[0].FullName)
try {
  $specs = @($archive.Entries | Where-Object FullName -like '*.nuspec')
  if ($specs.Count -ne 1) { throw 'Produced package metadata inventory is invalid.' }
  $reader = New-Object IO.StreamReader($specs[0].Open())
  try { [xml]$xml = $reader.ReadToEnd() } finally { $reader.Dispose() }
  $nodes = @($xml.SelectNodes("//*[local-name()='metadata']/*[local-name()='version']"))
  if ($nodes.Count -ne 1 -or $nodes[0].InnerText -ne $version) { throw 'Actual package metadata differs from its declared version.' }
} finally { $archive.Dispose() }
$feed = Get-Content (Join-Path $squirrel 'RELEASES') -Raw
if ($feed -notmatch [regex]::Escape($full[0].Name)) { throw 'Produced update feed does not reference the actual versioned full package.' }
$executables = @((Join-Path $root 'release/worker/Fleet.Worker.exe'))
foreach ($mode in @('build','host','docs')) { $executables += Join-Path $root "apps/desktop/release/companions/$mode/Fleet-$mode-$version.exe" }
$metadata = @()
foreach ($executable in $executables) {
  $info = [Diagnostics.FileVersionInfo]::GetVersionInfo($executable)
  if ($info.ProductVersion -ne $version -or $info.FileVersion -notin @($version,"$version.0")) { throw 'Actual worker or portable executable version differs from the common release identity.' }
  $metadata += @{ name=[IO.Path]::GetFileName($executable); productVersion=$info.ProductVersion; fileVersion=$info.FileVersion }
}
& node (Join-Path $PSScriptRoot 'verify-built-version.mjs')
if ($LASTEXITCODE) { throw 'Embedded renderer or application version verification failed.' }
$receipt = @{ schemaVersion=1; version=$version; identity=$identity; package=$full[0].Name; packageMetadataVersion=$nodes[0].InnerText; executables=$metadata; setupBootstrapVersion='Not used as product identity; the Squirrel package and installed application carry the product version.'; runtimeAcceptance='Not performed by metadata verification.' }
$receipt | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $root 'apps/desktop/release/produced-version-check.json')
Write-Host "Produced package, feed, executable and embedded version identity verified: $version."
