$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'hosting/context.ps1')
. (Join-Path $PSScriptRoot 'hosting/runtime.ps1')
function Reject([scriptblock]$Action){try{& $Action;throw 'UNEXPECTED_ACCEPTANCE'}catch{if($_.Exception.Message -eq 'UNEXPECTED_ACCEPTANCE'){throw}}}
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$context=[pscustomobject]@{Root=$root;EnvFile=(Join-Path $root '.env');Project='existing-fleet'}
$record=[pscustomobject]@{id='123456789abc';project='existing-fleet';service='database';workingDirectory=$root;configFiles=(Join-Path $root 'compose.yaml');environmentFile=''}
Assert-HostComposeOwnership $context @($record)
$record.configFiles+=','+(Join-Path $root 'override.yaml');Reject {Assert-HostComposeOwnership $context @($record)};$record.configFiles=Join-Path $root 'compose.yaml'
$record.environmentFile=Join-Path $root 'other.env';Reject {Assert-HostComposeOwnership $context @($record)};$record.environmentFile=$context.EnvFile
$script:resolved=@{services=@{database=@{volumes=@(@{type='volume';source='database';target='/var/lib/postgresql/data'})}};volumes=@{database=@{name='existing-fleet_database'}};secrets=@{database_password=@{file=(Join-Path $root '.local/database-password')};database_url=@{file=(Join-Path $root '.local/database-url')};worker_release=@{file=(Join-Path $root '.local/worker-release.json')}}}
$script:mounts=@(@{Type='volume';Name='existing-fleet_database';Destination='/var/lib/postgresql/data';RW=$true},@{Type='bind';Destination='/run/secrets/database_password';RW=$false})
function Invoke-HostCompose {param($Context,$Arguments,$TimeoutSeconds);if(($Arguments -join ' ') -ne 'config --format json'){throw 'Unexpected fixture command.'};$script:resolved | ConvertTo-Json -Depth 8 -Compress}
function Invoke-HostDocker {param($Context,$Arguments,$TimeoutSeconds);if($Arguments[0] -ne 'inspect'){throw 'Unexpected fixture command.'};$script:mounts | ConvertTo-Json -Depth 6 -Compress}
Assert-HostStorage $context @($record)
$script:mounts[0].Name='another_database';Reject {Assert-HostStorage $context @($record)};$script:mounts[0].Name='existing-fleet_database'
$script:resolved.services.database.volumes[0].type='bind';Reject {Assert-HostStorage $context @($record)};$script:resolved.services.database.volumes[0].type='volume'
$script:resolved.secrets.database_password.file=Join-Path $root 'foreign/password';Reject {Assert-HostStorage $context @($record)}
Write-Host 'PASS: actual recorded Compose file/environment set, Windows PowerShell JSON mount arrays and exact existing database volume. Overrides, foreign environment/secret paths and changed/bind data mounts are rejected without a container operation.'
