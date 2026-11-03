function Get-ExistingHostProjects([object]$Context) {
  $ids=Invoke-HostDocker $Context @('ps','-a','--filter','label=com.docker.compose.project','--format','{{.ID}}') 30
  $records=@()
  foreach($id in @($ids -split '\r?\n' | Where-Object {$_})){if($id -notmatch '^[a-f0-9]{12,64}$'){throw 'Invalid container inventory.'};$labels=Invoke-HostDocker $Context @('inspect','--format','{{json .Config.Labels}}',$id) 30 | ConvertFrom-Json;$records+=[pscustomobject]@{id=$id;project=$labels.'com.docker.compose.project';workingDirectory=$labels.'com.docker.compose.project.working_dir';service=$labels.'com.docker.compose.service'}}
  return $records
}
function Save-HostJson([string]$File,[object]$Value) {
  $temporary=$File+'.'+[guid]::NewGuid().ToString('N')+'.tmp'
  try{[IO.File]::WriteAllText($temporary,'');Protect-LocalPath $temporary;[IO.File]::WriteAllText($temporary,($Value | ConvertTo-Json -Depth 12),[Text.UTF8Encoding]::new($false));if(Test-Path -LiteralPath $File){[IO.File]::Replace($temporary,$File,$null)}else{[IO.File]::Move($temporary,$File)};Protect-LocalPath $File}finally{if(Test-Path -LiteralPath $temporary){[IO.File]::Delete($temporary)}}
}
function Initialize-HostLocal([string]$Local) {
  $null=New-Item -ItemType Directory -Force -Path $Local;Protect-LocalPath $Local
  Get-ChildItem -LiteralPath $Local -Recurse -Force | ForEach-Object {Protect-LocalPath $_.FullName}
  foreach($name in @('database-password')){
    $file=Join-Path $Local $name
    if(-not (Test-Path -LiteralPath $file)){$bytes=New-Object byte[] 32;$rng=[Security.Cryptography.RandomNumberGenerator]::Create();try{$rng.GetBytes($bytes)}finally{$rng.Dispose()};[IO.File]::WriteAllText($file,([BitConverter]::ToString($bytes)).Replace('-','').ToLowerInvariant());Protect-LocalPath $file}
  }
  $databaseFile=Join-Path $Local 'database-url'
  if(-not (Test-Path -LiteralPath $databaseFile)){$value=[IO.File]::ReadAllText((Join-Path $Local 'database-password')).Trim();[IO.File]::WriteAllText($databaseFile,('postgresql://fleet:'+ $value+'@database:5432/fleet'));$value=$null;Protect-LocalPath $databaseFile}
  $null=New-Item -ItemType Directory -Force -Path (Join-Path $Local 'aws');Protect-LocalPath (Join-Path $Local 'aws')
}
function Save-HostDatabase([object]$Context,[object[]]$Existing,[string]$Local) {
  if(-not @($Existing | Where-Object {$_.project -eq $Context.Project -and $_.service -eq 'database'}).Count){return ''}
  Write-Host 'Preserving the existing database with its supported dump tool before updating services.'
  $null=Invoke-HostCompose $Context @('up','-d','--wait','--wait-timeout','120','database') 180
  $file=Join-Path $Local ('database-before-'+[DateTimeOffset]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')+'.dump')
  $arguments=(Get-HostComposeArguments $Context)+@('exec','-T','database','pg_dump','-U','fleet','-d','fleet','--format=custom')
  $null=Invoke-HostCommand $Context.Docker $arguments 180 $Context.Environment $file
  if((Get-Item -LiteralPath $file).Length -le 0){throw 'Database preservation produced no data. Services were not updated.'}
  Save-HostJson ($file+'.receipt.json') @{complete=$true;project=$Context.Project;createdAt=[DateTimeOffset]::UtcNow.ToString('o');tool='pg_dump';restoreVerified=$false}
  return $file
}
function Wait-HostHealth([string]$Url) {
  for($attempt=0;$attempt -lt 20;$attempt++){
    try{$result=Invoke-RestMethod -Uri ($Url+'api/health') -TimeoutSec 5;if($result.status -ceq 'ok'){return}}catch{}
    Start-Sleep -Seconds 2
  }
  throw 'Trusted HTTPS health did not verify within its bound. Running containers and preserved data remain available; no TLS validation was disabled.'
}
function Protect-HostLog([string]$Text) {
  $Text=[regex]::Replace($Text,'(?i)(?:https?|postgres(?:ql)?):\/\/[^\s/@]+:[^\s/@]+@[^\s]+','[protected connection]')
  $Text=[regex]::Replace($Text,'(?i)\b(password|token|secret|authorization|setup[-_ ]?code)\b\s*[:=]\s*\S+','[protected value]')
  return [regex]::Replace($Text,'\x1b\[[0-9;]*[A-Za-z]','')
}
function Show-HostLogs([object]$Context) {
  if([Console]::IsInputRedirected){throw 'Interactive logs need a keyboard console. Use --detached for unattended hosting.'}
  $services=@('service','gateway','database');$selected=0;$following=$true;$last=''
  while($true){
    if($following){$last=Protect-HostLog (Invoke-HostCompose $Context @('logs','--no-color','--tail','18',$services[$selected]) 20)}
    Clear-Host;Write-Host ('Fleet '+$Context.Project+' | '+$services[$selected]+' | follow: '+$following)
    Write-Host '[Left/Right] select service  [F] follow/pause  [R/Q/Escape] return, containers remain running'
    Write-Host (Invoke-HostCompose $Context @('ps') 20);Write-Host $last
    for($tick=0;$tick -lt 20;$tick++){
      if([Console]::KeyAvailable){$key=[Console]::ReadKey($true).Key;if($key -in @('Q','R','Escape')){return};if($key -eq 'LeftArrow'){$selected=($selected+2)%3;break};if($key -eq 'RightArrow'){$selected=($selected+1)%3;break};if($key -eq 'F'){$following=-not $following;break}}
      Start-Sleep -Milliseconds 100
    }
  }
}
