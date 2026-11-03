$ErrorActionPreference = 'Stop'
$sdkVersion = '8.0.424'
$sdkReady = $false
if (Get-Command dotnet -ErrorAction SilentlyContinue) { $sdkReady = @(& dotnet --list-sdks | Where-Object { $_ -match "^$([regex]::Escape($sdkVersion)) " }).Count -gt 0 }
if (-not $sdkReady) {
  if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64') { throw 'Automatic .NET bootstrap currently supports Windows x64 only.' }
  $tools = Join-Path $env:LOCALAPPDATA 'SlopMachineFleet\tools'
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
