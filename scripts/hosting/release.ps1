$script:FleetApi='https://api.github.com/repos/Ding-Ding-Projects/slop-machine-fleet'
$script:FleetReleaseRoot='https://github.com/Ding-Ding-Projects/slop-machine-fleet/releases'
function Get-HostPublicText([string]$Url) {
  Add-Type -AssemblyName System.Net.Http
  $handler=New-Object Net.Http.HttpClientHandler;$handler.AllowAutoRedirect=$false
  $client=New-Object Net.Http.HttpClient($handler);$client.DefaultRequestHeaders.UserAgent.ParseAdd('Slop-Machine-Fleet-Hosting');$client.Timeout=[TimeSpan]::FromSeconds(30)
  try{
    for($redirect=0;$redirect -le 4;$redirect++){
      $uri=[Uri]$Url
      if($uri.Scheme -ne 'https' -or $uri.UserInfo -or $uri.Fragment -or -not $uri.IsDefaultPort -or $uri.Host -notin @('api.github.com','github.com','release-assets.githubusercontent.com','objects.githubusercontent.com')){throw 'Release metadata destination is not allowed.'}
      $response=$client.GetAsync($uri,[Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
      try{
        if([int]$response.StatusCode -in @(301,302,303,307,308)){if(-not $response.Headers.Location){throw 'Release redirect has no destination.'};$Url=([Uri]::new($uri,$response.Headers.Location)).AbsoluteUri;continue}
        if(-not $response.IsSuccessStatusCode){throw 'Accepted release metadata is unavailable.'}
        $stream=$response.Content.ReadAsStreamAsync().GetAwaiter().GetResult();$memory=New-Object IO.MemoryStream;$timer=New-Object Threading.CancellationTokenSource(30000)
        try{$buffer=New-Object byte[] 16384;while(($count=$stream.ReadAsync($buffer,0,$buffer.Length,$timer.Token).GetAwaiter().GetResult()) -gt 0){if($memory.Length+$count -gt 1048576){throw 'Release metadata exceeds its bound.'};$memory.Write($buffer,0,$count)};return [Text.Encoding]::UTF8.GetString($memory.ToArray()).TrimStart([char]0xfeff)}finally{$timer.Dispose();$memory.Dispose();$stream.Dispose()}
      }finally{$response.Dispose()}
    }
    throw 'Release redirect limit exceeded.'
  }catch{throw 'Could not obtain bounded HTTPS release metadata. No authentication data or response body is displayed.'}finally{$client.Dispose();$handler.Dispose()}
}
function Assert-HostRelease([object]$Release,[object]$Manifest,[object]$Worker) {
  if($Release.draft -ne $false -or $Release.prerelease -ne $false -or $Release.tag_name -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'){throw 'Select a normal product release.'}
  $base=$script:FleetReleaseRoot+'/download/'+$Release.tag_name
  if($Release.html_url -cne ($script:FleetReleaseRoot+'/tag/'+$Release.tag_name) -or $Manifest.sourceBranch -cne 'main' -or $Manifest.updateChannel -cne 'stable' -or $Manifest.source -notmatch '^[a-f0-9]{40}$' -or $Manifest.version -notmatch '^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$' -or $Manifest.intendedImageReference -cne ('ghcr.io/ding-ding-projects/slop-machine-fleet:sha-'+$Manifest.source)){throw 'The release is not a source-bound accepted main release.'}
  $null=[Version]$Manifest.version
  foreach($pair in @(@('assetUrl','assetSha256','Fleet.Worker.exe'),@('bootstrapUrl','bootstrapSha256','Bootstrap-Worker.ps1'))){
    $rows=@($Manifest.files | Where-Object name -eq $pair[2]);$assets=@($Release.assets | Where-Object name -eq $pair[2])
    if($rows.Count -ne 1 -or $assets.Count -ne 1 -or $rows[0].sha256 -notmatch '^[a-fA-F0-9]{64}$' -or $rows[0].bytes -le 0 -or $rows[0].bytes -ne $assets[0].size -or $Worker.($pair[0]) -cne ($base+'/'+$pair[2]) -or $Worker.($pair[1]) -ine $rows[0].sha256 -or $assets[0].browser_download_url -cne ($base+'/'+$pair[2])){throw 'Worker release metadata does not match the accepted source inventory.'}
  }
  if($Worker.version -cne $Manifest.version){throw 'Worker and controller release versions differ.'}
  return [pscustomobject]@{Tag=$Release.tag_name;Source=$Manifest.source;Version=$Manifest.version;ImageTag=$Manifest.intendedImageReference;Worker=$Worker}
}
function Get-AcceptedHostRelease([string]$Tag) {
  $releases=if($Tag){@((Get-HostPublicText ($script:FleetApi+'/releases/tags/'+$Tag) | ConvertFrom-Json))}else{@((Get-HostPublicText ($script:FleetApi+'/releases?per_page=10') | ConvertFrom-Json))}
  if($releases.Count -gt 10){throw 'Release inventory exceeds its bound.'};$candidates=@()
  foreach($release in $releases){
    if($release.draft -or $release.prerelease -or $release.tag_name -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'){continue}
    try{
      $base=$script:FleetReleaseRoot+'/download/'+$release.tag_name
      foreach($name in @('source-manifest.json','worker-release.json')){$asset=@($release.assets | Where-Object name -eq $name);if($asset.Count -ne 1 -or $asset[0].browser_download_url -cne ($base+'/'+$name)){throw 'Missing bound release metadata.'}}
      $manifest=Get-HostPublicText ($base+'/source-manifest.json') | ConvertFrom-Json
      if($manifest.sourceBranch -ne 'main' -or $manifest.updateChannel -ne 'stable'){continue}
      $worker=Get-HostPublicText ($base+'/worker-release.json') | ConvertFrom-Json
      $candidate=Assert-HostRelease $release $manifest $worker
      $reference=Get-HostPublicText ($script:FleetApi+'/git/ref/tags/'+$release.tag_name) | ConvertFrom-Json;$object=$reference.object
      for($depth=0;$object.type -eq 'tag' -and $depth -lt 3;$depth++){if($object.sha -notmatch '^[a-f0-9]{40}$'){throw 'Invalid annotated release tag.'};$object=(Get-HostPublicText ($script:FleetApi+'/git/tags/'+$object.sha) | ConvertFrom-Json).object}
      if($object.type -ne 'commit' -or $object.sha -cne $candidate.Source){throw 'Release tag source mismatch.'}
      $comparison=Get-HostPublicText ($script:FleetApi+'/compare/'+$candidate.Source+'...main') | ConvertFrom-Json
      if($comparison.status -notin @('ahead','identical') -or $comparison.base_commit.sha -cne $candidate.Source){throw 'Release source is not verified on main.'}
      $candidates+=$candidate
    }catch{if($Tag){throw 'The selected release could not be verified. Existing deployment was retained.'}}
  }
  if(-not $candidates){throw 'No verified accepted release is available among the ten recent releases. Use --release with an exact accepted tag.'}
  return $candidates | Sort-Object @{Expression={[Version]$_.Version};Descending=$true} | Select-Object -First 1
}
function Assert-HostImage([object]$Image,[object]$Release) {
  if($Image.Id -notmatch '^sha256:[a-f0-9]{64}$' -or $Image.Config.Labels.'org.opencontainers.image.revision' -cne $Release.Source -or $Image.Config.Labels.'org.opencontainers.image.version' -cne $Release.Version -or $Image.Config.Labels.'org.opencontainers.image.source' -cne 'https://github.com/Ding-Ding-Projects/slop-machine-fleet'){throw 'Pulled image source/version identity does not match the accepted release.'}
  $digests=@($Image.RepoDigests | Where-Object {$_ -match '^ghcr.io/ding-ding-projects/slop-machine-fleet@sha256:[a-f0-9]{64}$'} | Select-Object -Unique)
  if($digests.Count -ne 1){throw 'The pulled image does not have one unambiguous immutable product digest.'}
  return $digests[0]
}
