param([Parameter(Mandatory=$true)][string]$ExistingFile, [Parameter(Mandatory=$true)][string]$ReplacementFile)
$ErrorActionPreference = 'Stop'
try {
  $prior = Get-Acl -LiteralPath $ExistingFile
  Set-Acl -LiteralPath $ReplacementFile -AclObject $prior
  $actual = Get-Acl -LiteralPath $ReplacementFile
  if ($actual.Sddl -ne $prior.Sddl) { exit 1 }
  exit 0
} catch { exit 1 }
