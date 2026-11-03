function Get-CertificateSha256([Security.Cryptography.X509Certificates.X509Certificate2]$Certificate) {
  $hash=[Security.Cryptography.SHA256]::Create();try{return ([BitConverter]::ToString($hash.ComputeHash($Certificate.RawData))).Replace('-','')}finally{$hash.Dispose()}
}
function Test-ExactCurrentUserTrust([string]$Fingerprint) {
  $store=New-Object Security.Cryptography.X509Certificates.X509Store('Root','CurrentUser')
  try{$store.Open([Security.Cryptography.X509Certificates.OpenFlags]::ReadOnly);return [bool]@($store.Certificates | Where-Object {(Get-CertificateSha256 $_) -ceq $Fingerprint}).Count}finally{$store.Close()}
}
function Get-HostTrustAction([string]$Fingerprint,[bool]$AlreadyTrusted,[object]$Options) {
  if($Fingerprint -notmatch '^[A-Fa-f0-9]{64}$'){throw 'Invalid gateway CA fingerprint.'}
  if($Options.Fingerprint -and $Options.Fingerprint -ine $Fingerprint){throw 'Gateway CA differs from the explicitly approved fingerprint. No trust changes were made.'}
  if($AlreadyTrusted){return 'reuse'}
  if($Options.NonInteractive){return 'pending'}
  return 'request'
}
function Confirm-HostTrust([object]$Context,[object]$Options,[string]$Local) {
  $file=Join-Path $Local 'gateway-root.crt'
  if(Test-Path -LiteralPath $file){Copy-Item -LiteralPath $file -Destination (Join-Path $Local ('gateway-root-before-'+[guid]::NewGuid().ToString('N')+'.crt'))}
  $null=Invoke-HostCompose $Context @('cp','gateway:/data/caddy/pki/authorities/local/root.crt',$file) 30
  Protect-LocalPath $file
  $certificate=New-Object Security.Cryptography.X509Certificates.X509Certificate2($file)
  try{
    if($certificate.HasPrivateKey -or $certificate.NotAfter -le (Get-Date) -or $certificate.NotBefore -gt (Get-Date)){throw 'Gateway certificate is not a current public CA certificate.'}
    $ca=@($certificate.Extensions | Where-Object {$_.Oid.Value -eq '2.5.29.19'})
    if($ca.Count -ne 1 -or -not $ca[0].CertificateAuthority){throw 'Gateway certificate is not a CA.'}
    $fingerprint=Get-CertificateSha256 $certificate
    $decision=Get-HostTrustAction $fingerprint (Test-ExactCurrentUserTrust $fingerprint) $Options
    if($decision -eq 'reuse'){Write-Host 'Exact gateway CA already trusted for the current user; no import performed.';return $fingerprint}
    Write-Host ('Gateway public CA SHA-256: '+$fingerprint)
    if($decision -eq 'pending'){throw 'Current-user CA trust is pending. Rerun attended with an explicit trust choice; running containers are preserved.'}
    $approve=$Options.Trust -and $Options.Fingerprint
    if(-not $approve){$entered=Read-Host 'To request native current-user trust, type the displayed SHA-256 fingerprint; press Enter to leave trust pending';$approve=$entered -ceq $fingerprint}
    if(-not $approve){throw 'CA trust remains pending. Running containers are preserved.'}
    # Deliberately no quiet/force flag. The operating system owns its native consent dialog.
    $certutil=Join-Path $env:WINDIR 'System32/certutil.exe'
    $null=Invoke-HostCommand $certutil @('-user','-addstore','Root',$file) 120
    if(-not (Test-ExactCurrentUserTrust $fingerprint)){throw 'Native certificate confirmation did not establish the exact current-user trust. No TLS exception is used.'}
    return $fingerprint
  }finally{$certificate.Dispose()}
}
