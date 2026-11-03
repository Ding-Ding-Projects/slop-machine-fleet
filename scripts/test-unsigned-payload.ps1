$ErrorActionPreference = 'Stop'
$ast = [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'verify-release-versions.ps1'),[ref]$null,[ref]$null)
$function = $ast.Find({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Assert-FleetUnsignedPayload'},$true)
if (-not $function) { throw 'Actual unsigned-payload assertion is missing.' }
. ([scriptblock]::Create($function.Extent.Text))
$result = Assert-FleetUnsignedPayload 'fixture.exe' {param($Target) [pscustomobject]@{Status='NotSigned';SignerCertificate=$null}}
if ($result.status -ne 'NotSigned' -or $result.hasSignerCertificate) { throw 'Unsigned fixture classification changed.' }
foreach ($case in @(@{Status='Valid';SignerCertificate=@{}},@{Status='UnknownError';SignerCertificate=$null},@{Status='NotSigned';SignerCertificate=@{}})) {
  $reader = {param($Target) [pscustomobject]$case}.GetNewClosure()
  try { $null=Assert-FleetUnsignedPayload 'fixture.exe' $reader; throw 'INVALID_SIGNATURE_ACCEPTED' }
  catch { if ($_.Exception.Message -eq 'INVALID_SIGNATURE_ACCEPTED') { throw } }
}
Write-Host 'PASS: expected unsigned status accepted; signed, unknown and inconsistent signature status blocked without changing trust or signing.'
