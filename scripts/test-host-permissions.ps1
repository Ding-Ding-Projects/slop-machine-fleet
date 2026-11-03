$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSEdition -ne 'Desktop') { throw 'Run this host-entrypoint regression with Windows PowerShell 5.1.' }
$ast = [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'host.ps1'),[ref]$null,[ref]$null)
$function = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Protect-LocalPath' },$true)
if (-not $function) { throw 'The production permission function is missing.' }
. ([scriptblock]::Create($function.Extent.Text))
$identitySid = [Security.Principal.WindowsIdentity]::GetCurrent().User
$systemSid = New-Object Security.Principal.SecurityIdentifier('S-1-5-18')
$directory = Join-Path ([IO.Path]::GetTempPath()) ('fleet-host-permissions-' + [guid]::NewGuid())
[IO.Directory]::CreateDirectory($directory) | Out-Null
$file = Join-Path $directory 'existing-data.txt'
[IO.File]::WriteAllText($file,'Existing sample bytes remain unchanged.')
$original = [IO.File]::ReadAllBytes($file)
$sections = [Security.AccessControl.AccessControlSections]::Owner -bor [Security.AccessControl.AccessControlSections]::Group -bor [Security.AccessControl.AccessControlSections]::Access
try {
  foreach ($target in @($directory,$file)) {
    $isDirectory = [IO.Directory]::Exists($target)
    $before = if ($isDirectory) { [IO.Directory]::GetAccessControl($target,$sections) } else { [IO.File]::GetAccessControl($target,$sections) }
    $owner = $before.GetOwner([Security.Principal.SecurityIdentifier]).Value
    $group = $before.GetGroup([Security.Principal.SecurityIdentifier]).Value
    Protect-LocalPath $target
    $after = if ($isDirectory) { [IO.Directory]::GetAccessControl($target,$sections) } else { [IO.File]::GetAccessControl($target,$sections) }
    if ($after.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $owner -or $after.GetGroup([Security.Principal.SecurityIdentifier]).Value -ne $group) { throw 'Owner or group changed.' }
    $rules = @($after.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
    if (-not $after.AreAccessRulesProtected -or $rules.Count -ne 2) { throw 'Expected exactly two protected DACL rules.' }
    foreach ($sid in @($identitySid,$systemSid)) {
      if (@($rules | Where-Object { $_.IdentityReference.Value -eq $sid.Value -and $_.AccessControlType -eq 'Allow' -and $_.FileSystemRights -eq [Security.AccessControl.FileSystemRights]::FullControl -and -not $_.IsInherited }).Count -ne 1) { throw 'DACL identities or rights changed.' }
    }
    Protect-LocalPath $target
  }
  if ([Convert]::ToBase64String([IO.File]::ReadAllBytes($file)) -ne [Convert]::ToBase64String($original)) { throw 'Existing file bytes changed.' }
  try { Protect-LocalPath (Join-Path $directory 'missing.txt'); throw 'MISSING_PATH_ACCEPTED' }
  catch { if ($_.Exception.Message -eq 'MISSING_PATH_ACCEPTED' -or $_.Exception.Message -notlike 'Local permissions failed during inspect path for configuration path:*HRESULT*') { throw } }
  Write-Host 'PASS: production DACL-only directory/file persistence, exact identity rights, owner/group preservation, repeat application and existing bytes verified on Windows PowerShell.'
  Write-Host 'No audit section was requested for persistence; audit equality was not independently read. The original host-target privilege failure was not universally reproduced by this owned-directory regression.'
} finally {
  if ([IO.File]::Exists($file)) { [IO.File]::Delete($file) }
  if ([IO.Directory]::Exists($directory)) { [IO.Directory]::Delete($directory) }
}
