function Get-ExistingHostProjects([object]$Context) {
  $ids=Invoke-HostDocker $Context @('ps','-a','--filter','label=com.docker.compose.project','--format','{{.ID}}') 30
  $records=@()
  foreach($id in @($ids -split '\r?\n' | Where-Object {$_})){if($id -notmatch '^[a-f0-9]{12,64}$'){throw 'Invalid container inventory.'};$labels=Invoke-HostDocker $Context @('inspect','--format','{{json .Config.Labels}}',$id) 30 | ConvertFrom-Json;$records+=[pscustomobject]@{id=$id;project=$labels.'com.docker.compose.project';workingDirectory=$labels.'com.docker.compose.project.working_dir';configFiles=$labels.'com.docker.compose.project.config_files';environmentFile=$labels.'com.docker.compose.project.environment_file';service=$labels.'com.docker.compose.service'}}
  return $records
}
function Assert-HostComposeOwnership([object]$Context,[object[]]$Records) {
  $expected=[IO.Path]::GetFullPath((Join-Path $Context.Root 'compose.yaml'))
  foreach($record in @($Records | Where-Object {$_.project -eq $Context.Project})){
    if(-not $record.configFiles -or $record.configFiles.Contains(',') -or [IO.Path]::GetFullPath($record.configFiles) -ine $expected){throw 'Existing Compose overrides or different configuration files are unsupported by this entrypoint. They must be preserved and reviewed, never replaced with the default file.'}
    if($record.environmentFile -and ($record.environmentFile.Contains(',') -or [IO.Path]::GetFullPath($record.environmentFile) -ine [IO.Path]::GetFullPath($Context.EnvFile))){throw 'The existing project uses another environment file. That deployment is preserved; automatic replacement is unsupported.'}
  }
}
function Assert-HostDatabaseBinding([object]$Resolved,[object[]]$Mounts) {
  $data=@($Resolved.services.database.volumes | Where-Object target -eq '/var/lib/postgresql/data')
  if($data.Count -ne 1 -or $data[0].type -ne 'volume'){throw 'A single named database volume is required; bind or ambiguous database storage is unsupported.'}
  $definition=$Resolved.volumes.PSObject.Properties[$data[0].source]
  if(-not $definition -or -not $definition.Value.name){throw 'The resolved database volume identity is unavailable.'}
  $actual=@($Mounts | Where-Object Destination -eq '/var/lib/postgresql/data')
  if($actual.Count -ne 1 -or $actual[0].Type -ne 'volume' -or $actual[0].Name -cne $definition.Value.name -or $actual[0].RW -ne $true){throw 'Resolved database storage differs from the existing data mount. No service update is permitted.'}
}
function Assert-HostStorage([object]$Context,[object[]]$Records) {
  $databases=@($Records | Where-Object {$_.project -eq $Context.Project -and $_.service -eq 'database' -and $_.id})
  if(-not $databases.Count){return}
  $resolved=Invoke-HostCompose $Context @('config','--format','json') 30 | ConvertFrom-Json
  foreach($record in $databases){$mounts=@(Invoke-HostDocker $Context @('inspect','--format','{{json .Mounts}}',$record.id) 20 | ConvertFrom-Json | ForEach-Object {$_});Assert-HostDatabaseBinding $resolved $mounts}
  foreach($pair in @(@('database_password','database-password'),@('database_url','database-url'),@('worker_release','worker-release.json'))){$entry=$resolved.secrets.PSObject.Properties[$pair[0]];if(-not $entry -or -not $entry.Value.file -or [IO.Path]::GetFullPath($entry.Value.file) -ine [IO.Path]::GetFullPath((Join-Path $Context.Root ('.local/'+$pair[1])))){throw 'Existing secret-file storage differs from the supported protected local directory. Preserve and review that configuration before updating.'}}
}
function Save-HostJson([string]$File,[object]$Value) {
  $temporary=$File+'.'+[guid]::NewGuid().ToString('N')+'.tmp'
  try{[IO.File]::WriteAllText($temporary,'');Protect-LocalPath $temporary;[IO.File]::WriteAllText($temporary,($Value | ConvertTo-Json -Depth 12),[Text.UTF8Encoding]::new($false));if(Test-Path -LiteralPath $File){[IO.File]::Replace($temporary,$File,$null)}else{[IO.File]::Move($temporary,$File)};Protect-LocalPath $File}finally{if(Test-Path -LiteralPath $temporary){[IO.File]::Delete($temporary)}}
}
function Initialize-HostLocal([string]$Local) {
  $null=New-Item -ItemType Directory -Force -Path $Local;Protect-LocalPath $Local
  Get-ChildItem -LiteralPath $Local -Recurse -Force | Where-Object {$_.FullName -ne (Join-Path $Local 'hosting.lock')} | ForEach-Object {Protect-LocalPath $_.FullName}
  foreach($name in @('database-password')){
    $file=Join-Path $Local $name
    if(-not (Test-Path -LiteralPath $file)){$bytes=New-Object byte[] 32;$rng=[Security.Cryptography.RandomNumberGenerator]::Create();try{$rng.GetBytes($bytes)}finally{$rng.Dispose()};[IO.File]::WriteAllText($file,([BitConverter]::ToString($bytes)).Replace('-','').ToLowerInvariant());Protect-LocalPath $file}
  }
  $databaseFile=Join-Path $Local 'database-url'
  if(-not (Test-Path -LiteralPath $databaseFile)){$value=[IO.File]::ReadAllText((Join-Path $Local 'database-password')).Trim();[IO.File]::WriteAllText($databaseFile,('postgresql://fleet:'+ $value+'@database:5432/fleet'));$value=$null;Protect-LocalPath $databaseFile}
  $null=New-Item -ItemType Directory -Force -Path (Join-Path $Local 'aws');Protect-LocalPath (Join-Path $Local 'aws')
}
function Enter-HostLock([string]$Local) {
  $null=New-Item -ItemType Directory -Force -Path $Local;Protect-LocalPath $Local
  try{return [IO.File]::Open((Join-Path $Local 'hosting.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)}catch{throw 'Another hosting operation owns this deployment, or its lock is inaccessible. No concurrent update is started.'}
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
function Show-HostSummary([object]$Record) {
  Write-Host ('Verified same-host LAN HTTPS: '+$Record.url)
  Write-Host ('Source: '+$Record.source+' | Version: '+$Record.version+' | Image: '+$Record.image)
  Write-Host 'Evidence: .local/hosting-context.json. Cross-device access and database restoration remain separate verification.'
  if($Record.signup -eq 'available'){Write-Host 'Next: first-user username/password signup at the displayed HTTPS address. Enter credentials only in that protected interface.'}else{Write-Host 'Next: use the protected owner sign-in interface. Existing accounts and data remain preserved.'}
}
function Get-HostLogSnapshot([hashtable]$Cache,[string]$Service) {
  if($Service -notin @('service','gateway','database')){throw 'Unknown log service.'}
  if($Cache.ContainsKey($Service)){return $Cache[$Service]}
  return $null
}
function Show-HostLogs([object]$Context,[object]$Record) {
  if([Console]::IsInputRedirected){throw 'Interactive logs need a keyboard console. Use --detached for unattended hosting.'}
  $services=@('service','gateway','database');$selected=0;$following=$true;$cache=@{}
  while($true){
    $service=$services[$selected]
    if($following){$cache[$service]=@{text=(Protect-HostLog (Invoke-HostCompose $Context @('logs','--no-color','--tail','18',$service) 5));observedAt=[DateTimeOffset]::UtcNow.ToString('o')}}
    Clear-Host;Write-Host ('Fleet '+$Context.Project+' | '+$services[$selected]+' | follow: '+$following)
    Show-HostSummary $Record
    Write-Host '[Left/Right] select service  [F] follow/pause  [R/Q/Escape] return, containers remain running'
    Write-Host 'Keyboard input is read between bounded Docker requests; each request may take up to five seconds.'
    Write-Host (Invoke-HostCompose $Context @('ps') 5)
    $snapshot=Get-HostLogSnapshot $cache $service
    if($snapshot){Write-Host ('Log snapshot for '+$service+' at '+$snapshot.observedAt);Write-Host $snapshot.text}else{Write-Host 'No log snapshot is loaded for this service. Resume follow to retrieve it.'}
    for($tick=0;$tick -lt 20;$tick++){
      if([Console]::KeyAvailable){$key=[Console]::ReadKey($true).Key;if($key -in @('Q','R','Escape')){Show-HostSummary $Record;return};if($key -eq 'LeftArrow'){$selected=($selected+2)%3;break};if($key -eq 'RightArrow'){$selected=($selected+1)%3;break};if($key -eq 'F'){$following=-not $following;break}}
      Start-Sleep -Milliseconds 100
    }
  }
}
