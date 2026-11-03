[CmdletBinding()]
param([Parameter(Mandatory)][string]$Manifest, [string]$CacheRoot = "$env:ProgramData\SlopMachineFleet\downloads")
$ErrorActionPreference = 'Stop'
# The controller supplies an explicitly reviewed immutable version/hash manifest.
# Never substitute a latest URL, execute a downloaded manifest, or trust user-data keys.
$items = @(Get-Content -LiteralPath $Manifest -Raw | ConvertFrom-Json)
foreach ($name in @('git','gh','node','codex','dotnet')) {
    $item = @($items | Where-Object name -EQ $name)
    if ($item.Count -ne 1 -or $item[0].version -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$' -or $item[0].sha256 -notmatch '^[a-fA-F0-9]{64}$') { throw "A pinned version and SHA-256 are required for $name" }
    $uri = [Uri]$item[0].url
    if ($uri.Scheme -ne 'https' -or $uri.UserInfo -or $uri.Host -notin @('github.com','nodejs.org','builds.dotnet.microsoft.com','download.visualstudio.microsoft.com')) { throw "Unapproved download origin for $name" }
    if ($item[0].kind -notin @('exe','msi','zip')) { throw "Unsupported package type for $name" }
    if ($name -eq 'codex' -and $item[0].kind -ne 'zip') { throw 'Codex requires the reviewed portable archive, not an executable installer recipe' }
}
New-Item -ItemType Directory -Path $CacheRoot -Force | Out-Null
foreach ($item in $items) {
    if ($item.name -notin @('git','gh','node','codex','dotnet')) { throw 'Unknown package name' }
    $destination = Join-Path $CacheRoot "$($item.name)-$($item.version).$($item.kind)"
    if (!(Test-Path -LiteralPath $destination) -or (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash -ne $item.sha256) { Invoke-WebRequest -Uri $item.url -OutFile $destination }
    if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash -ne $item.sha256) { throw "Package integrity verification failed for $($item.name)" }
    # Arguments are a fixed recipe, never downloaded shell text.
    switch ($item.kind) {
        'exe' { $arguments = if ($item.name -eq 'git') { @('/VERYSILENT','/NORESTART','/SP-') } else { @('/install','/quiet','/norestart') }; $child = Start-Process -FilePath $destination -ArgumentList $arguments -PassThru -Wait -WindowStyle Hidden; if ($child.ExitCode -ne 0) { throw "Installer did not complete: $($item.name), exit $($child.ExitCode)" } }
        'msi' { $child = Start-Process msiexec.exe -ArgumentList @('/i',"`"$destination`"",'/qn','/norestart') -Wait -PassThru -WindowStyle Hidden; if ($child.ExitCode -ne 0) { throw "Installer did not complete: $($item.name), exit $($child.ExitCode)" } }
        'zip' { $target = Join-Path $CacheRoot "$($item.name)-$($item.version)"; if (Test-Path -LiteralPath $target) { throw "Refusing to overwrite existing portable package: $($item.name)" }; Expand-Archive -LiteralPath $destination -DestinationPath $target }
    }
}
Write-Output 'Verified packages installed or extracted. Configure absolute executable paths and verify their versions before service enrollment.'
