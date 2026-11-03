const https = require('node:https');
const path = require('node:path');
const fs = require('node:fs/promises');
const { createHash } = require('node:crypto');
const OWNER = 'Ding-Ding-Projects';
const PRODUCT = 'slop-machine-fleet';
const RELEASE_ROOT = `https://github.com/${OWNER}/${PRODUCT}/releases`;
const LATEST_API = `https://api.github.com/repos/${OWNER}/${PRODUCT}/releases/latest`;
const API_ROOT = `https://api.github.com/repos/${OWNER}/${PRODUCT}`;
const RELEASES_API = `${API_ROOT}/releases?per_page=10`;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function versionParts(value) {
  if (typeof value !== 'string' || !VERSION.test(value) || value.length > 40) throw new Error('Invalid package version.');
  const parts = value.split('.').map(Number);
  if (parts.some(value => !Number.isSafeInteger(value))) throw new Error('Invalid package version.');
  return parts;
}
function compareVersions(a, b) {
  const left = versionParts(a), right = versionParts(b);
  for (let index = 0; index < 3; index++) if (left[index] !== right[index]) return left[index] > right[index] ? 1 : -1;
  return 0;
}
function releaseBase(tag) {
  if (typeof tag !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(tag)) throw new Error('Invalid release identity.');
  return `${RELEASE_ROOT}/download/${tag}`;
}
function validateRelease(value) {
  if (!value || value.draft !== false || value.prerelease !== false || !Array.isArray(value.assets)) throw new Error('No accepted release is available.');
  const base = releaseBase(value.tag_name);
  const notesUrl = `${RELEASE_ROOT}/tag/${value.tag_name}`;
  if (value.html_url !== notesUrl) throw new Error('Release identity does not match this product.');
  const assets = new Map();
  for (const asset of value.assets) {
    if (['RELEASES', 'source-manifest.json'].includes(asset.name) || /^SlopMachineFleet-[0-9.]+-(?:full|delta)\.nupkg$/i.test(asset.name)) {
      if (assets.has(asset.name) || asset.browser_download_url !== `${base}/${asset.name}` || !Number.isSafeInteger(asset.size) || asset.size < 1) throw new Error('Release assets are invalid.');
      assets.set(asset.name, { url: asset.browser_download_url, size: asset.size });
    }
  }
  if (!assets.has('RELEASES') || !assets.has('source-manifest.json')) throw new Error('The release has no source-bound Squirrel feed.');
  return { base, notesUrl, assets, target: value.target_commitish };
}
function validateManifest(manifest, release, releasesText) {
  if (!manifest || manifest.updateChannel !== 'stable' || manifest.sourceBranch !== 'main' || manifest.unsigned !== true || !/^[a-f0-9]{40}$/i.test(manifest.source) || !Array.isArray(manifest.files)) throw new Error('The release is not on the accepted main update channel.');
  versionParts(manifest.version);
  const files = new Map();
  for (const file of manifest.files) {
    if (typeof file.name !== 'string' || files.has(file.name) || !Number.isSafeInteger(file.bytes) || file.bytes < 1 || !/^[a-f0-9]{64}$/i.test(file.sha256)) throw new Error('The source manifest is invalid.');
    files.set(file.name, file);
  }
  const feed = files.get('RELEASES');
  if (!feed || feed.bytes !== Buffer.byteLength(releasesText) || createHash('sha256').update(releasesText).digest('hex') !== feed.sha256.toLowerCase()) throw new Error('The update feed does not match its source manifest.');
  const candidate = parseReleases(releasesText, release), payload = files.get(candidate.filename);
  if (!payload || candidate.version !== manifest.version || payload.bytes !== candidate.size) throw new Error('The package does not match its accepted source manifest.');
  return { ...candidate, source: manifest.source };
}
function parseReleases(text, release) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 262144) throw new Error('The update feed exceeds its limit.');
  const candidates = [], names = new Set();
  for (const line of text.trim().split(/\r?\n/)) {
    const match = /^([a-f0-9]{40})\s+(SlopMachineFleet-([0-9.]+)-(full|delta)\.nupkg)\s+([1-9]\d*)$/i.exec(line.trim());
    if (!match) throw new Error('The update feed is malformed.');
    const [, sha1, filename, version, type, sizeText] = match;
    versionParts(version);
    const size = Number(sizeText), asset = release.assets.get(filename);
    if (names.has(filename) || !Number.isSafeInteger(size) || size > 2_000_000_000 || !asset || size !== asset.size) throw new Error('The update feed does not match the published assets.');
    names.add(filename);
    if (type.toLowerCase() === 'full') candidates.push({ version, sha1: sha1.toLowerCase(), filename, size, feedUrl: release.base, notesUrl: release.notesUrl });
  }
  if (!candidates.length) throw new Error('No complete update package is available.');
  return candidates.sort((a, b) => compareVersions(b.version, a.version))[0];
}
function allowedDownload(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return false;
    if (url.hostname === 'api.github.com') {
      if ([LATEST_API, RELEASES_API].includes(url.href)) return true;
      if (url.search) return false;
      const suffix = url.href.slice(API_ROOT.length);
      return url.href.startsWith(`${API_ROOT}/`) && (/^\/git\/ref\/tags\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(suffix) || /^\/git\/tags\/[a-f0-9]{40}$/i.test(suffix) || /^\/compare\/[a-f0-9]{40}\.\.\.main$/i.test(suffix));
    }
    if (url.hostname === 'github.com') return url.href.startsWith(`${RELEASE_ROOT}/download/`) && !url.search;
    return ['release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(url.hostname);
  } catch { return false; }
}
function readText(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 4 || !allowedDownload(url)) return reject(new Error('Update transport destination is not allowed.'));
    const request = https.get(url, { headers: { 'User-Agent': 'Slop-Machine-Fleet-Desktop', Accept: 'application/vnd.github+json' }, timeout: 15000 }, response => {
      if ([301,302,303,307,308].includes(response.statusCode)) {
        response.resume();
        if (!response.headers.location) return reject(new Error('Update redirect is missing its destination.'));
        let target; try { target = new URL(response.headers.location, url).href; } catch { return reject(new Error('Update redirect is invalid.')); }
        readText(target, redirects + 1).then(resolve, reject); return;
      }
      if (response.statusCode !== 200) { response.resume(); reject(new Error('The published update feed is unavailable.')); return; }
      const chunks = []; let count = 0;
      response.on('data', chunk => { count += chunk.length; if (count > 1048576) request.destroy(new Error('Update metadata exceeds its limit.')); else chunks.push(chunk); });
      response.once('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      response.once('error', () => reject(new Error('Update metadata could not be read.')));
    });
    request.once('timeout', () => request.destroy(new Error('Update metadata timed out.')));
    request.once('error', () => reject(new Error('The update service is unavailable. Check the connection and retry.')));
    const deadline = setTimeout(() => request.destroy(new Error('Update metadata exceeded its time limit.')), 15000);
    deadline.unref?.();
    request.once('close', () => clearTimeout(deadline));
  });
}
async function verifySource(tag, source, read) {
  let reference = JSON.parse(await read(`${API_ROOT}/git/ref/tags/${tag}`));
  let object = reference.object;
  for (let depth = 0; object?.type === 'tag' && depth < 3; depth++) {
    if (!/^[a-f0-9]{40}$/i.test(object.sha)) throw new Error('Invalid annotated release tag.');
    object = JSON.parse(await read(`${API_ROOT}/git/tags/${object.sha}`)).object;
  }
  if (object?.type !== 'commit' || object.sha !== source) throw new Error('The release tag does not match the accepted source.');
  const comparison = JSON.parse(await read(`${API_ROOT}/compare/${source}...main`));
  if (!['ahead', 'identical'].includes(comparison.status) || comparison.base_commit?.sha !== source) throw new Error('The release source is not verified on main.');
}
async function discoverRelease(currentVersion, read = readText) {
  versionParts(currentVersion);
  let values; try { values = JSON.parse(await read(RELEASES_API)); } catch { throw new Error('Accepted release metadata is unavailable.'); }
  if (!Array.isArray(values) || values.length > 10) throw new Error('Release discovery exceeds its bound.');
  const candidates = [];
  for (const value of values) {
    if (!value || value.draft !== false || value.prerelease !== false) continue;
    try {
      const release = validateRelease(value);
      const manifest = JSON.parse(await read(release.assets.get('source-manifest.json').url));
      if (manifest.updateChannel !== 'stable' || manifest.sourceBranch !== 'main') continue;
      versionParts(manifest.version);
      candidates.push({ release, manifest, tag: value.tag_name });
    } catch { /* Invalid or inaccessible entries are never handed to Squirrel. */ }
  }
  candidates.sort((a, b) => compareVersions(b.manifest.version, a.manifest.version));
  for (const item of candidates) {
    try {
      const candidate = validateManifest(item.manifest, item.release, await read(item.release.assets.get('RELEASES').url));
      await verifySource(item.tag, candidate.source, read);
      return candidate;
    } catch { /* Try only another independently valid stable/main release in the bounded inventory. */ }
  }
  throw new Error('No source-verified accepted release is available in the recent release inventory.');
}
async function installedSupport({ packaged, platform, execPath, version }, stat = fs.stat) {
  if (!packaged || platform !== 'win32') return false;
  versionParts(version);
  if (path.basename(path.dirname(execPath)).toLowerCase() !== `app-${version}`.toLowerCase()) return false;
  try { return (await stat(path.resolve(path.dirname(execPath), '..', 'Update.exe'))).isFile(); } catch { return false; }
}
module.exports = { compareVersions, validateRelease, validateManifest, parseReleases, allowedDownload, discoverRelease, verifySource, installedSupport, releaseBase, RELEASE_ROOT, LATEST_API, RELEASES_API, API_ROOT };
