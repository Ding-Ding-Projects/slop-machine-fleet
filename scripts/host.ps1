param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Options)
$ErrorActionPreference='Stop'
$env:PSModulePath=(Join-Path $PSHOME 'Modules')+';'+(Join-Path $env:ProgramFiles 'WindowsPowerShell\Modules')
foreach($module in @('context','permissions','release','trust','runtime')){. (Join-Path $PSScriptRoot ('hosting/'+$module+'.ps1'))}
$record=$null;$local=$null
try{
  $settings=Get-HostOptions $Options (Split-Path $PSScriptRoot -Parent)
  $docker=Get-Command docker.exe -CommandType Application -ErrorAction SilentlyContinue
  if(-not $docker){throw 'Docker Desktop with Compose is required. Install and start its supported engine before hosting; no substitute engine or privileged helper is launched.'}
  if($env:DOCKER_HOST -and -not $env:DOCKER_CONTEXT){throw 'An unnamed daemon override is active. Select its existing named Docker context explicitly before hosting; this entrypoint does not switch engine targets.'}
  $dockerContext=Invoke-HostCommand $docker.Source @('context','show') 20
  if(-not $dockerContext -or $dockerContext -match '[\r\n]'){throw 'The active Docker context could not be resolved.'}
  $context=[pscustomobject]@{Docker=$docker.Source;DockerContext=$dockerContext;Root=$settings.Root;EnvFile=(Join-Path $settings.Root '.env');Project='';Environment=@{}}
  $null=Invoke-HostDocker $context @('info','--format','{{.ServerVersion}}') 30
  $null=Invoke-HostDocker $context @('compose','version') 20
  $config=Read-HostEnvironment $context.EnvFile
  $existing=@(Get-ExistingHostProjects $context)
  $requested=$settings.Project
  if(-not $requested -and $config.COMPOSE_PROJECT_NAME){$requested=$config.COMPOSE_PROJECT_NAME}
  $context.Project=Select-HostProject $existing $context.Root $requested
  if(-not $context.Project){
    if($settings.NonInteractive){throw 'No existing deployment was identified. Select --project explicitly for an unattended first deployment.'}
    $context.Project=Select-HostProject $existing $context.Root (Read-Host 'No existing deployment matches this directory. Enter the new Compose project name')
    if(-not $context.Project){throw 'A deliberate project identity is required.'}
  }
  $hostName=if($settings.HostName){$settings.HostName}else{$config.FLEET_HOST}
  $port=if($settings.Port){$settings.Port}elseif($config.FLEET_HTTPS_PORT){$config.FLEET_HTTPS_PORT}else{'8443'}
  if(-not $hostName){if($settings.NonInteractive){throw 'Set --host to this computer''s intended LAN hostname or IPv4 address.'};$hostName=Read-Host 'This computer''s intended LAN hostname or IPv4 address'}
  Assert-HostAddress $hostName $port
  $addresses=@([Net.Dns]::GetHostAddresses($hostName))
  $localAddresses=@([Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() | Where-Object OperationalStatus -eq 'Up' | ForEach-Object {$_.GetIPProperties().UnicastAddresses | ForEach-Object {$_.Address.IPAddressToString}})
  foreach($address in $addresses){$bytes=$address.GetAddressBytes();$private=$bytes.Length -eq 4 -and ($bytes[0] -eq 10 -or ($bytes[0] -eq 172 -and $bytes[1] -ge 16 -and $bytes[1] -le 31) -or ($bytes[0] -eq 192 -and $bytes[1] -eq 168) -or ($bytes[0] -eq 100 -and $bytes[1] -ge 64 -and $bytes[1] -le 127));if(-not $private -or $address.IPAddressToString -notin $localAddresses){throw 'The selected hostname must resolve only to this computer''s intended private LAN addresses.'}}
  if(-not $addresses.Count){throw 'No LAN address resolved.'}
  if(-not $settings.Mode){$settings.Mode=if($settings.NonInteractive){'detached'}elseif((Read-Host 'Choose [D]etached or interactive [L]ogs') -match '^[lL]$'){'logs'}else{'detached'}}
  if($settings.Mode -eq 'logs' -and $settings.NonInteractive){throw 'Interactive logs require an attended keyboard console.'}
  Write-Host ('Deployment: '+$context.Project+' | Docker context: '+$context.DockerContext)
  $volumeNames=@((Invoke-HostDocker $context @('volume','ls','--filter',('label=com.docker.compose.project='+$context.Project),'--format','{{.Name}}') 20) -split '\r?\n' | Where-Object {$_})
  foreach($volumeName in $volumeNames){
    if($volumeName -notmatch '^[A-Za-z0-9][A-Za-z0-9_.-]*$'){throw 'Unexpected persistent-volume identity.'}
    $labels=Invoke-HostDocker $context @('volume','inspect','--format','{{json .Labels}}',$volumeName) 20 | ConvertFrom-Json
    if($labels.'com.docker.compose.project' -cne $context.Project){throw 'Persistent-volume ownership changed.'}
    if($labels.'com.docker.compose.volume' -eq 'database' -and -not @($existing | Where-Object {$_.project -eq $context.Project -and $_.service -eq 'database'}).Count){$existing+=[pscustomobject]@{project=$context.Project;service='database';id='';workingDirectory=$context.Root}}
  }
  Write-Host 'Resolving an accepted main release and its worker/source identity.'
  $release=Get-AcceptedHostRelease $settings.Release
  foreach($service in @($existing | Where-Object {$_.project -eq $context.Project -and $_.service -eq 'service'})){
    $imageId=Invoke-HostDocker $context @('inspect','--format','{{.Image}}',$service.id) 20
    $oldLabels=Invoke-HostDocker $context @('image','inspect','--format','{{json .Config.Labels}}',$imageId) 20 | ConvertFrom-Json
    $oldVersion=$oldLabels.'org.opencontainers.image.version'
    if($oldVersion -and [Version]$release.Version -lt [Version]$oldVersion){throw 'The selected release would downgrade this deployment. Existing services were retained.'}
  }
  Write-Host ('Pulling accepted controller version '+$release.Version+'.')
  $null=Invoke-HostDocker $context @('pull',$release.ImageTag) 300
  $image=@(Invoke-HostDocker $context @('image','inspect',$release.ImageTag) 20 | ConvertFrom-Json)[0]
  $digest=Assert-HostImage $image $release
  $local=Join-Path $context.Root '.local'
  if(@($existing | Where-Object {$_.project -eq $context.Project -and $_.service -eq 'database'}).Count){if(-not (Test-Path -LiteralPath $context.EnvFile)){throw 'Existing database configuration is missing. Restore its environment before updating.'};foreach($name in @('database-password','database-url')){if(-not (Test-Path -LiteralPath (Join-Path $local $name))){throw 'Existing database authorization is missing. Restore its protected configuration before updating; it is never regenerated for an existing database.'}}}
  Initialize-HostLocal $local
  $context.Environment=@{FLEET_HOST=$hostName;FLEET_HTTPS_PORT=$port;FLEET_IMAGE=$digest;COMPOSE_PROJECT_NAME=$context.Project}
  if($config.FLEET_AWS_PROFILE){$context.Environment.FLEET_AWS_PROFILE=$config.FLEET_AWS_PROFILE}
  # Preserve prior data with the old configuration before changing service inputs.
  $backup=''
  if(Test-Path -LiteralPath $context.EnvFile){$backup=Save-HostDatabase $context $existing $local}
  $previousWorker=Join-Path $local 'worker-release.json'
  if(Test-Path -LiteralPath $previousWorker){Copy-Item -LiteralPath $previousWorker -Destination (Join-Path $local ('worker-release-before-'+[guid]::NewGuid().ToString('N')+'.json'))}
  Save-HostJson $previousWorker $release.Worker
  Save-HostEnvironment $context.EnvFile @{FLEET_HOST=$hostName;FLEET_HTTPS_PORT=$port;FLEET_IMAGE=$digest;COMPOSE_PROJECT_NAME=$context.Project} $local
  $record=@{project=$context.Project;root=$context.Root;dockerContext=$context.DockerContext;source=$release.Source;version=$release.Version;release=$release.Tag;image=$digest;preservedVolumes=$volumeNames;databaseBackup=$backup;databaseRestoreVerified=$false;startedAt=[DateTimeOffset]::UtcNow.ToString('o');state='starting';crossDeviceHealth='not performed by this local entrypoint'}
  Save-HostJson (Join-Path $local 'hosting-context.json') $record
  Write-Host 'Pulling pinned services and starting the preserved Compose project.'
  $null=Invoke-HostCompose $context @('pull') 300
  $null=Invoke-HostCompose $context @('up','-d','--wait','--wait-timeout','180') 240
  $serviceId=Invoke-HostCompose $context @('ps','-q','service') 20
  if($serviceId -notmatch '^[a-f0-9]{12,64}$'){throw 'Exactly one running controller is required.'}
  $runningImage=Invoke-HostDocker $context @('inspect','--format','{{.Image}}',$serviceId) 20
  if($runningImage -cne $image.Id){throw 'Running controller image differs from the verified image.'}
  $identity=Invoke-HostCompose $context @('exec','-T','service','node','-p','JSON.stringify({identity:require("/app/build-identity.json"),version:require("/app/package.json").version,web:require("/app/apps/web/dist/build-version.json")})') 20 | ConvertFrom-Json
  if($identity.identity.source -cne $release.Source -or $identity.identity.version -cne $release.Version -or $identity.version -cne $release.Version -or $identity.web.source -cne $release.Source -or $identity.web.version -cne $release.Version){throw 'Running source/version and compiled interface do not match the accepted release.'}
  $record.state='trust-pending';Save-HostJson (Join-Path $local 'hosting-context.json') $record
  $record.caSha256=Confirm-HostTrust $context $settings $local
  $url='https://'+$hostName+':'+$port+'/'
  Write-Host 'Verifying trusted HTTPS health through the actual LAN address.'
  Wait-HostHealth $url
  $record.httpsHealthVerified=$true;$record.state='account-status-pending'
  $status=Invoke-RestMethod -Uri ($url+'api/auth/status') -TimeoutSec 10
  if(-not $status.PSObject.Properties['signupAvailable'] -or $status.signupAvailable -isnot [bool]){throw 'The selected release does not provide the username/password signup status contract. HTTPS is healthy, but account workflow verification remains incomplete.'}
  $record.state='healthy';$record.url=$url;$record.completedAt=[DateTimeOffset]::UtcNow.ToString('o')
  $record.signup=if($status.PSObject.Properties['signupAvailable']){if($status.signupAvailable){'available'}else{'already-claimed'}}else{'status-contract-unavailable'}
  Save-HostJson (Join-Path $local 'hosting-context.json') $record
  Write-Host ('Verified same-host LAN HTTPS: '+$url)
  Write-Host ('Source: '+$release.Source+' | Version: '+$release.Version+' | Image: '+$digest)
  Write-Host ('LAN addresses: '+(($addresses | ForEach-Object {$_.IPAddressToString}) -join ', '))
  Write-Host 'Cross-device reachability requires a separate request from an intended LAN client; it is not inferred from this local check.'
  if($record.signup -eq 'available'){Write-Host 'First-user username/password signup is available at the displayed HTTPS address. Enter credentials only in that protected interface.'}
  elseif($record.signup -eq 'already-claimed'){Write-Host 'An owner already exists. Existing accounts and data were preserved; use the protected sign-in interface.'}
  else{Write-Host 'The selected service does not expose the username/password signup status contract. Account setup remains unverified; no setup authorization is displayed.'}
  if($settings.Mode -eq 'logs'){Show-HostLogs $context}
  exit 0
}catch{$failure=$_.Exception.Message;if($record -and $local){try{$record.failedAfter=$record.state;$record.state='incomplete';$record.failedAt=[DateTimeOffset]::UtcNow.ToString('o');Save-HostJson (Join-Path $local 'hosting-context.json') $record}catch{}};Write-Host ('Hosting incomplete: '+$failure);exit 1}
