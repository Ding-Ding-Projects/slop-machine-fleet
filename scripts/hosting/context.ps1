function ConvertTo-NativeArgument([string]$Value) {
  if ($Value.IndexOf([char]0) -ge 0) { throw 'Native arguments cannot contain null characters.' }
  return '"' + [regex]::Replace([regex]::Replace($Value,'(\\*)"','$1$1\"'),'(\\+)$','$1$1') + '"'
}
function Invoke-HostCommand([string]$Executable,[string[]]$Arguments,[int]$TimeoutSeconds=180,[hashtable]$Environment=@{},[string]$OutputFile='') {
  $info=New-Object Diagnostics.ProcessStartInfo
  $info.FileName=$Executable; $info.Arguments=($Arguments | ForEach-Object { ConvertTo-NativeArgument $_ }) -join ' '
  $info.UseShellExecute=$false; $info.CreateNoWindow=$true; $info.RedirectStandardOutput=$true; $info.RedirectStandardError=$true
  foreach($key in $Environment.Keys){$info.EnvironmentVariables[$key]=[string]$Environment[$key]}
  $child=New-Object Diagnostics.Process; $child.StartInfo=$info
  $fileStream=$null;$started=$false
  try {
    if($OutputFile){$fileStream=[IO.File]::Open($OutputFile,[IO.FileMode]::CreateNew);Protect-LocalPath $OutputFile}
    if(-not $child.Start()){throw 'The required command did not start.'}
    $started=$true
    $output=if($fileStream){$child.StandardOutput.BaseStream.CopyToAsync($fileStream)}else{$child.StandardOutput.ReadToEndAsync()}; $errorOutput=$child.StandardError.ReadToEndAsync()
    if(-not $child.WaitForExit($TimeoutSeconds*1000)){try{$child.Kill();$null=$child.WaitForExit(5000)}catch{};throw 'The command exceeded its time limit. Running containers and completed effects were preserved.'}
    $text=$output.GetAwaiter().GetResult(); $discard=$errorOutput.GetAwaiter().GetResult(); $discard=$null
    if($child.ExitCode -ne 0){throw ('Required command exited {0}. No raw output containing configuration is displayed.' -f $child.ExitCode)}
    if($fileStream){$fileStream.Flush($true);return ''}
    if($text.Length -gt 1048576){throw 'Command output exceeded the supported bound.'}
    return $text.Trim()
  } finally {if($started){try{if(-not $child.HasExited){$child.Kill();$null=$child.WaitForExit(5000)}}catch{}};if($fileStream){$fileStream.Dispose()};$child.Dispose()}
}
function Get-HostOptions([string[]]$Values,[string]$DefaultRoot) {
  $result=@{Root=$DefaultRoot;Project='';Release='';HostName='';Port='';Mode='';NonInteractive=([Console]::IsInputRedirected -or $env:CI -eq 'true');Trust=$false;Fingerprint=''}
  $names=@{'--project-directory'='Root';'--project'='Project';'--release'='Release';'--host'='HostName';'--port'='Port';'--approve-ca'='Fingerprint'}
  for($i=0;$i -lt $Values.Count;$i++){
    $value=$Values[$i]
    if($names.ContainsKey($value)){if($i+1 -ge $Values.Count){throw 'An option value is missing.'};$i++;$result[$names[$value]]=$Values[$i];continue}
    switch($value){'--detached'{if($result.Mode -and $result.Mode -ne 'detached'){throw 'Select one hosting mode.'};$result.Mode='detached'} '--logs'{if($result.Mode -and $result.Mode -ne 'logs'){throw 'Select one hosting mode.'};$result.Mode='logs'} '--non-interactive'{$result.NonInteractive=$true} '--trust-current-user'{$result.Trust=$true} default{throw 'Unsupported hosting option. See deploy/hosting-automation.md.'}}
  }
  if($result.Release -and $result.Release -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'){throw 'Invalid release tag.'}
  if($result.Fingerprint -and $result.Fingerprint -notmatch '^[A-Fa-f0-9]{64}$'){throw 'A CA approval requires its exact SHA-256 fingerprint.'}
  if($result.NonInteractive -and $result.Trust){throw 'Certificate confirmation requires an attended run. Existing exact trust can be reused without this option.'}
  $result.Root=[IO.Path]::GetFullPath($result.Root)
  if(-not (Test-Path -LiteralPath (Join-Path $result.Root 'compose.yaml'))){throw 'The selected project directory has no compose.yaml.'}
  $package=Get-Content -LiteralPath (Join-Path $result.Root 'package.json') -Raw | ConvertFrom-Json
  if($package.name -cne 'slop-machine-fleet'){throw 'The selected directory is not the Fleet source project.'}
  return $result
}
function Read-HostEnvironment([string]$File) {
  $values=@{}
  if((Test-Path -LiteralPath $File) -and ((Get-Item -LiteralPath $File -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Environment configuration cannot be a symbolic link or junction.'}
  if(Test-Path -LiteralPath $File){foreach($line in [IO.File]::ReadAllLines($File)){if($line -match '^([A-Z][A-Z0-9_]*)=(.*)$'){if($values.ContainsKey($matches[1])){throw 'Duplicate environment settings require review.'};$values[$matches[1]]=$matches[2].Trim()}}}
  return $values
}
function Assert-HostAddress([string]$HostName,[string]$Port) {
  if($HostName.Length -gt 253 -or $HostName -notmatch '^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$' -or $HostName -match '^(localhost|127\.|0\.0\.0\.0$)' -or $Port -notmatch '^\d{1,5}$' -or [int]$Port -lt 1 -or [int]$Port -gt 65535){throw 'Enter a LAN hostname or IPv4 address and a port from 1 to 65535.'}
}
function Select-HostProject([object[]]$Records,[string]$Root,[string]$Requested) {
  $normalized=[IO.Path]::GetFullPath($Root).TrimEnd('\','/')
  $matching=@($Records | Where-Object {$_.workingDirectory -and [IO.Path]::GetFullPath($_.workingDirectory).TrimEnd('\','/') -eq $normalized})
  if($Requested){
    if($Requested -notmatch '^[a-z0-9][a-z0-9_-]{0,62}$'){throw 'Invalid Compose project identity.'}
    if(@($Records | Where-Object {$_.project -eq $Requested -and -not $_.workingDirectory}).Count){throw 'The named project has no verifiable source directory. Existing containers were retained.'}
    if(@($Records | Where-Object {$_.project -eq $Requested -and $_.workingDirectory -and [IO.Path]::GetFullPath($_.workingDirectory).TrimEnd('\','/') -ne $normalized}).Count){throw 'The named Compose project belongs to another directory. Select its actual project directory.'}
    if(@($matching | Where-Object {$_.project -ne $Requested}).Count){throw 'Another existing project uses this directory. Preserve it by selecting that exact project.'}
    return $Requested
  }
  $names=@($matching | Select-Object -ExpandProperty project -Unique)
  if($names.Count -gt 1){throw 'Multiple existing projects match this directory. Select --project explicitly.'}
  if($names.Count -eq 1){return $names[0]}
  return ''
}
function Invoke-HostDocker([object]$Context,[string[]]$Arguments,[int]$TimeoutSeconds=180) {
  Invoke-HostCommand $Context.Docker (@('--context',$Context.DockerContext)+$Arguments) $TimeoutSeconds
}
function Invoke-HostCompose([object]$Context,[string[]]$Arguments,[int]$TimeoutSeconds=180) {
  $prefix=Get-HostComposeArguments $Context
  Invoke-HostCommand $Context.Docker ($prefix+$Arguments) $TimeoutSeconds $Context.Environment
}
function Get-HostComposeArguments([object]$Context) {return @('--context',$Context.DockerContext,'compose','--project-directory',$Context.Root,'--env-file',$Context.EnvFile,'-f',(Join-Path $Context.Root 'compose.yaml'),'-p',$Context.Project)}
function Save-HostEnvironment([string]$File,[hashtable]$Values,[string]$Local) {
  $previous=if(Test-Path -LiteralPath $File){[IO.File]::ReadAllText($File)}else{$null};$body=if($null -eq $previous){''}else{$previous}
  foreach($key in $Values.Keys){if($key -notin @('FLEET_HOST','FLEET_HTTPS_PORT','FLEET_IMAGE','COMPOSE_PROJECT_NAME')){throw 'Unsupported managed configuration key.'};$value=[string]$Values[$key];if($value -match '[\r\n\x00]'){throw 'Invalid configuration value.'};$pattern='(?m)^'+[regex]::Escape($key)+'=.*$';if([regex]::IsMatch($body,$pattern)){$body=[regex]::Replace($body,$pattern,($key+'='+$value))}else{$body+="`r`n"+$key+'='+$value}}
  if($body -eq $previous){return}
  $temporary=Join-Path (Split-Path $File -Parent) ('.fleet-env-'+[guid]::NewGuid().ToString('N')+'.tmp')
  try{
    $stream=[IO.File]::Open($temporary,[IO.FileMode]::CreateNew);$stream.Dispose();Protect-LocalPath $temporary
    [IO.File]::WriteAllText($temporary,$body,[Text.UTF8Encoding]::new($false))
    $current=if(Test-Path -LiteralPath $File){[IO.File]::ReadAllText($File)}else{$null};if($current -cne $previous){throw 'Configuration changed concurrently; reload before retrying.'}
    if($null -ne $previous){$backup=Join-Path $Local ('environment-before-'+[guid]::NewGuid().ToString('N'));[IO.File]::Replace($temporary,$File,$backup);Protect-LocalPath $backup}else{[IO.File]::Move($temporary,$File)}
    Protect-LocalPath $File
  }finally{if(Test-Path -LiteralPath $temporary){[IO.File]::Delete($temporary)}}
}
