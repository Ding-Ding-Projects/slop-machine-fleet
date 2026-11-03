$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'hosting/runtime.ps1')
$directory=Join-Path ([IO.Path]::GetTempPath()) ('fleet-backup-fixture-'+[guid]::NewGuid().ToString('N'));$null=New-Item -ItemType Directory -Path $directory
$context=[pscustomobject]@{Project='existing-fleet';DockerContext='fixture';Docker='fixture-only';Environment=@{}}
$record=[pscustomobject]@{id='123456789abc';project='existing-fleet';service='database'}
$script:commands=@();$script:receipt=$null
function Invoke-HostCompose {throw 'Preservation must not recreate the database through Compose.'}
function Invoke-HostDocker {param($Context,$Arguments,$TimeoutSeconds);$script:commands+=($Arguments -join ' ');if($Arguments[0] -eq 'inspect'){return 'false'};if($Arguments[0] -in @('start','exec')){return 'ready'};throw 'Unexpected fixture command.'}
function Invoke-HostCommand {param($Executable,$Arguments,$TimeoutSeconds,$Environment,$OutputFile);if($Arguments[2] -cne 'exec' -or $Arguments[3] -cne '123456789abc' -or $Arguments[4] -cne 'pg_dump'){throw 'Backup did not use the original exact container.'};[IO.File]::WriteAllBytes($OutputFile,[byte[]](1,2,3))}
function Save-HostJson {param($File,$Value);$script:receipt=$Value}
try{
  $file=Save-HostDatabase $context @($record) $directory
  if(-not (Test-Path -LiteralPath $file) -or -not $script:receipt.complete -or $script:receipt.restoreVerified){throw 'Backup evidence was misrepresented.'}
  if($script:commands[1] -cne 'start 123456789abc'){throw 'Stopped original container was not preserved.'}
  $record.id='';try{Save-HostDatabase $context @($record) $directory;throw 'MISSING_CONTAINER_ACCEPTED'}catch{if($_.Exception.Message -eq 'MISSING_CONTAINER_ACCEPTED'){throw}}
  Write-Host 'PASS: original-container-only database start/readiness/dump, no Compose replacement before backup, and missing container rejection. All container commands were fixtures.'
}finally{Get-ChildItem -LiteralPath $directory -File | ForEach-Object {[IO.File]::Delete($_.FullName)};[IO.Directory]::Delete($directory)}
