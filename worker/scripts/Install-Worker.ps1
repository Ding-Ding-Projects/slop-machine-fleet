[CmdletBinding()]
param([Parameter(Mandatory)][string]$Executable,[Parameter(Mandatory)][string]$Configuration,[string]$AccountName='FleetWorker')
$ErrorActionPreference='Stop'
if (!( [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Run this reviewed provisioning script through native elevation consent.' }
if ($AccountName -notmatch '^[A-Za-z][A-Za-z0-9_-]{1,19}$') { throw 'Invalid dedicated account name' }
$Executable=(Resolve-Path -LiteralPath $Executable).Path
$Configuration=(Resolve-Path -LiteralPath $Configuration).Path
if (Get-Service -Name SlopMachineFleetWorker -ErrorAction SilentlyContinue) { throw 'Existing installation detected. Stop and use the reviewed upgrade route; no replacement was performed.' }
$account=Get-LocalUser -Name $AccountName -ErrorAction SilentlyContinue
if (!$account) {
    $password=Read-Host 'Set a dedicated worker service password' -AsSecureString
    $account=New-LocalUser -Name $AccountName -Password $password -Description 'Dedicated fleet worker service identity'
    $password.Dispose()
}
$admins=Get-LocalGroup -SID 'S-1-5-32-544'
if (Get-LocalGroupMember -Group $admins | Where-Object SID -EQ $account.SID) { throw 'The worker account must not be an administrator' }
$credentials=Get-Credential -UserName "$env:COMPUTERNAME\$AccountName" -Message 'Service identity, credentials stay in the native credential object'
if ($credentials.UserName -ne "$env:COMPUTERNAME\$AccountName") { throw 'Unexpected service identity' }
# New-Service gives the SCM the credential directly. Never print or export it.
New-Service -Name SlopMachineFleetWorker -DisplayName 'Slop Machine Fleet Worker' -BinaryPathName "`"$Executable`" --worker-config=`"$Configuration`"" -Credential $credentials -StartupType Automatic | Out-Null
Write-Output 'Service registered. Grant this identity Log on as a service using the supported host policy, grant read access to enrollment files and modify access to its data folder, then start and verify mTLS readiness. No authentication is claimed.'
