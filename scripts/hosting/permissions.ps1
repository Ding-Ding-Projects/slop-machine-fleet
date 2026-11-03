  $identitySid = [Security.Principal.WindowsIdentity]::GetCurrent().User
  $systemSid = New-Object Security.Principal.SecurityIdentifier('S-1-5-18')
  function Protect-LocalPath([string]$Target) {
    $phase = 'inspect path'; $category = 'configuration path'
    try {
      $item = Get-Item -LiteralPath $Target -Force
      if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Local configuration cannot contain symbolic links or junctions.' }
      $category = if ($item.PSIsContainer) { 'configuration directory' } else { 'configuration file' }
      $phase = 'read owner and group'
      $metadata = [Security.AccessControl.AccessControlSections]::Owner -bor [Security.AccessControl.AccessControlSections]::Group
      $before = if ($item.PSIsContainer) { [IO.Directory]::GetAccessControl($Target,$metadata) } else { [IO.File]::GetAccessControl($Target,$metadata) }
      $owner = $before.GetOwner([Security.Principal.SecurityIdentifier]).Value
      $group = $before.GetGroup([Security.Principal.SecurityIdentifier]).Value
      $phase = 'prepare DACL'
      # A fresh descriptor marks only access rules as modified; owner, group and audit are not written.
      $acl = if ($item.PSIsContainer) { New-Object Security.AccessControl.DirectorySecurity } else { New-Object Security.AccessControl.FileSecurity }
      $acl.SetAccessRuleProtection($true, $false)
      foreach ($sid in @($identitySid,$systemSid)) {
        if ($item.PSIsContainer) { $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow') }
        else { $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','Allow') }
        $acl.AddAccessRule($rule)
      }
      $phase = 'persist DACL'
      if ($item.PSIsContainer) { [IO.Directory]::SetAccessControl($Target,$acl) } else { [IO.File]::SetAccessControl($Target,$acl) }
      $phase = 'read back DACL and metadata'
      $sections = $metadata -bor [Security.AccessControl.AccessControlSections]::Access
      $verified = if ($item.PSIsContainer) { [IO.Directory]::GetAccessControl($Target,$sections) } else { [IO.File]::GetAccessControl($Target,$sections) }
      $rules = @($verified.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
      $expectedInheritance = if ($item.PSIsContainer) { [Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit' } else { [Security.AccessControl.InheritanceFlags]::None }
      if (-not $verified.AreAccessRulesProtected -or $rules.Count -ne 2 -or $verified.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $owner -or $verified.GetGroup([Security.Principal.SecurityIdentifier]).Value -ne $group) { throw 'Local configuration permissions or owner/group preservation did not verify.' }
      foreach ($sid in @($identitySid,$systemSid)) {
        $matching = @($rules | Where-Object { $_.IdentityReference.Value -eq $sid.Value -and $_.AccessControlType -eq 'Allow' -and $_.FileSystemRights -eq [Security.AccessControl.FileSystemRights]::FullControl -and -not $_.IsInherited -and $_.InheritanceFlags -eq $expectedInheritance -and $_.PropagationFlags -eq [Security.AccessControl.PropagationFlags]::None })
        if ($matching.Count -ne 1) { throw 'Local configuration requires exactly the current identity and SYSTEM with explicit full control.' }
      }
    } catch {
      throw ('Local permissions failed during {0} for {1}: {2}, HRESULT 0x{3:X8}.' -f $phase,$category,$_.Exception.GetType().FullName,$_.Exception.HResult)
    }
  }
