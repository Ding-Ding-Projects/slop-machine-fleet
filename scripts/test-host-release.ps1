$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'hosting/release.ps1')
function Reject([scriptblock]$Action){try{& $Action;throw 'UNEXPECTED_ACCEPTANCE'}catch{if($_.Exception.Message -eq 'UNEXPECTED_ACCEPTANCE'){throw}}}
$sha='a'*40;$hash='b'*64;$base='https://github.com/Ding-Ding-Projects/slop-machine-fleet/releases/download/build-fixture'
$release=[pscustomobject]@{draft=$false;prerelease=$false;tag_name='build-fixture';html_url='https://github.com/Ding-Ding-Projects/slop-machine-fleet/releases/tag/build-fixture';assets=@([pscustomobject]@{name='Fleet.Worker.exe';size=100;browser_download_url=$base+'/Fleet.Worker.exe'},[pscustomobject]@{name='Bootstrap-Worker.ps1';size=200;browser_download_url=$base+'/Bootstrap-Worker.ps1'})}
$manifest=[pscustomobject]@{source=$sha;sourceBranch='main';updateChannel='stable';version='0.2.1';intendedImageReference='ghcr.io/ding-ding-projects/slop-machine-fleet:sha-'+$sha;files=@([pscustomobject]@{name='Fleet.Worker.exe';bytes=100;sha256=$hash},[pscustomobject]@{name='Bootstrap-Worker.ps1';bytes=200;sha256=$hash})}
$worker=[pscustomobject]@{version='0.2.1';assetUrl=$base+'/Fleet.Worker.exe';assetSha256=$hash;bootstrapUrl=$base+'/Bootstrap-Worker.ps1';bootstrapSha256=$hash}
$accepted=Assert-HostRelease $release $manifest $worker
if($accepted.Source -ne $sha){throw 'Accepted identity changed.'}
$manifest.updateChannel='preservation';Reject {Assert-HostRelease $release $manifest $worker};$manifest.updateChannel='stable'
$manifest.sourceBranch='other';Reject {Assert-HostRelease $release $manifest $worker};$manifest.sourceBranch='main'
$worker.assetUrl='https://other.invalid/worker.exe';Reject {Assert-HostRelease $release $manifest $worker};$worker.assetUrl=$base+'/Fleet.Worker.exe'
$worker.version='0.3.1';Reject {Assert-HostRelease $release $manifest $worker};$worker.version='0.2.1'
$image=[pscustomobject]@{Id='sha256:'+('c'*64);RepoDigests=@('ghcr.io/ding-ding-projects/slop-machine-fleet@sha256:'+('d'*64));Config=[pscustomobject]@{Labels=[pscustomobject]@{'org.opencontainers.image.source'='https://github.com/Ding-Ding-Projects/slop-machine-fleet';'org.opencontainers.image.revision'=$sha;'org.opencontainers.image.version'='0.2.1'}}}
if((Assert-HostImage $image $accepted) -notmatch '@sha256:'){throw 'Image was not pinned.'}
$image.Config.Labels.'org.opencontainers.image.version'='0.1.0';Reject {Assert-HostImage $image $accepted}
Write-Host 'PASS: accepted main release, exact worker metadata, version/source labels and immutable image binding; preservation, foreign URLs and mismatched versions rejected. No network or container operation ran.'
