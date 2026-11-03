[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateSet('Request','Complete','Repair','Update')][string]$Phase,
    [Parameter(Mandatory)][Uri]$AssetUrl,
    [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$AssetSha256,
    [Parameter(Mandatory)][Guid]$WorkerId,
    [Parameter(Mandatory)][ValidatePattern('^vol-[a-f0-9]{8,17}$')][string]$DataVolumeId,
    [string]$InstallRoot='C:\ProgramData\SlopMachineFleet',
    [string]$ServerCertificateBase64,[string]$ControllerCaBase64,[string]$ControllerThumbprint
)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
if (!([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Bootstrap requires the authorized elevated remote provisioning identity' }
if ($AssetUrl.Scheme -ne 'https' -or $AssetUrl.Host -ne 'github.com' -or $AssetUrl.UserInfo -or $AssetUrl.AbsolutePath -notmatch '^/Ding-Ding-Projects/slop-machine-fleet/releases/download/[^/]+/[^/]+\.exe$') { throw 'Expected an immutable official worker release executable URL' }
$InstallRoot=[IO.Path]::GetFullPath($InstallRoot)
if ($InstallRoot -ne 'C:\ProgramData\SlopMachineFleet') { throw 'Only the dedicated fleet installation root is accepted' }
$enrollment=Join-Path $InstallRoot 'enrollment'
$executable=Join-Path $InstallRoot 'Fleet.Worker.exe'
$configuration=Join-Path $InstallRoot 'worker.json'
$accountName='FleetWorker'
function Protect-Directory([string]$Path,[string]$WorkerPermission) {
    & icacls.exe $Path /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' "$env:COMPUTERNAME\${accountName}:(OI)(CI)$WorkerPermission" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Unable to enforce the worker directory ACL' }
}
function Resolve-DataWorkspace([bool]$AllowInitialize) {
    $identity=$DataVolumeId.Replace('-','').ToLowerInvariant()
    $deadline=[DateTime]::UtcNow.AddSeconds(60)
    do { $disks=@(Get-Disk | Where-Object { ($_.SerialNumber -replace '[^A-Za-z0-9]','').ToLowerInvariant() -eq $identity }); if($disks.Count -eq 0) { Start-Sleep -Seconds 2; Update-HostStorageCache } } while($disks.Count -eq 0 -and [DateTime]::UtcNow -lt $deadline)
    if($disks.Count -ne 1 -or $disks[0].IsBoot -or $disks[0].IsSystem) { throw 'The exact retained data volume could not be safely identified' }
    $disk=$disks[0]
    if($disk.IsOffline) { Set-Disk -Number $disk.Number -IsOffline $false }
    if($disk.IsReadOnly) { throw 'Retained data volume is read-only; no workspace mutation attempted' }
    if($disk.PartitionStyle -eq 'RAW') {
        if(!$AllowInitialize) { throw 'Retained data volume is unexpectedly RAW; repair never reformats it' }
        Initialize-Disk -Number $disk.Number -PartitionStyle GPT | Out-Null
        $partition=New-Partition -DiskNumber $disk.Number -UseMaximumSize -AssignDriveLetter
        $partition | Format-Volume -FileSystem NTFS -NewFileSystemLabel 'FleetData' -Confirm:$false | Out-Null
    } else {
        $partitions=@(Get-Partition -DiskNumber $disk.Number | Where-Object { $_.Type -eq 'Basic' })
        if($partitions.Count -ne 1) { throw 'Retained data volume has an ambiguous partition layout; no formatting attempted' }
        $partition=$partitions[0]
        if(!$partition.DriveLetter) { $partition | Add-PartitionAccessPath -AssignDriveLetter; $partition=Get-Partition -DiskNumber $disk.Number -PartitionNumber $partition.PartitionNumber }
        $volume=$partition | Get-Volume
        if($volume.FileSystem -ne 'NTFS') { throw 'Retained workspace requires an existing supported NTFS volume; no formatting attempted' }
    }
    $workspace="$($partition.DriveLetter):\FleetWorkspaces"
    New-Item -ItemType Directory -Path $workspace -Force | Out-Null
    return $workspace
}
function Install-OfficialTools {
    [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
    $tools=Join-Path $InstallRoot 'tools'; New-Item -ItemType Directory -Path $tools -Force | Out-Null
    $receipts=@(); $paths=@{}
    foreach($spec in @(@{name='git';repo='git-for-windows/git';pattern='^Git-[0-9.]+-64-bit.exe$';kind='git'},@{name='gh';repo='cli/cli';pattern='^gh_2\.96\.0_windows_amd64.msi$';kind='msi';tag='v2.96.0'},@{name='codex';repo='openai/codex';pattern='^codex-x86_64-pc-windows-msvc.exe.tar.gz$';kind='tar'})) {
        $releasePath=if($spec.tag){"tags/$($spec.tag)"}else{'latest'}
        $release=Invoke-RestMethod -Uri "https://api.github.com/repos/$($spec.repo)/releases/$releasePath" -Headers @{'User-Agent'='SlopMachineFleet-Bootstrap'}
        if($release.draft -or $release.prerelease -or !$release.tag_name) { throw 'Expected a stable official tool release' }
        $assets=@($release.assets | Where-Object name -Match $spec.pattern)
        if($assets.Count -ne 1 -or $assets[0].digest -notmatch '^sha256:([a-f0-9]{64})$') { throw "Official immutable SHA-256 release digest unavailable for $($spec.name)" }
        $digest=$Matches[1]; $asset=$assets[0]; $url=[Uri]$asset.browser_download_url
        if($url.Scheme -ne 'https' -or $url.Host -ne 'github.com' -or !$url.AbsolutePath.StartsWith('/'+$spec.repo+'/releases/download/')) { throw 'Unexpected official asset URL' }
        $file=Join-Path $tools $asset.name; Invoke-WebRequest -UseBasicParsing -Uri $url.AbsoluteUri -OutFile $file
        if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $digest) { throw "Tool package integrity mismatch: $($spec.name)" }
        $receipts+=@{name=$spec.name;version=$release.tag_name;url=$url.AbsoluteUri;sha256=$digest}
        switch($spec.kind) {
            'git' { $child=Start-Process -FilePath $file -ArgumentList @('/VERYSILENT','/NORESTART','/SP-') -Wait -PassThru -WindowStyle Hidden; if($child.ExitCode -ne 0) { throw "Git installer exit $($child.ExitCode)" }; $paths.git='C:\Program Files\Git\cmd\git.exe' }
            'msi' { $child=Start-Process msiexec.exe -ArgumentList @('/i',"`"$file`"",'/qn','/norestart') -Wait -PassThru -WindowStyle Hidden; if($child.ExitCode -ne 0) { throw "GitHub CLI installer exit $($child.ExitCode)" }; $paths.gh='C:\Program Files\GitHub CLI\gh.exe' }
            'tar' { & tar.exe -xzf $file -C $tools; if($LASTEXITCODE -ne 0) { throw 'Codex portable extraction failed' }; $paths.codex=Join-Path $tools 'codex-x86_64-pc-windows-msvc.exe' }
        }
    }
    $index=Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json'
    $node=@($index | Where-Object { $_.version -match '^v22\.' -and $_.lts })[0]
    if(!$node -or $node.version -notmatch '^v22\.[0-9]+\.[0-9]+$') { throw 'Supported Node 22 release unavailable' }
    $nodeName="node-$($node.version)-x64.msi"; $nodeBase="https://nodejs.org/dist/$($node.version)"
    $hashes=(Invoke-WebRequest -UseBasicParsing -Uri "$nodeBase/SHASUMS256.txt").Content
    $match=[regex]::Match($hashes,"(?m)^([a-f0-9]{64})\s+"+[regex]::Escape($nodeName)+'\s*$')
    if(!$match.Success) { throw 'Official Node package digest unavailable' }
    $nodeFile=Join-Path $tools $nodeName; Invoke-WebRequest -UseBasicParsing -Uri "$nodeBase/$nodeName" -OutFile $nodeFile
    if((Get-FileHash -LiteralPath $nodeFile -Algorithm SHA256).Hash -ne $match.Groups[1].Value) { throw 'Node integrity mismatch' }
    $child=Start-Process msiexec.exe -ArgumentList @('/i',"`"$nodeFile`"",'/qn','/norestart') -Wait -PassThru -WindowStyle Hidden
    if($child.ExitCode -ne 0) { throw "Node installer exit $($child.ExitCode)" }
    $receipts+=@{name='node';version=$node.version;url="$nodeBase/$nodeName";sha256=$match.Groups[1].Value}; $paths.node='C:\Program Files\nodejs\node.exe'
    foreach($tool in @('git','gh','codex','node')) { if(!(Test-Path -LiteralPath $paths[$tool])) { throw "Installed executable unavailable: $tool" }; $null=& $paths[$tool] --version; if($LASTEXITCODE -ne 0) { throw "Installed version probe failed: $tool" } }
    @{paths=$paths;receipts=$receipts} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $InstallRoot 'tools-state.json') -Encoding UTF8
}
if($Phase -in @('Repair','Update')) {
    if(!(Test-Path -LiteralPath (Join-Path $enrollment 'worker-id')) -or (Get-Content -LiteralPath (Join-Path $enrollment 'worker-id') -Raw) -ne $WorkerId.ToString()) { throw 'Existing enrollment identity mismatch' }
    $account=Get-LocalUser -Name $accountName -ErrorAction Stop
    if((Get-Content -LiteralPath (Join-Path $InstallRoot 'data-volume-id') -Raw) -ne $DataVolumeId) { throw 'Retained volume identity mismatch' }
    $workspace=Resolve-DataWorkspace $false
    $existingConfig=Get-Content -LiteralPath $configuration -Raw | ConvertFrom-Json
    if([IO.Path]::GetFullPath($existingConfig.dataRoot) -ne [IO.Path]::GetFullPath($workspace)) { throw 'Existing configuration does not match the exact retained data volume' }
    $administrators=Get-LocalGroup -SID 'S-1-5-32-544'
    if(Get-LocalGroupMember -Group $administrators | Where-Object SID -EQ $account.SID) { throw 'Dedicated worker identity cannot be an administrator' }
    foreach($process in @(Get-CimInstance Win32_Process -Filter "Name LIKE 'codex%'") ) {
        $owner=Invoke-CimMethod -InputObject $process -MethodName GetOwner
        if($owner.User -eq $accountName -and $process.CommandLine -match 'app-server') { throw 'An app-server process remains active; verified drain is required before upgrade' }
    }
    $candidate=Join-Path $InstallRoot 'Fleet.Worker.candidate.exe'
    Invoke-WebRequest -UseBasicParsing -Uri $AssetUrl.AbsoluteUri -OutFile $candidate
    if((Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash -ne $AssetSha256) { throw 'Candidate integrity verification failed; previous executable preserved' }
    $backup=Join-Path $InstallRoot ('Fleet.Worker.previous-'+[DateTime]::UtcNow.ToString('yyyyMMddHHmmss')+'.exe')
    Copy-Item -LiteralPath $executable -Destination $backup -ErrorAction Stop
    try { Stop-Service -Name SlopMachineFleetWorker -ErrorAction Stop; Copy-Item -LiteralPath $candidate -Destination $executable -Force -ErrorAction Stop; Start-Service SlopMachineFleetWorker }
    catch { Copy-Item -LiteralPath $backup -Destination $executable -Force; Start-Service SlopMachineFleetWorker; throw }
    $publicRequest=& $executable "--enroll-request=$enrollment"
    if($LASTEXITCODE -ne 0) { throw 'Preserved enrollment CSR readback failed' }
    $publicRequest
    exit 0
}
if ($Phase -eq 'Request') {
    if (Test-Path -LiteralPath $InstallRoot) { throw 'Existing installation or enrollment found; preserve it and use an explicit repair route' }
    if (Get-LocalUser -Name $accountName -ErrorAction SilentlyContinue) { throw 'An unrelated account already owns the reserved worker name' }
    $random=New-Object byte[] 48
    $rng=[Security.Cryptography.RandomNumberGenerator]::Create(); $rng.GetBytes($random); $rng.Dispose()
    $password=ConvertTo-SecureString ([Convert]::ToBase64String($random)+'aA1!') -AsPlainText -Force
    [Array]::Clear($random,0,$random.Length)
    $account=New-LocalUser -Name $accountName -Password $password -Description 'Dedicated Slop Machine Fleet standard service account' -PasswordNeverExpires
    $credential=New-Object Management.Automation.PSCredential("$env:COMPUTERNAME\$accountName",$password)
    New-Item -ItemType Directory -Path $InstallRoot,$enrollment,(Join-Path $InstallRoot 'data') -Force | Out-Null
    Protect-Directory $InstallRoot 'RX'; Protect-Directory $enrollment 'RX'; Protect-Directory (Join-Path $InstallRoot 'data') 'M'
    $workspace=Resolve-DataWorkspace $true
    Protect-Directory $workspace 'M'
    Set-Content -LiteralPath (Join-Path $InstallRoot 'data-volume-id') -Value $DataVolumeId -NoNewline
    Set-Content -LiteralPath (Join-Path $InstallRoot 'data-workspace') -Value $workspace -NoNewline
    Invoke-WebRequest -UseBasicParsing -Uri $AssetUrl.AbsoluteUri -OutFile $executable
    if ((Get-FileHash -LiteralPath $executable -Algorithm SHA256).Hash -ne $AssetSha256) { throw 'Worker executable integrity verification failed; service was not started' }
    Install-OfficialTools
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;
public static class FleetServiceIdentity {
 [StructLayout(LayoutKind.Sequential)] struct Attributes { public int Length; public IntPtr Root,ObjectName; public uint Flags; public IntPtr Descriptor,Qos; }
 [StructLayout(LayoutKind.Sequential)] struct Unicode { public ushort Length,MaximumLength; public IntPtr Buffer; }
 [DllImport("advapi32.dll")] static extern uint LsaOpenPolicy(IntPtr name,ref Attributes attributes,uint access,out IntPtr handle);
 [DllImport("advapi32.dll")] static extern uint LsaAddAccountRights(IntPtr handle,IntPtr sid,ref Unicode rights,uint count);
 [DllImport("advapi32.dll")] static extern uint LsaClose(IntPtr handle);
 [DllImport("advapi32.dll")] static extern uint LsaNtStatusToWinError(uint status);
 [DllImport("userenv.dll",CharSet=CharSet.Unicode)] static extern int CreateProfile(string sid,string user,StringBuilder profile,uint length);
 public static void Prepare(string sidText,string name) {
  var sid=new SecurityIdentifier(sidText); var bytes=new byte[sid.BinaryLength]; sid.GetBinaryForm(bytes,0); var memory=Marshal.AllocHGlobal(bytes.Length); Marshal.Copy(bytes,0,memory,bytes.Length);
  var text="SeServiceLogonRight"; var right=new Unicode{Length=(ushort)(text.Length*2),MaximumLength=(ushort)((text.Length+1)*2),Buffer=Marshal.StringToHGlobalUni(text)};
  IntPtr handle=IntPtr.Zero;
  try {var attributes=new Attributes{Length=Marshal.SizeOf(typeof(Attributes))}; var status=LsaOpenPolicy(IntPtr.Zero,ref attributes,0x810,out handle); if(status!=0) throw new System.ComponentModel.Win32Exception((int)LsaNtStatusToWinError(status)); status=LsaAddAccountRights(handle,memory,ref right,1); if(status!=0) throw new System.ComponentModel.Win32Exception((int)LsaNtStatusToWinError(status)); var profile=new StringBuilder(1024); var result=CreateProfile(sidText,name,profile,1024); if(result<0) Marshal.ThrowExceptionForHR(result); }
  finally {if(handle!=IntPtr.Zero)LsaClose(handle); Marshal.FreeHGlobal(memory); Marshal.FreeHGlobal(right.Buffer);}
 }
}
'@
    [FleetServiceIdentity]::Prepare($account.SID.Value,$accountName)
    New-Service -Name SlopMachineFleetWorker -DisplayName 'Slop Machine Fleet Worker' -BinaryPathName "`"$executable`" --worker-config=`"$configuration`"" -Credential $credential -StartupType Automatic | Out-Null
    $password.Dispose(); $credential=$null
    Set-Content -LiteralPath (Join-Path $enrollment 'worker-id') -Value $WorkerId.ToString() -NoNewline
    $publicRequest=& $executable "--enroll-request=$enrollment"
    if ($LASTEXITCODE -ne 0) { throw 'Worker CSR generation failed' }
    $publicRequest
    exit 0
}
if (!(Test-Path -LiteralPath $executable) -or (Get-FileHash -LiteralPath $executable -Algorithm SHA256).Hash -ne $AssetSha256) { throw 'Enrolled executable is absent or mismatched' }
if ((Get-Content -LiteralPath (Join-Path $enrollment 'worker-id') -Raw) -ne $WorkerId.ToString()) { throw 'Worker identity mismatch' }
if((Get-Content -LiteralPath (Join-Path $InstallRoot 'data-volume-id') -Raw) -ne $DataVolumeId) { throw 'Retained volume identity mismatch' }
$workspace=Resolve-DataWorkspace $false
if((Get-Content -LiteralPath (Join-Path $InstallRoot 'data-workspace') -Raw) -ne $workspace) { throw 'Retained workspace mapping changed' }
if ($ControllerThumbprint -notmatch '^[a-fA-F0-9]{64}$') { throw 'Expected the controller leaf SHA-256 DER thumbprint' }
if (!$ServerCertificateBase64 -or !$ControllerCaBase64 -or $ServerCertificateBase64.Length -gt 32768 -or $ControllerCaBase64.Length -gt 32768) { throw 'Missing or oversized public enrollment certificate' }
[IO.File]::WriteAllBytes((Join-Path $enrollment 'server.pem'),[Convert]::FromBase64String($ServerCertificateBase64))
[IO.File]::WriteAllBytes((Join-Path $enrollment 'controller-ca.pem'),[Convert]::FromBase64String($ControllerCaBase64))
$tools=Get-Content -LiteralPath (Join-Path $InstallRoot 'tools-state.json') -Raw | ConvertFrom-Json
@{workerId=$WorkerId.ToString();serverCertificate=(Join-Path $enrollment 'server.pem');serverKey=(Join-Path $enrollment 'server.key');controllerCa=(Join-Path $enrollment 'controller-ca.pem');controllerThumbprint=$ControllerThumbprint;dataRoot=$workspace;gitPath=$tools.paths.git;ghPath=$tools.paths.gh;codexPath=$tools.paths.codex} | ConvertTo-Json | Set-Content -LiteralPath $configuration -Encoding UTF8
Protect-Directory $InstallRoot 'RX'
Start-Service -Name SlopMachineFleetWorker
$deadline=[DateTime]::UtcNow.AddSeconds(45)
do { Start-Sleep -Milliseconds 500; $service=Get-Service -Name SlopMachineFleetWorker; if ($service.Status -eq 'Stopped') { throw 'Worker stopped before readiness' }; $listener=Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue } while (!$listener -and [DateTime]::UtcNow -lt $deadline)
if (!$listener) { throw 'Worker did not bind its protected loopback port' }
@{workerId=$WorkerId.ToString();state='listening';tlsVerification='pending-controller-mtls-health'} | ConvertTo-Json -Compress
