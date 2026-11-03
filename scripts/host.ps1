param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Options)
$ErrorActionPreference = 'Stop'
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
  if (-not $addresses -or $addresses | Where-Object { [Net.IPAddress]::IsLoopback($_) }) { throw 'FLEET_HOST must resolve to a non-loopback LAN address.' }
  $mode = if ($Options -contains '--logs') { 'logs' } elseif ($Options -contains '--detached') { 'detached' } else { if ((Read-Host 'Choose [D]etached or interactive [L]ogs') -match '^[lL]$') { 'logs' } else { 'detached' } }
  $local = Join-Path (Get-Location) '.local'
  New-Item -ItemType Directory -Force $local | Out-Null
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  & icacls.exe $local /inheritance:r /grant:r "${identity}:(OI)(CI)F" /Q | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not protect local configuration storage.' }
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
