param([switch]$DefineCacheFunctionsOnly)
$ErrorActionPreference = 'Stop'
function Assert-FleetBuildCacheRoot([string]$Candidate, [string]$LocalApplicationData = $env:LOCALAPPDATA) {
  if (-not $LocalApplicationData -or -not [IO.Path]::IsPathRooted($LocalApplicationData) -or -not [IO.Path]::IsPathRooted($Candidate)) { throw 'Build cache locations must be absolute user-scoped paths.' }
  $base = [IO.Path]::GetFullPath($LocalApplicationData).TrimEnd([char[]]@('\','/'))
  $resolved = [IO.Path]::GetFullPath($Candidate).TrimEnd([char[]]@('\','/'))
  $installation = Join-Path $base 'SlopMachineFleet'
  if ($resolved.Equals($installation, [StringComparison]::OrdinalIgnoreCase) -or $resolved.StartsWith($installation + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Build tools cannot be stored inside the application installation.' }
  if (-not $resolved.StartsWith($base + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Build cache must remain inside the current local application-data directory.' }
  $cursor = $resolved
  while (-not $cursor.Equals($base, [StringComparison]::OrdinalIgnoreCase)) {
    if (Test-Path -LiteralPath $cursor) {
      $entry = Get-Item -LiteralPath $cursor -Force
      if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Build cache paths cannot contain symbolic links or junctions.' }
    }
    $cursor = [IO.Path]::GetDirectoryName($cursor)
  }
  return $resolved
}
function Get-FleetBuildToolsRoot {
  return Assert-FleetBuildCacheRoot (Join-Path $env:LOCALAPPDATA 'DingDingProjects\SlopMachineFleetBuildTools')
}
function Test-FleetBuildToolPath([string]$Executable) {
  if (-not $Executable -or -not [IO.Path]::IsPathRooted($Executable)) { return $false }
  $installation = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'SlopMachineFleet')).TrimEnd([char[]]@('\','/'))
  $resolved = [IO.Path]::GetFullPath($Executable)
  return -not ($resolved.Equals($installation, [StringComparison]::OrdinalIgnoreCase) -or $resolved.StartsWith($installation + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase))
}
if ($DefineCacheFunctionsOnly) { return }
$sdkVersion = '8.0.424'
$sdkReady = $false
$dotnet = Get-Command dotnet -ErrorAction SilentlyContinue
if ($dotnet -and (Test-FleetBuildToolPath $dotnet.Source)) { $sdkReady = @(& dotnet --list-sdks | Where-Object { $_ -match "^$([regex]::Escape($sdkVersion)) " }).Count -gt 0 }
if (-not $sdkReady) {
  if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64') { throw 'Automatic .NET bootstrap currently supports Windows x64 only.' }
  $tools = Get-FleetBuildToolsRoot
  $sdkHome = Join-Path $tools "dotnet-$sdkVersion"
  New-Item -ItemType Directory -Force $sdkHome | Out-Null
  $metadata = Invoke-RestMethod 'https://builds.dotnet.microsoft.com/dotnet/release-metadata/8.0/releases.json'
  $sdk = @($metadata.releases | ForEach-Object { $_.sdks } | Where-Object version -eq $sdkVersion | Select-Object -First 1)
  $download = @($sdk.files | Where-Object { $_.rid -eq 'win-x64' -and $_.name -like '*.zip' })
  if ($download.Count -ne 1 -or $download[0].url -notmatch '^https://(builds\.dotnet\.microsoft\.com|download\.visualstudio\.microsoft\.com)/' -or $download[0].hash -notmatch '^[a-fA-F0-9]{128}$') { throw 'The pinned .NET SDK release metadata is unavailable or invalid.' }
  $archive = Join-Path $tools "dotnet-sdk-$sdkVersion-win-x64.zip"
  if (-not (Test-Path $archive) -or (Get-FileHash $archive -Algorithm SHA512).Hash -ne $download[0].hash) { Invoke-WebRequest $download[0].url -OutFile $archive -UseBasicParsing }
  if ((Get-FileHash $archive -Algorithm SHA512).Hash -ne $download[0].hash) { throw '.NET SDK download checksum mismatch.' }
  Expand-Archive -LiteralPath $archive -DestinationPath $sdkHome -Force
  $env:PATH = "$sdkHome;$env:PATH"
}
& dotnet --version
if ($LASTEXITCODE -ne 0) { throw '.NET SDK verification failed.' }
