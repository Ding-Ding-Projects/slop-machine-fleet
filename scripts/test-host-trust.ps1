$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'hosting/trust.ps1')
$fingerprint='A'*64;$options=@{Fingerprint='';NonInteractive=$true;Trust=$false}
if((Get-HostTrustAction $fingerprint $true $options) -ne 'reuse'){throw 'Exact existing trust was not reused.'}
if((Get-HostTrustAction $fingerprint $false $options) -ne 'pending'){throw 'Unattended new trust was not left pending.'}
$options.NonInteractive=$false
if((Get-HostTrustAction $fingerprint $false $options) -ne 'request'){throw 'New trust did not require an explicit choice.'}
$options.Fingerprint='B'*64
try{Get-HostTrustAction $fingerprint $true $options;throw 'MISMATCH_ACCEPTED'}catch{if($_.Exception.Message -eq 'MISMATCH_ACCEPTED'){throw}}
Write-Host 'PASS: existing exact trust reuse, unattended pending state, attended choice and approval fingerprint mismatch. No certificate store mutation or native prompt occurred.'
