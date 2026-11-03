$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'hosting/context.ps1')
function Reject([scriptblock]$Action){try{& $Action;throw 'UNEXPECTED_ACCEPTANCE'}catch{if($_.Exception.Message -eq 'UNEXPECTED_ACCEPTANCE'){throw}}}
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$other=[IO.Path]::GetFullPath((Join-Path $root '..'))
$records=@([pscustomobject]@{project='existing-fleet';workingDirectory=$root})
if((Select-HostProject $records $root '') -ne 'existing-fleet'){throw 'Existing project was not retained.'}
Reject {Select-HostProject $records $root 'new-fleet'}
Reject {Select-HostProject $records $other 'existing-fleet'}
Reject {Select-HostProject @([pscustomobject]@{project='unknown-fleet';workingDirectory=''}) $root 'unknown-fleet'}
Reject {Select-HostProject @($records[0],[pscustomobject]@{project='second-fleet';workingDirectory=$root}) $root ''}
Assert-HostAddress 'fleet.lan' '8443'
foreach($value in @('localhost','127.0.0.1','0.0.0.0','host&command','https://host')){Reject {Assert-HostAddress $value '8443'}}
foreach($value in @('0','65536','8443&command')){Reject {Assert-HostAddress 'fleet.lan' $value}}
Reject {Get-HostOptions @('--non-interactive','--trust-current-user') $root}
Reject {Get-HostOptions @('--detached','--logs') $root}
Reject {Get-HostOptions @('--release','../other') $root}
$quoted=ConvertTo-NativeArgument 'C:\folder with space\'
if($quoted -ne '"C:\folder with space\\"'){throw 'Trailing slash quoting is incorrect.'}
Write-Host 'PASS: exact project preservation, ambiguity and foreign ownership rejection, address/port validation, native argument quoting and unattended trust refusal.'
