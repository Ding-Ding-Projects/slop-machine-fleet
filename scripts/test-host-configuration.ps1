$ErrorActionPreference='Stop'
if($PSVersionTable.PSEdition -ne 'Desktop'){throw 'Use Windows PowerShell 5.1 for this filesystem permission check.'}
. (Join-Path $PSScriptRoot 'hosting/context.ps1')
. (Join-Path $PSScriptRoot 'hosting/permissions.ps1')
. (Join-Path $PSScriptRoot 'hosting/runtime.ps1')
$directory=Join-Path ([IO.Path]::GetTempPath()) ('fleet-host-config-'+[guid]::NewGuid().ToString('N'))
$null=New-Item -ItemType Directory -Path $directory;Protect-LocalPath $directory
$local=Join-Path $directory 'local';$null=New-Item -ItemType Directory -Path $local;Protect-LocalPath $local
$file=Join-Path $directory '.env';$original="UNRELATED_SETTING=keep-this`r`nFLEET_HOST=old.lan`r`n";[IO.File]::WriteAllText($file,$original)
try{
  $lock=Enter-HostLock $local
  try{try{$second=Enter-HostLock $local;$second.Dispose();throw 'CONCURRENT_LOCK_ACCEPTED'}catch{if($_.Exception.Message -eq 'CONCURRENT_LOCK_ACCEPTED'){throw}}}finally{$lock.Dispose()}
  Save-HostEnvironment $file @{FLEET_HOST='fleet.lan';FLEET_HTTPS_PORT='8443';COMPOSE_PROJECT_NAME='existing-fleet'} $local
  $stored=[IO.File]::ReadAllText($file)
  if(-not $stored.Contains('UNRELATED_SETTING=keep-this') -or -not $stored.Contains('FLEET_HOST=fleet.lan')){throw 'Configuration preservation failed.'}
  $backups=@(Get-ChildItem -LiteralPath $local -File | Where-Object Name -like 'environment-before-*')
  if($backups.Count -ne 1 -or [IO.File]::ReadAllText($backups[0].FullName) -cne $original){throw 'Prior configuration backup did not preserve exact bytes.'}
  try{Save-HostEnvironment $file @{UNRELATED_SETTING='replace'} $local;throw 'FOREIGN_KEY_ACCEPTED'}catch{if($_.Exception.Message -eq 'FOREIGN_KEY_ACCEPTED'){throw}}
  if([IO.File]::ReadAllText($file) -cne $stored){throw 'Rejected edit changed configuration.'}
  Write-Host 'PASS: exclusive deployment ownership, atomic selected-key update, exact prior backup, unrelated values preserved and unsupported-key rejection.'
}finally{Get-ChildItem -LiteralPath $local -File | ForEach-Object {[IO.File]::Delete($_.FullName)};if(Test-Path -LiteralPath $file){[IO.File]::Delete($file)};[IO.Directory]::Delete($local);[IO.Directory]::Delete($directory)}
