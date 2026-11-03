$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'hosting/context.ps1')
. (Join-Path $PSScriptRoot 'hosting/permissions.ps1')
$directory=Join-Path ([IO.Path]::GetTempPath()) ('fleet-command-fixture-'+[guid]::NewGuid().ToString('N'));$null=New-Item -ItemType Directory -Path $directory;Protect-LocalPath $directory
$script=Join-Path $directory 'echo.ps1';$binaryScript=Join-Path $directory 'binary.ps1';$output=Join-Path $directory 'bytes.bin'
$powershell=Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'
try{
  [IO.File]::WriteAllText($script,'param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Values)'+"`r`n"+'$Values | ConvertTo-Json -Compress')
  $actual=Invoke-HostCommand $powershell @('-NoProfile','-NonInteractive','-File',$script,'value with spaces','literal"quote','C:\trailing\') 15 | ConvertFrom-Json
  if($actual.Count -ne 3 -or $actual[0] -cne 'value with spaces' -or $actual[1] -cne 'literal"quote' -or $actual[2] -cne 'C:\trailing\'){throw 'Actual native argument transport changed an argument.'}
  [IO.File]::WriteAllText($binaryScript,'$bytes=[byte[]](0,1,128,255);$stream=[Console]::OpenStandardOutput();$stream.Write($bytes,0,$bytes.Length);$stream.Flush()')
  $null=Invoke-HostCommand $powershell @('-NoProfile','-NonInteractive','-File',$binaryScript) 15 @{} $output
  if([Convert]::ToBase64String([IO.File]::ReadAllBytes($output)) -cne 'AAGA/w=='){throw 'Binary backup transport changed bytes.'}
  Write-Host 'PASS: actual non-GUI native argument roundtrip and binary backup transport. Only owned PowerShell fixtures executed; no container, certificate or product operation ran.'
}finally{foreach($file in @($script,$binaryScript,$output)){if(Test-Path -LiteralPath $file){[IO.File]::Delete($file)}};[IO.Directory]::Delete($directory)}
