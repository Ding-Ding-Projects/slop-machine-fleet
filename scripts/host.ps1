param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Options)
$ErrorActionPreference = 'Stop'
$env:PSModulePath = (Join-Path $PSHOME 'Modules') + ';' + (Join-Path $env:ProgramFiles 'WindowsPowerShell\Modules')
Set-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)
function Run-Compose([string[]]$Arguments) { & docker compose @Arguments; if ($LASTEXITCODE -ne 0) { throw "Docker Compose exited $LASTEXITCODE." } }
try {
  if ($Options | Where-Object { $_ -notin @('--detached','--logs') }) { throw 'Supported modes: --detached or --logs.' }
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker Desktop with Compose is required. Use its supported installer and start the container engine before hosting.' }
  & docker info --format '{{.ServerVersion}}'
  if ($LASTEXITCODE -ne 0) { throw 'The Docker engine is not available.' }
  & docker compose version
  if ($LASTEXITCODE -ne 0) { throw 'Docker Compose v2 is unavailable.' }
  if (-not (Test-Path .env)) { throw 'Copy .env.example to .env and configure the actual LAN host and published image first.' }
  $config = @{}
  Get-Content .env | ForEach-Object { if ($_ -match '^([A-Z_]+)=(.*)$') { $config[$matches[1]] = $matches[2].Trim() } }
  $fleetHost = $config.FLEET_HOST
  $port = if ($config.FLEET_HTTPS_PORT) { [int]$config.FLEET_HTTPS_PORT } else { 8443 }
  if (-not $fleetHost -or $fleetHost -match '[/\\:@\s]' -or $port -lt 1 -or $port -gt 65535) { throw 'Invalid LAN hostname or HTTPS port.' }
  $addresses = @([Net.Dns]::GetHostAddresses($fleetHost))
  if (-not $addresses -or @($addresses | Where-Object { [Net.IPAddress]::IsLoopback($_) }).Count -gt 0) { throw 'FLEET_HOST must resolve to a non-loopback LAN address.' }
  $mode = if ($Options -contains '--logs') { 'logs' } elseif ($Options -contains '--detached') { 'detached' } else { if ((Read-Host 'Choose [D]etached or interactive [L]ogs') -match '^[lL]$') { 'logs' } else { 'detached' } }
  $local = Join-Path (Get-Location) '.local'
  New-Item -ItemType Directory -Force $local | Out-Null
  $identitySid = [Security.Principal.WindowsIdentity]::GetCurrent().User
  $systemSid = New-Object Security.Principal.SecurityIdentifier('S-1-5-18')
  function Protect-LocalPath([string]$Target) {
    $item = Get-Item -LiteralPath $Target -Force
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Local configuration cannot contain symbolic links or junctions.' }
    $acl = Get-Acl -LiteralPath $Target
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($rule in @($acl.Access)) { [void]$acl.RemoveAccessRuleSpecific($rule) }
    foreach ($sid in @($identitySid,$systemSid)) {
      if ($item.PSIsContainer) { $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow') }
      else { $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','Allow') }
      $acl.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $Target -AclObject $acl
    $verified = Get-Acl -LiteralPath $Target
    if (-not $verified.AreAccessRulesProtected -or @($verified.Access | Where-Object { $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin @($identitySid.Value,$systemSid.Value) -or $_.AccessControlType -ne 'Allow' }).Count -gt 0) { throw 'Local configuration permissions did not verify.' }
  }
  Protect-LocalPath $local
  Get-ChildItem -LiteralPath $local -Recurse -Force | ForEach-Object { Protect-LocalPath $_.FullName }
  function New-ProtectedValue([string]$Name) {
    $file = Join-Path $local $Name
    if (-not (Test-Path $file)) {
      $bytes = New-Object byte[] 32
      $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
      try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
      [IO.File]::WriteAllText($file, (($bytes | ForEach-Object { $_.ToString('x2') }) -join ''))
    }
  }
  New-ProtectedValue 'database-password'
  New-ProtectedValue 'setup-code'
  $databaseUrlFile = Join-Path $local 'database-url'
  if (-not (Test-Path $databaseUrlFile)) { $password = [IO.File]::ReadAllText((Join-Path $local 'database-password')); [IO.File]::WriteAllText($databaseUrlFile, "postgresql://fleet:${password}@database:5432/fleet"); $password = $null }
  New-Item -ItemType Directory -Force (Join-Path $local 'aws') | Out-Null
  if (-not (Test-Path (Join-Path $local 'worker-release.json'))) { throw 'Download the source-bound worker-release.json from the accepted release into .local/worker-release.json before starting the controller.' }
  $workerRelease = Get-Content (Join-Path $local 'worker-release.json') -Raw | ConvertFrom-Json
  foreach ($property in @('version','assetUrl','assetSha256','bootstrapUrl','bootstrapSha256')) { if (-not $workerRelease.$property) { throw 'The worker release manifest is incomplete.' } }
  foreach ($property in @('assetSha256','bootstrapSha256')) { if ($workerRelease.$property -notmatch '^[a-f0-9]{64}$') { throw 'The worker release manifest digest is invalid.' } }
  foreach ($property in @('assetUrl','bootstrapUrl')) { $assetUri = [Uri]$workerRelease.$property; if ($assetUri.Scheme -ne 'https' -or $assetUri.UserInfo -or $assetUri.Query -or $assetUri.Fragment) { throw 'Worker release assets must use immutable HTTPS addresses without credentials or query values.' } }
  Get-ChildItem -LiteralPath $local -Recurse -Force | ForEach-Object { Protect-LocalPath $_.FullName }
  Run-Compose @('pull')
  Run-Compose @('up','-d','--wait','--wait-timeout','180')
  $url = "https://${fleetHost}:$port/api/health"
  $healthy = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try { $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5; if ($response.StatusCode -eq 200) { $healthy = $true; break } } catch {}
    Start-Sleep -Seconds 2
  }
  if (-not $healthy) { throw 'HTTPS health verification did not pass. Trust the Caddy local CA through your approved certificate process, verify LAN DNS and retry. No TLS validation was disabled. Running containers are preserved.' }
  Write-Host "Verified LAN endpoint: https://${fleetHost}:$port/"
  Write-Host 'Initial setup authorization is stored in .local/setup-code. Do not paste it into logs or chat.'
  if ($mode -eq 'logs') {
    $services = @('service','gateway','database'); $selected = 0; $following = $true
    while ($true) {
      Clear-Host
      Write-Host "Fleet live logs | service: $($services[$selected]) | follow: $following"
      Write-Host '[Left/Right] select service  [F] follow/pause  [R/Q] return (containers keep running)'
      Run-Compose @('ps')
      Run-Compose @('logs','--no-color','--tail','18',$services[$selected])
      for ($tick = 0; $tick -lt 20; $tick++) {
        if ([Console]::KeyAvailable) {
          $key = [Console]::ReadKey($true).Key
          if ($key -in @('Q','R','Escape')) { exit 0 }
          if ($key -eq 'LeftArrow') { $selected = ($selected + 2) % 3; break }
          if ($key -eq 'RightArrow') { $selected = ($selected + 1) % 3; break }
          if ($key -eq 'F') { $following = -not $following; break }
        }
        if ($following) { Start-Sleep -Milliseconds 100 } else { Start-Sleep -Milliseconds 100; $tick = 0 }
      }
    }
  }
  exit 0
} catch { Write-Error $_; exit 1 }
