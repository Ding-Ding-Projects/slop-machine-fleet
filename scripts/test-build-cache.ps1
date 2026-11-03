$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'dotnet.ps1') -DefineCacheFunctionsOnly
$originalPath = $env:PATH
$base = [IO.Path]::GetFullPath($env:LOCALAPPDATA)
$expected = Join-Path $base 'DingDingProjects\SlopMachineFleetBuildTools'
$actual = Get-FleetBuildToolsRoot
if ($actual -ne $expected) { throw 'Node and .NET build cache resolution differs from the dedicated user build-tools location.' }
$rejected = 0
foreach ($candidate in @(
  (Join-Path $base 'SlopMachineFleet'),
  (Join-Path $base 'SlopMachineFleet\tools'),
  (Join-Path $base 'sLoPmAcHiNeFlEeT\tools\node'),
  (Join-Path $expected '..\..\SlopMachineFleet\tools'),
  ([IO.Path]::GetPathRoot($base))
)) {
  try { $null = Assert-FleetBuildCacheRoot $candidate; throw 'UNEXPECTED_CACHE_ACCEPTANCE' }
  catch { if ($_.Exception.Message -eq 'UNEXPECTED_CACHE_ACCEPTANCE') { throw }; $rejected++ }
}
$sibling = Join-Path $base 'SlopMachineFleetBuildToolsSibling'
if ((Assert-FleetBuildCacheRoot $sibling) -ne $sibling) { throw 'The containment check incorrectly rejects a separate sibling directory.' }
foreach ($tool in @('node.exe','dotnet.exe')) {
  if (Test-FleetBuildToolPath (Join-Path $base "SlopMachineFleet\tools\$tool")) { throw 'An installation-owned legacy runtime was selected for reuse.' }
  if (-not (Test-FleetBuildToolPath (Join-Path $actual $tool))) { throw 'A separately cached runtime cannot be reused.' }
}
if ($env:PATH -cne $originalPath) { throw 'Cache resolution changed the process search path.' }
Write-Host "PASS: dedicated build cache accepted; $rejected installation-contained or non-user paths rejected; legacy runtime reuse rejected; sibling boundary and PATH preservation verified."
