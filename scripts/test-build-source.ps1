$ErrorActionPreference = 'Stop'
$ast = [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'build.ps1'),[ref]$null,[ref]$null)
$function = $ast.Find({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Get-FleetBuildSource'},$true)
if (-not $function) { throw 'The production build-source resolver is missing.' }
. ([scriptblock]::Create($function.Extent.Text))
$directory = Join-Path ([IO.Path]::GetTempPath()) ('fleet-source-receipt-' + [guid]::NewGuid())
[IO.Directory]::CreateDirectory($directory) | Out-Null
$previous = $env:GITHUB_SHA
try {
  $env:GITHUB_SHA = 'b' * 40
  @{source=('a' * 40);mode='local-overlay';publishable=$false} | ConvertTo-Json | Set-Content (Join-Path $directory 'build-identity.json')
  if ((Get-FleetBuildSource $directory) -ne ('a' * 40)) { throw 'An explicit immutable overlay was relabelled with another checkout identity.' }
  Remove-Item -LiteralPath (Join-Path $directory 'build-identity.json')
  if ((Get-FleetBuildSource $directory) -ne $env:GITHUB_SHA) { throw 'Ordinary provider source resolution changed.' }
  Write-Host 'PASS: immutable overlay source takes priority over an unrelated environment/checkout source; ordinary provider fallback retained.'
} finally {
  $env:GITHUB_SHA = $previous
  if (Test-Path -LiteralPath (Join-Path $directory 'build-identity.json')) { Remove-Item -LiteralPath (Join-Path $directory 'build-identity.json') }
  [IO.Directory]::Delete($directory)
}
