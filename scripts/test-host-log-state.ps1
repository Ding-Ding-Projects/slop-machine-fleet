$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'hosting/runtime.ps1')
$cache=@{service=@{text='controller fixture';observedAt='fixture-time'}}
if((Get-HostLogSnapshot $cache 'service').text -cne 'controller fixture'){throw 'The selected service snapshot disappeared.'}
if($null -ne (Get-HostLogSnapshot $cache 'gateway')){throw 'Paused selection exposed another service snapshot.'}
$cache.gateway=@{text='gateway fixture';observedAt='other-fixture-time'}
if((Get-HostLogSnapshot $cache 'gateway').text -cne 'gateway fixture'){throw 'Service snapshots were mixed.'}
$report=@{url='https://fleet.invalid:8443/';source='fixture-source';version='0.2.1';image='fixture-image';signup='available'}
$text=(Show-HostSummary $report 6>&1 | Out-String)
foreach($required in @($report.url,$report.source,$report.version,'.local/hosting-context.json','username/password signup')){if(-not $text.Contains($required)){throw 'The persistent hosting summary omitted required evidence.'}}
Write-Host 'PASS: paused per-service log state and persistent URL/source/version/evidence/signup summary. No console clearing, key input or container operation ran.'
