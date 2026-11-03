#!/usr/bin/env node
/** Publication check. Policy data is runtime input, never a source dependency.
 *
 * Input: {schemaVersion:1,dictionary:{terms:[{alias,plural,proseOnly,forms:[]},...]},
 * publicSafePhrases:[]}. Preserve the complete dictionary document inside dictionary.
 * Compressed transport: {schemaVersion:1,encoding:"gzip+base64",payload:"..."}.
 * Every exceptional inflection must be supplied in forms by the private producer.
 * Optional dictionary.publicationForms supplies additional publication forms
 * without assigning them to unrelated terms (at most 16384 bounded strings).
 *
 * Exceptions are reviewed source locations, not token/Markdown/code exclusions:
 * {schemaVersion:1,entries:[{path,line,sha256,reason}]}. Hash the decoded original
 * line without its terminator as UTF-8; line 0 hashes the complete relative path.
 * The exception file must be outside the candidate checkout. CI must use its
 * pinned trusted-policy copy. Stale, unused and malformed exceptions fail closed.
 */
import { createFontDecoder } from './publication-font-decoder.mjs';
import { interpretBinaryContent } from './publication-binary-content.mjs';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync, statSync, lstatSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

export const LIMITS = Object.freeze({ input: 262144, decoded: 2097152, file: 16777216, total: 2147483648, batch: 16777216, batchEntries: 256, cache: 16777216, records: 100000, resultBytes: 16777216, files: 50000, exceptions: 262144, gitlinks: 256, depth: 16 });
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = code => { throw Object.assign(new Error(code), { code }); };
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join('|') === [...keys].sort().join('|');
const decoder = () => new TextDecoder('utf-8', { fatal: true });
const string = (value, max = 512) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/u.test(value);
const inside = (root, value) => { const relative = path.relative(root, value); return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)); };
const reasons = new Set(['technical-identifier', 'proper-name', 'external-quotation']);

function normalize(value, removeFormats = false) {
  const characters = []; const offsets = [];
  for (let offset = 0; offset < value.length;) {
    let original = String.fromCodePoint(value.codePointAt(offset));
    let consumed = original.length;
    const lead = value[offset];
    const candidate = lead === '\\' || lead === '&' ? value.slice(offset, offset + 16) : '';
    const encoded = candidate ? candidate.match(/^(?:\\u\{([a-f0-9]{1,6})\}|\\u([a-f0-9]{4})|\\x([a-f0-9]{2})|&#x([a-f0-9]{1,6});|&#([0-9]{1,7});)/iu) : null;
    if (encoded) {
      const point = encoded[5] ? Number(encoded[5]) : Number.parseInt(encoded[1] ?? encoded[2] ?? encoded[3] ?? encoded[4], 16);
      if (point <= 0x10ffff) { original = String.fromCodePoint(point); consumed = encoded[0].length; }
    } else if (candidate) {
      const simple = candidate.match(/^\\[nrtfv]/u);
      const named = candidate.match(/^&(?:nbsp|Tab|NewLine);/u);
      if (simple || named) { original = ' '; consumed = (simple ?? named)[0].length; }
    }
    // Identifier casing is not a blanket exemption for rendered inventory IDs.
    const previous = value[offset - 1] ?? '';
    if (/\p{Lu}/u.test(original) && (/[\p{Ll}\p{N}]/u.test(previous) || (/\p{Lu}/u.test(previous) && /\p{Ll}/u.test(value[offset + consumed] ?? '')))) {
      characters.push(' '); offsets.push(offset);
    }
    const point = original.codePointAt(0);
    let part;
    if (point < 128) {
      part = point >= 9 && point <= 13 ? ' ' : original.toLowerCase();
    } else {
      part = original.normalize('NFKC').toLowerCase().replace(/\p{M}/gu, '');
      part = part.replace(/\p{Cf}/gu, removeFormats ? '' : ' ').replace(/[\p{Z}\s]/gu, ' ').replace(/\p{Pd}/gu, '-');
    }
    for (const character of part) {
      if (character === ' ' && characters.at(-1) === ' ') continue;
      characters.push(character);
      for (let i = 0; i < character.length; i += 1) offsets.push(offset);
    }
    offset += consumed;
  }
  return { text: characters.join(''), offsets };
}
const escaped = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const requiredLiterals = new WeakMap();
const mayMatch = (text, pattern) => {
  const literal = requiredLiterals.get(pattern);
  return literal === undefined || (text.includes(literal.first) && literal.body.test(text));
};
function matcher(value) {
  const term = normalize(value).text.trim();
  const body = term.split(' ').map(escaped).join('[ _-]*');
  const start = /^[\p{L}\p{N}_$]/u.test(term) ? '(?<![\\p{L}\\p{N}])(?:[a-f0-9]{7,64})?' : '';
  // A revision directly after a phrase must not hide that phrase.
  const end = /[\p{L}\p{N}_$]$/u.test(term) ? '(?=$|[^\\p{L}\\p{N}]|[a-f0-9]{7,64}(?:$|[^\\p{L}\\p{N}]))' : '';
  const pattern = new RegExp(start + body + end, 'gu');
  requiredLiterals.set(pattern, { first: term.split(' ')[0], body: new RegExp(body, 'u') });
  return pattern;
}

export function readPolicy(bytes) {
  if (!bytes.length || bytes.length > LIMITS.input) fail('dictionary-input-invalid');
  let value;
  try { value = JSON.parse(decoder().decode(bytes)); } catch { fail('dictionary-invalid'); }
  if (value?.encoding !== undefined) {
    if (!exactKeys(value, ['schemaVersion', 'encoding', 'payload']) || value.schemaVersion !== 1 || value.encoding !== 'gzip+base64' || typeof value.payload !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value.payload)) fail('dictionary-transport-invalid');
    try { value = JSON.parse(decoder().decode(gunzipSync(Buffer.from(value.payload, 'base64'), { maxOutputLength: LIMITS.decoded }))); } catch { fail('dictionary-transport-invalid'); }
  }
  if (!(exactKeys(value, ['schemaVersion', 'dictionary', 'publicSafePhrases']) || exactKeys(value, ['schemaVersion', 'dictionary', 'publicSafePhrases', 'changelog'])) || value.schemaVersion !== 1 || !value.dictionary || !Array.isArray(value.dictionary.terms) || !value.dictionary.terms.length || value.dictionary.terms.length > 4096 || !Array.isArray(value.publicSafePhrases) || value.publicSafePhrases.length > 512) fail('dictionary-schema-invalid');
  if (value.dictionary.termCount !== undefined && value.dictionary.termCount !== value.dictionary.terms.length) fail('dictionary-schema-invalid');
  const forbidden = new Set(); const safe = [];
  for (const term of value.dictionary.terms) {
    if (!term || !string(term.alias) || typeof term.proseOnly !== 'boolean' || typeof term.plural !== 'string' || !Array.isArray(term.forms) || !term.forms.length || term.forms.length > 128 || !term.forms.every(form => string(form))) fail('dictionary-term-invalid');
    const forms = [...term.alias.split(' / '), ...term.forms];
    const plural = term.plural.split(/ \(| -- |; /u)[0].trim();
    if (plural && !/^(?:n\/a|not specified)\b/iu.test(plural)) forms.push(...plural.split(' / '));
    if (!forms.every(form => string(form) && normalize(form).text.trim())) fail('dictionary-term-invalid');
    if (term.proseOnly) forms.forEach(form => forbidden.add(form.trim()));
    else safe.push(...forms);
  }
  if (!forbidden.size || forbidden.size > 16384 || !value.publicSafePhrases.every(form => string(form) && normalize(form).text.trim())) fail('dictionary-schema-invalid');
  safe.push(...value.publicSafePhrases);
  if (value.dictionary.publicationForms !== undefined) {
    const forms = value.dictionary.publicationForms;
    if (!Array.isArray(forms) || forms.length > 16384 || !forms.every(form => string(form) && normalize(form).text.trim())) fail('dictionary-publication-forms-invalid');
    forms.forEach(form => forbidden.add(form.trim()));
    if (forbidden.size > 16384) fail('dictionary-publication-forms-invalid');
  }
  const policy = { forbidden: [...forbidden].sort((a, b) => b.length - a.length).map(matcher), safe: safe.map(matcher) };
  if (value.changelog !== undefined) {
    validateChangelogPolicy(value.changelog, policy);
    const inventory = new Set(value.changelog.forbidden.map(changelogKey));
    for (const form of forbidden) if (!inventory.has(changelogKey(form))) fail('changelog-inventory-invalid');
  }
  return policy;
}

// This optional protected carrier never changes the publication detection rules.
const changelogKey = value => value.normalize('NFKC').toLowerCase().trim();
export function validateChangelogPolicy(value, policy) {
  if (!exactKeys(value, ['version', 'replacements', 'forbidden']) || value.version !== 1 ||
      !Array.isArray(value.replacements) || !value.replacements.length || value.replacements.length > 16384 ||
      !Array.isArray(value.forbidden) || !value.forbidden.length || value.forbidden.length > 16384) fail('changelog-schema-invalid');
  const seen = new Set(); let prior = Infinity;
  for (const literal of value.forbidden) {
    if (!string(literal) || literal !== literal.trim() || !changelogKey(literal) || seen.has(changelogKey(literal)) || literal.length > prior) fail('changelog-forbidden-invalid');
    seen.add(changelogKey(literal)); prior = literal.length;
  }
  const mapped = new Set(); prior = Infinity;
  const targetPolicy = policy || { forbidden: value.forbidden.map(matcher), safe: [] };
  for (const pair of value.replacements) {
    if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(item => string(item) && item === item.trim()) ||
        !seen.has(changelogKey(pair[0])) || mapped.has(changelogKey(pair[0])) || pair[0].length > prior ||
        changelogKey(pair[0]) === changelogKey(pair[1]) || findingsIn(pair[1], targetPolicy, 1).length) fail('changelog-replacement-invalid');
    mapped.add(changelogKey(pair[0])); prior = pair[0].length;
  }
  return value;
}

function findingsIn(text, policy, maximum = Infinity) {
  const found = new Map();
  const lineStarts = [0];
  for (const match of text.matchAll(/\r\n|[\r\n\u2028\u2029]/gu)) lineStarts.push(match.index + match[0].length);
  const lineAt = offset => {
    let low = 0; let high = lineStarts.length;
    while (low < high) { const middle = (low + high) >>> 1; if (lineStarts[middle] <= offset) low = middle + 1; else high = middle; }
    return low;
  };
  // Encoded format characters also need the format-removal normalization view.
  const views = /\p{Cf}|\\[ux]|&#/iu.test(text) ? [false, true] : [false];
  for (const removeFormats of views) {
    const normalized = normalize(text, removeFormats);
    const permitted = policy.safe.filter(pattern => mayMatch(normalized.text, pattern)).flatMap(pattern => [...normalized.text.matchAll(pattern)].map(match => [match.index, match.index + match[0].length]));
    for (const pattern of policy.forbidden) {
      if (!mayMatch(normalized.text, pattern)) continue;
      for (const match of normalized.text.matchAll(pattern)) {
        if (permitted.some(([start, end]) => match.index >= start && match.index + match[0].length <= end)) continue;
        const originalOffset = normalized.offsets[match.index] ?? 0;
        const originalEnd = (normalized.offsets[match.index + match[0].length - 1] ?? originalOffset) + 1;
        const line = lineAt(originalOffset);
        const endLine = lineAt(originalEnd);
        found.set(line, { line, endLine: Math.max(endLine, found.get(line)?.endLine ?? line) });
        if (found.size > maximum) fail('tracked-results-oversized');
      }
    }
  }
  return [...found.values()].sort((a, b) => a.line - b.line);
}

function decodeText(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le', { fatal: true }).decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be', { fatal: true }).decode(bytes.subarray(2));
  return decoder().decode(bytes);
}
// Bounded EBML header recognition (RFC 8794). Unknown sizes and unsupported header
// elements fall back to text scanning; an extension or magic prefix is insufficient.
export function hasWebmHeader(bytes) {
  if (bytes.length < 5 || bytes.subarray(0, 4).toString('hex') !== '1a45dfa3') return false;
  const vint = (offset, limit, id = false) => {
    if (offset >= limit || bytes[offset] === 0) return null;
    let width = 1, marker = 0x80;
    while (!(bytes[offset] & marker)) { width += 1; marker >>= 1; }
    if (width > (id ? 4 : 8) || offset + width > limit) return null;
    let value = BigInt(id ? bytes[offset] : bytes[offset] & (marker - 1));
    for (let index = 1; index < width; index += 1) value = value * 256n + BigInt(bytes[offset + index]);
    if (!id && value === (1n << BigInt(width * 7)) - 1n) return null;
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    return { value: Number(value), end: offset + width };
  };
  const size = vint(4, bytes.length);
  if (!size || size.value < 7 || size.value > 4096 || size.end + size.value > bytes.length) return false;
  const end = size.end + size.value, seen = new Set();
  const defaults = new Map([[0x4286, 1], [0x42f7, 1], [0x42f2, 4], [0x42f3, 8], [0x4287, 1], [0x4285, 1]]);
  let cursor = size.end, elements = 0, docType = false;
  while (cursor < end) {
    if (++elements > 32) return false;
    const id = vint(cursor, end, true);
    if (!id) return false;
    const length = vint(id.end, end);
    if (!length || length.end + length.value > end) return false;
    cursor = length.end + length.value;
    if (id.value === 0xec) continue; // Void is permitted padding.
    if (seen.has(id.value)) return false;
    seen.add(id.value);
    if (id.value === 0x4282) {
      if (length.value !== 4 || bytes.subarray(length.end, cursor).toString('hex') !== '7765626d') return false;
      docType = true;
    } else {
      if (!defaults.has(id.value) || length.value < 1 || length.value > 8) return false;
      let value = 0n;
      for (let index = length.end; index < cursor; index += 1) value = value * 256n + BigInt(bytes[index]);
      if (value < 1n || value > 8n) return false;
      defaults.set(id.value, Number(value));
    }
  }
  return docType && defaults.get(0x4286) === 1 && defaults.get(0x42f7) === 1
    && defaults.get(0x42f2) === 4 && defaults.get(0x42f3) <= 8
    && defaults.get(0x4285) <= defaults.get(0x4287);
}
// Bounded RIFF/WebP container and image-header recognition (RFC 9649).
// Unsupported animation and metadata remain unrecognized, never extension exemptions.
export function hasWebpStructure(bytes) {
  if (bytes.length < 26 || bytes.subarray(0, 4).toString() !== 'RIFF' || bytes.subarray(8, 12).toString() !== 'WEBP' || bytes.readUInt32LE(4) + 8 !== bytes.length) return false;
  let cursor = 12; let chunks = 0; let image = false; let extended = false; let icc = false; let alpha = false; let flags = 0; let width; let height; let imageAlpha = false;
  while (cursor < bytes.length) {
    if (++chunks > 16 || cursor + 8 > bytes.length) return false;
    const kind = bytes.subarray(cursor, cursor + 4).toString(); const size = bytes.readUInt32LE(cursor + 4); const start = cursor + 8; const end = start + size;
    cursor = end + (size & 1);
    if (cursor > bytes.length || (size & 1 && bytes[end] !== 0) || image) return false;
    if (kind === 'VP8X') {
      if (chunks !== 1 || size !== 10 || bytes[start] & 0xc3 || bytes.readUIntLE(start + 1, 3) !== 0) return false;
      extended = true; flags = bytes[start]; width = bytes.readUIntLE(start + 4, 3) + 1; height = bytes.readUIntLE(start + 7, 3) + 1;
    } else if (kind === 'ICCP') {
      if (!extended || icc || alpha || !(flags & 0x20) || size < 128 || bytes.readUInt32BE(start) !== size || bytes.subarray(start + 36, start + 40).toString() !== 'acsp') return false;
      icc = true;
    } else if (kind === 'ALPH') {
      if (!extended || alpha || !(flags & 0x10) || size < 2 || bytes[start] & 0xc0 || (bytes[start] & 3) > 1 || (bytes[start] >> 4 & 3) > 1) return false;
      alpha = true;
    } else if (kind === 'VP8 ') {
      if (size < 11 || bytes.subarray(start + 3, start + 6).toString('hex') !== '9d012a') return false;
      const tag = bytes.readUIntLE(start, 3); const w = bytes.readUInt16LE(start + 6) & 0x3fff; const h = bytes.readUInt16LE(start + 8) & 0x3fff;
      if (tag & 1 || (tag >> 1 & 7) > 3 || !(tag & 16) || !(tag >>> 5) || (tag >>> 5) > size - 10 || !w || !h || extended && (w !== width || h !== height)) return false;
      image = true;
    } else if (kind === 'VP8L') {
      if (size < 6 || alpha || bytes[start] !== 0x2f) return false;
      const header = bytes.readUInt32LE(start + 1); const w = (header & 0x3fff) + 1; const h = (header >>> 14 & 0x3fff) + 1;
      if (header >>> 29 || extended && (w !== width || h !== height)) return false;
      imageAlpha = Boolean(header >>> 28 & 1); image = true;
    } else return false;
  }
  return image && (!extended || Boolean(flags & 0x20) === icc && Boolean(flags & 0x10) === (alpha || imageAlpha) && !(flags & 0x0c));
}

// ISO-BMFF movie recognition requires complete bounded boxes and a real track
// hierarchy. This identifies a supported container, never proves codec decoding.
export function hasMp4Structure(bytes) {
  if (bytes.length < 64) return false;
  let count = 0;
  const boxes = (start, end) => {
    const result = [];
    while (start < end) {
      if (++count > 1024 || start + 8 > end) return null;
      let size = bytes.readUInt32BE(start); let header = 8;
      if (size === 1) {
        if (start + 16 > end) return null;
        const large = bytes.readBigUInt64BE(start + 8);
        if (large > BigInt(Number.MAX_SAFE_INTEGER)) return null;
        size = Number(large); header = 16;
      }
      if (size < header || start + size > end) return null;
      const kind = bytes.subarray(start + 4, start + 8).toString();
      if (!/^[\x20-\x7e]{4}$/u.test(kind)) return null;
      result.push({ kind, start: start + header, end: start + size }); start += size;
    }
    return result;
  };
  const one = (items, kind) => { const matching = items.filter(item => item.kind === kind); return matching.length === 1 ? matching[0] : null; };
  const full = (box, version0, version1 = version0) => box && box.end - box.start >= (bytes[box.start] === 0 ? version0 : bytes[box.start] === 1 ? version1 : Infinity);
  const top = boxes(0, bytes.length);
  if (!top || top[0]?.kind !== 'ftyp' || top.some(box => !['ftyp', 'moov', 'mdat', 'free', 'skip', 'wide'].includes(box.kind))) return false;
  const ftyp = one(top, 'ftyp'); const moov = one(top, 'moov');
  const mediaData = top.filter(box => box.kind === 'mdat');
  if (!ftyp || !moov || ftyp.end - ftyp.start < 12 || (ftyp.end - ftyp.start) % 4 || !top.some(box => box.kind === 'mdat' && box.end > box.start)) return false;
  const brands = [bytes.subarray(ftyp.start, ftyp.start + 4).toString()];
  for (let cursor = ftyp.start + 8; cursor < ftyp.end; cursor += 4) {
    if (brands.length > 32) return false;
    brands.push(bytes.subarray(cursor, cursor + 4).toString());
  }
  if (!brands.some(brand => /^(?:iso[2-9m]|mp4[12]|avc1)$/u.test(brand))) return false;
  const movie = boxes(moov.start, moov.end); if (!movie) return false;
  const mvhd = one(movie, 'mvhd');
  if (!full(mvhd, 100, 112) || bytes.readUInt32BE(mvhd.start + (bytes[mvhd.start] === 0 ? 12 : 20)) === 0) return false;
  const tracks = movie.filter(box => box.kind === 'trak'); if (!tracks.length || tracks.length > 32) return false;
  for (const track of tracks) {
    const children = boxes(track.start, track.end); if (!children || !full(one(children, 'tkhd'), 84, 96)) return false;
    const mdia = one(children, 'mdia'); if (!mdia) return false;
    const media = boxes(mdia.start, mdia.end); if (!media || !full(one(media, 'mdhd'), 24, 36)) return false;
    const hdlr = one(media, 'hdlr'); const minf = one(media, 'minf');
    if (!full(hdlr, 24) || !['vide', 'soun'].includes(bytes.subarray(hdlr.start + 8, hdlr.start + 12).toString()) || !minf) return false;
    const info = boxes(minf.start, minf.end); const stbl = info && one(info, 'stbl'); if (!stbl) return false;
    const samples = boxes(stbl.start, stbl.end); if (!samples) return false;
    const stsd = one(samples, 'stsd'); const stsz = one(samples, 'stsz'); const stts = one(samples, 'stts'); const stsc = one(samples, 'stsc'); const offsets = one(samples, 'stco') ?? one(samples, 'co64');
    if (!full(stsd, 16) || !full(stsz, 12) || !full(stts, 16) || !full(stsc, 20) || !full(offsets, offsets?.kind === 'co64' ? 16 : 12)) return false;
    const descriptions = boxes(stsd.start + 8, stsd.end);
    if (!descriptions?.length || descriptions.length !== bytes.readUInt32BE(stsd.start + 4)) return false;
    const video = bytes.subarray(hdlr.start + 8, hdlr.start + 12).toString() === 'vide';
    if (descriptions.some(box => box.end - box.start < (video ? 78 : 28))) return false;
    const sampleCount = bytes.readUInt32BE(stsz.start + 8); const sampleSize = bytes.readUInt32BE(stsz.start + 4);
    if (!sampleCount || stsz.end - stsz.start !== 12 + (sampleSize ? 0 : 4 * sampleCount)) return false;
    for (const [table, stride] of [[stts, 8], [stsc, 12], [offsets, offsets.kind === 'co64' ? 8 : 4]]) {
      const entries = bytes.readUInt32BE(table.start + 4);
      if (!entries || table.end - table.start !== 8 + entries * stride) return false;
    }
    let sampleBytes = sampleSize * sampleCount; let timedSamples = 0;
    if (!sampleSize) for (let cursor = stsz.start + 12; cursor < stsz.end; cursor += 4) sampleBytes += bytes.readUInt32BE(cursor);
    if (sampleBytes > mediaData.reduce((sum, box) => sum + box.end - box.start, 0)) return false;
    for (let cursor = stts.start + 8; cursor < stts.end; cursor += 8) timedSamples += bytes.readUInt32BE(cursor);
    if (timedSamples !== sampleCount) return false;
    for (let cursor = offsets.start + 8; cursor < offsets.end; cursor += offsets.kind === 'co64' ? 8 : 4) {
      const offset = offsets.kind === 'co64' ? bytes.readBigUInt64BE(cursor) : BigInt(bytes.readUInt32BE(cursor));
      if (!mediaData.some(box => offset >= BigInt(box.start) && offset < BigInt(box.end))) return false;
    }
  }
  return true;
}
function binary(bytes) {
  const signatures = ['89504e470d0a1a0a', 'ffd8ff', '474946383761', '474946383961', '504b0304', '504b0506', '1f8b08', '377abcaf271c', '255044462d', '7f454c46', '774f4646', '774f4632', '00000100'];
  const head = bytes.subarray(0, 16).toString('hex');
  return hasWebmHeader(bytes) || hasWebpStructure(bytes) || hasMp4Structure(bytes) || signatures.some(signature => head.startsWith(signature)) || (bytes.subarray(0, 2).toString() === 'MZ' && bytes.includes(0));
}
const textExtension = /\.(?:md|txt|json|jsonl|[cm]?js|jsx|ts|tsx|py|ps1|sh|bat|cmd|ya?ml|toml|ini|conf|config|html?|css|scss|sass|less|svg|xml|csv|tsv|sql|tex|c|cc|cpp|h|hpp|cs|rs|go|java|kt|swift|rb|php|vue|svelte|map)$/iu;

function git(root, args, input, maxBuffer = LIMITS.batch + 1048576) {
  const env = {};
  for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'HOME', 'USERPROFILE', 'TMP', 'TEMP', 'LANG', 'LC_ALL']) if (process.env[key] !== undefined) env[key] = process.env[key];
  // A nonexistent explicit path disables inherited global configuration portably.
  // Windows Git does not accept device names as configuration file paths.
  const nullConfig = path.join(tmpdir(), 'publication-unused-config-' + randomUUID());
  Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: nullConfig, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1' });
  try { return execFileSync('git', ['-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=', ...args], { cwd: root, env, input, maxBuffer, timeout: 15000, killSignal: 'SIGKILL', stdio: ['pipe', 'pipe', 'pipe'] }); } catch { fail('tracked-scan-unavailable'); }
}

function readExceptions(file, root) {
  if (!file) return [];
  let absolute; let value;
  try {
    absolute = realpathSync(file);
    if (inside(root, absolute) || statSync(absolute).size > LIMITS.exceptions) fail('exception-source-invalid');
    value = JSON.parse(decoder().decode(readFileSync(absolute)));
  } catch { fail('exception-source-invalid'); }
  if (!exactKeys(value, ['schemaVersion', 'entries']) || value.schemaVersion !== 1 || !Array.isArray(value.entries) || value.entries.length > 4096) fail('exception-schema-invalid');
  const seen = new Set();
  for (const entry of value.entries) {
    if (!exactKeys(entry, ['path', 'line', 'sha256', 'reason']) || !string(entry.path, 4096) || path.posix.isAbsolute(entry.path) || entry.path.split('/').some(part => part === '..' || part === '') || entry.path.includes('\\') || !Number.isSafeInteger(entry.line) || entry.line < 0 || !/^[a-f0-9]{64}$/u.test(entry.sha256) || !reasons.has(entry.reason)) fail('exception-schema-invalid');
    const key = entry.path + ':' + entry.line;
    if (seen.has(key)) fail('exception-schema-invalid');
    seen.add(key);
  }
  return value.entries.map(entry => ({ ...entry, used: false }));
}

// Inspect reachable administrative entries before any child Git invocation.
// No source or metadata symlink, include file or shared object path is followed.
function inspectMetadata(root, budget) {
  const pending = [root];
  while (pending.length) {
    const location = pending.pop();
    if (++budget.entries > LIMITS.files) fail('gitlink-metadata-limit');
    const info = lstatSync(location);
    if (info.isSymbolicLink() || (!info.isFile() && !info.isDirectory())) fail('gitlink-path-invalid');
    if (info.isDirectory()) {
      const entries = readdirSync(location);
      if (entries.length + budget.entries > LIMITS.files) fail('gitlink-metadata-limit');
      for (const entry of entries) pending.push(path.join(location, entry));
      continue;
    }
    const name = path.basename(location);
    if (name === 'commondir' || name === 'config.worktree' || name === 'alternates' || name === 'http-alternates') fail('gitlink-path-invalid');
    if (name === 'config') {
      if (info.size > 65536) fail('gitlink-path-invalid');
      const config = decoder().decode(readFileSync(location));
      if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(config) || /^\s*\[\s*include(?:if)?(?:[\s.\]"']|$)/imu.test(config)) fail('gitlink-path-invalid');
    }
  }
}

// Only inert managed-environment metadata is accepted on an exact linked owner.
// Parse a deliberately narrow grammar without invoking Git or following includes.
function inspectOwnerWorktreeConfig(file) {
  const info = lstatSync(file);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 65536) fail('gitlink-path-invalid');
  let text; try { text = decoder().decode(readFileSync(file)); } catch { fail('gitlink-path-invalid'); }
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(text)) fail('gitlink-path-invalid');
  let section = false; let count = 0;
  for (const line of text.split(/\r?\n/u)) {
    if (/^\s*(?:[#;].*)?$/u.test(line)) continue;
    if (/^\s*\[codex\]\s*$/iu.test(line) && !section) { section = true; continue; }
    if (!section || !/^\s*localenvironmentconfigpath\s*=\s*(?:"(?:[^"\\\r\n]|\\["\\])*"|[^"\\#;\r\n]+)\s*$/iu.test(line) || ++count > 1) fail('gitlink-path-invalid');
  }
  if (!section || count !== 1) fail('gitlink-path-invalid');
}

// Vet linked-owner configuration before discovery can interpret it. Other
// administrative routing remains subject to the reciprocal ownership checks.
function preflightOwnerConfig(root) {
  const marker = path.join(root, '.git'); const state = lstatSync(marker);
  if (state.isSymbolicLink()) fail('gitlink-path-invalid');
  if (!state.isFile()) return;
  if (state.size > 4096) fail('gitlink-path-invalid');
  const match = decoder().decode(readFileSync(marker)).match(/^gitdir: ([^\x00-\x1f\x7f]+)\r?\n?$/u);
  if (!match) fail('gitlink-path-invalid');
  const owner = path.resolve(root, match[1]);
  const ownerInfo = lstatSync(owner);
  if (!ownerInfo.isDirectory() || ownerInfo.isSymbolicLink() || realpathSync(owner) !== owner) fail('gitlink-path-invalid');
  const entries = readdirSync(owner);
  if (entries.includes('config.worktree')) inspectOwnerWorktreeConfig(path.join(owner, 'config.worktree'));
  if (entries.includes('config')) inspectMetadata(path.join(owner, 'config'), { entries: 0 });
}

// Bind the exact administrative owner, never another linked checkout's modules.
function owningMetadata(root, common, budget) {
  const raw = git(root, ['rev-parse', '--absolute-git-dir']).toString().trim();
  const owner = path.resolve(root, raw);
  function directories(location) {
    let current = path.parse(location).root;
    for (const segment of location.slice(current.length).split(path.sep).filter(Boolean)) {
      current = path.join(current, segment);
      if (++budget.entries > LIMITS.files) fail('gitlink-metadata-limit');
      const state = lstatSync(current); if (!state.isDirectory() || state.isSymbolicLink()) fail('gitlink-path-invalid');
    }
    if (realpathSync(location) !== location) fail('gitlink-path-invalid');
  }
  directories(common); directories(owner);
  if (owner === common) return owner;
  if (path.dirname(owner) !== path.join(common, 'worktrees')) fail('gitlink-path-invalid');
  function pointer(file) {
    const state = lstatSync(file); if (++budget.entries > LIMITS.files) fail('gitlink-metadata-limit');
    if (!state.isFile() || state.isSymbolicLink() || state.size > 4096) fail('gitlink-path-invalid');
    const value = decoder().decode(readFileSync(file));
    if (!/^[^\x00-\x1f\x7f]+\r?\n?$/u.test(value)) fail('gitlink-path-invalid');
    return value.replace(/\r?\n$/u, '');
  }
  if (path.resolve(owner, pointer(path.join(owner, 'commondir'))) !== common) fail('gitlink-path-invalid');
  const marker = path.join(root, '.git');
  if (path.resolve(owner, pointer(path.join(owner, 'gitdir'))) !== marker) fail('gitlink-path-invalid');
  const match = pointer(marker).match(/^gitdir: (.+)$/u);
  if (!match || path.resolve(root, match[1]) !== owner) fail('gitlink-path-invalid');
  const entries = readdirSync(owner);
  if (entries.includes('config.worktree')) inspectOwnerWorktreeConfig(path.join(owner, 'config.worktree'));
  if (entries.includes('config')) inspectMetadata(path.join(owner, 'config'), budget);
  return owner;
}

// Read only submodule source beneath its owning worktree. Standard absorbed
// Git metadata may live in the parent's modules directory, never arbitrary paths.
function gitlinkRoot(root, relative, metadata, budget) {
  if (!relative || path.posix.isAbsolute(relative) || /[\\:\x00-\x1f\x7f]/u.test(relative)) fail('gitlink-path-invalid');
  let child = root;
  for (const segment of relative.split('/')) {
    if (!segment || segment === '.' || segment === '..') fail('gitlink-path-invalid');
    child = path.join(child, segment);
    if (!lstatSync(child).isDirectory() || lstatSync(child).isSymbolicLink()) fail('gitlink-path-invalid');
  }
  const marker = path.join(child, '.git'); const info = lstatSync(marker);
  if (info.isSymbolicLink()) fail('gitlink-path-invalid');
  let ownMetadata = marker;
  if (info.isFile()) {
    if (info.size > 4096) fail('gitlink-path-invalid');
    const match = decoder().decode(readFileSync(marker)).match(/^gitdir: ([^\r\n]+)\r?\n?$/u);
    if (!match) fail('gitlink-path-invalid');
    const target = path.resolve(child, match[1]); const allowed = path.join(metadata, 'modules');
    if (!inside(allowed, target)) fail('gitlink-path-invalid');
    ownMetadata = target;
    let current = metadata;
    for (const segment of path.relative(metadata, target).split(path.sep)) {
      current = path.join(current, segment);
      if (!lstatSync(current).isDirectory() || lstatSync(current).isSymbolicLink()) fail('gitlink-path-invalid');
    }
  } else if (!info.isDirectory()) fail('gitlink-path-invalid');
  inspectMetadata(ownMetadata, budget);
  const actual = realpathSync(git(child, ['rev-parse', '--show-toplevel']).toString().trim());
  if (actual !== child) fail('gitlink-path-invalid');
  return child;
}

// The aggregate ceiling counts every tracked occurrence, never resident bytes.
// 2 GiB covers the measured 1.34 GB consumer corpus; I/O and memo storage stay
// independently bounded at 16 MiB rather than buffering an entire submodule.
export function scanRepository({ root, revision = 'HEAD', policy, exceptionsFile, aggregateBytes = LIMITS.total, cacheAnalysis = true, fontDecoderRoot }) {
  root = realpathSync(root);
  if (revision !== 'HEAD' && !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(revision)) fail('revision-invalid');
  if (!Number.isSafeInteger(aggregateBytes) || aggregateBytes < 1 || aggregateBytes > LIMITS.total) fail('aggregate-budget-invalid');
  if (typeof cacheAnalysis !== 'boolean') fail('analysis-cache-invalid');
  const decodeEot = fontDecoderRoot === undefined ? undefined : createFontDecoder(fontDecoderRoot, root);
  const exceptions = readExceptions(exceptionsFile, root); const findings = []; const observations = [];
  let textFiles = 0; let binaryFiles = 0; let files = 0; let total = 0; let gitlinks = 0; let serial = 0;
  const reportOverhead = Buffer.byteLength(JSON.stringify({ status: 'failed', textFiles: LIMITS.files, binaryFiles: LIMITS.files, observations: [], findings: [] }), 'utf8');
  let resultBytes = reportOverhead; let memoBytes = 0; const memo = new Map();
  const active = new Set(); const metadataBudget = { entries: 0 };
  const keyFor = entry => entry.oid + (textExtension.test(entry.path) ? ':text' : ':auto');
  const record = (target, value) => {
    // JSON escaping can expand a valid path substantially. Charge its real wire
    // representation plus a comma, retaining conservative array/report overhead.
    resultBytes += Buffer.byteLength(JSON.stringify(value), 'utf8') + 1;
    if (findings.length + observations.length >= LIMITS.records || resultBytes > LIMITS.resultBytes) fail('tracked-results-oversized');
    target.push(value);
  };
  function remember(key, result) {
    if (!cacheAnalysis) return;
    const size = Buffer.byteLength(JSON.stringify(result)) + key.length * 2 + 256 + result.matches.length * 128;
    if (size > LIMITS.cache) return;
    while (memoBytes + size > LIMITS.cache) {
      const oldest = memo.keys().next().value; memoBytes -= memo.get(oldest).size; memo.delete(oldest);
    }
    if (memo.has(key)) memoBytes -= memo.get(key).size;
    memo.set(key, { result, size }); memoBytes += size;
  }
  function analyze(bytes, forceText) {
    if (!forceText) {
      try {
        const interpreted = interpretBinaryContent(bytes, { decodeEot });
        if (interpreted) {
          const matches = [];
          for (const value of interpreted.strings) {
            for (const match of findingsIn(value.text, policy, LIMITS.records)) {
              matches.push({ line: 0, category: 'private-language-structured', location: value.location });
              if (matches.length > LIMITS.records) fail('tracked-results-oversized');
            }
          }
          return { kind: 'structured', matches };
        }
      } catch { return { kind: 'unscanned', matches: [] }; }
    }
    if (!forceText && binary(bytes)) return { kind: 'binary', matches: [] };
    let text;
    try { text = decodeText(bytes); if (text.includes('\0')) throw new Error(); }
    catch { return { kind: 'unscanned', matches: [] }; }
    const matches = findingsIn(text, policy, LIMITS.records);
    if (matches.length > LIMITS.records) fail('tracked-results-oversized');
    const lines = text.split(/\r\n|[\r\n\u2028\u2029]/u);
    return { kind: 'text', matches: matches.map(match => ({
      line: match.line,
      category: match.line === match.endLine ? 'private-language' : 'private-language-spanning-lines',
      lineHash: match.line === match.endLine ? hash(Buffer.from(lines[match.line - 1], 'utf8')) : null,
    })) };
  }
  function readBatch(root, batch) {
    const results = new Map(); const pending = []; const requested = new Set();
    for (const entry of batch) {
      const key = keyFor(entry);
      if (cacheAnalysis && memo.has(key)) results.set(entry, memo.get(key).result);
      else if (!cacheAnalysis || !requested.has(entry.oid)) { pending.push(entry); requested.add(entry.oid); }
    }
    if (pending.length) {
      const payload = pending.reduce((sum, entry) => sum + entry.size, 0);
      if (payload > LIMITS.batch) fail('tracked-batch-oversized');
      const headerBudget = pending.reduce((sum, entry) => sum + entry.oid.length + 32, 0);
      const contents = git(root, ['cat-file', '--batch'], pending.map(entry => entry.oid + '\n').join(''), payload + headerBudget);
      let position = 0; let pendingMatches = 0;
      for (const item of pending) {
        const newline = contents.indexOf(10, position);
        if (newline < 0 || contents.subarray(position, newline).toString() !== item.oid + ' blob ' + item.size) fail('tracked-content-invalid');
        const bytes = contents.subarray(newline + 1, newline + 1 + item.size); position = newline + 1 + item.size + 1;
        if (bytes.length !== item.size || contents[position - 1] !== 10) fail('tracked-content-invalid');
        for (const entry of cacheAnalysis ? batch.filter(entry => entry.oid === item.oid && !results.has(entry)) : [item]) {
          const key = keyFor(entry);
          const result = cacheAnalysis && memo.has(key) ? memo.get(key).result : analyze(bytes, textExtension.test(entry.path));
          pendingMatches += result.matches.length;
          if (pendingMatches > LIMITS.records) fail('tracked-results-oversized');
          results.set(entry, result); remember(key, result);
        }
      }
      if (position !== contents.length) fail('tracked-content-invalid');
    }
    return results;
  }
  function inspectPath(entry, prefix) {
    const fullPath = prefix + entry.path; const pathLines = findingsIn(fullPath, policy);
    const reportedPath = pathLines.length ? 'tracked-entry:' + (++serial) : fullPath;
    const accept = (line, category, lineHash) => {
      const exemption = exceptions.find(item => item.path === fullPath && item.line === line);
      if (lineHash && exemption && lineHash === exemption.sha256) { exemption.used = true; record(observations, { path: reportedPath, line, category: 'reviewed-' + exemption.reason }); }
      else record(findings, { path: reportedPath, line, category });
    };
    if (pathLines.length) accept(0, 'private-language-path', hash(Buffer.from(fullPath, 'utf8')));
    return { fullPath, reportedPath, accept };
  }
  function scan(root, revision, prefix, depth) {
    preflightOwnerConfig(root);
    const metadata = realpathSync(path.resolve(root, git(root, ['rev-parse', '--git-common-dir']).toString().trim()));
    if (active.has(metadata)) fail('gitlink-cycle');
    active.add(metadata);
    const owner = owningMetadata(root, metadata, metadataBudget);
    const resolved = git(root, ['rev-parse', '--verify', revision + '^{commit}']).toString().trim();
    const listing = decoder().decode(git(root, ['ls-tree', '-rz', '--full-tree', resolved]));
    const entries = listing.split('\0').filter(Boolean).map(record => {
      const match = record.match(/^([0-7]+) (blob|commit) ([a-f0-9]+)\t([\s\S]+)$/u);
      if (!match) fail('tracked-inventory-invalid');
      return { mode: match[1], type: match[2], oid: match[3], path: match[4] };
    });
    files += entries.length;
    if (files > LIMITS.files) fail('tracked-inventory-oversized');
    const blobs = entries.filter(entry => entry.type === 'blob');
    const sizes = git(root, ['cat-file', '--batch-check=%(objectsize)'], blobs.map(entry => entry.oid + '\n').join('')).toString().trim().split('\n').filter(Boolean).map(Number);
    if (sizes.length !== blobs.length || sizes.some(size => !Number.isSafeInteger(size) || size < 0 || size > LIMITS.file)) fail('tracked-content-oversized');
    blobs.forEach((entry, index) => { entry.size = sizes[index]; });
    total += sizes.reduce((a, b) => a + b, 0);
    if (total > aggregateBytes) fail('tracked-content-oversized');
    let index = 0;
    while (index < entries.length) {
      const entry = entries[index];
      if (entry.type !== 'blob') {
        index += 1;
        const { fullPath, reportedPath } = inspectPath(entry, prefix);
        gitlinks += 1;
        if (gitlinks > LIMITS.gitlinks || depth >= LIMITS.depth) fail('gitlink-limit');
        let child;
        try { child = gitlinkRoot(root, entry.path, owner, metadataBudget); }
        catch { record(findings, { path: reportedPath, line: 0, category: 'unscanned-gitlink' }); continue; }
        let head;
        try { head = git(child, ['rev-parse', '--verify', 'HEAD^{commit}']).toString().trim(); }
        catch { record(findings, { path: reportedPath, line: 0, category: 'unscanned-gitlink' }); continue; }
        if (head !== entry.oid) { record(findings, { path: reportedPath, line: 0, category: 'gitlink-pin-mismatch' }); continue; }
        scan(child, entry.oid, fullPath + '/', depth + 1);
        continue;
      }
      const batch = []; const requested = new Set(); let payload = 0;
      while (index < entries.length && entries[index].type === 'blob' && batch.length < LIMITS.batchEntries) {
        const item = entries[index]; const cached = cacheAnalysis && memo.has(keyFor(item));
        const charge = cached || cacheAnalysis && requested.has(item.oid) ? 0 : item.size;
        if (batch.length && payload + charge > LIMITS.batch) break;
        if (payload + charge > LIMITS.batch) fail('tracked-batch-oversized');
        batch.push(item); if (!cached) requested.add(item.oid); payload += charge; index += 1;
      }
      const results = readBatch(root, batch);
      for (const item of batch) {
        const { reportedPath, accept } = inspectPath(item, prefix); const result = results.get(item);
        if (result.kind === 'binary') { binaryFiles += 1; record(observations, { path: reportedPath, line: 0, category: 'recognized-binary' }); }
        else if (result.kind === 'unscanned') record(findings, { path: reportedPath, line: 0, category: 'text-encoding-unscanned' });
        else if (result.kind === 'structured') { binaryFiles += 1; record(observations, { path: reportedPath, line: 0, category: 'interpreted-binary' }); for (const match of result.matches) record(findings, { path: reportedPath, ...match }); }
        else { textFiles += 1; for (const match of result.matches) accept(match.line, match.category, match.lineHash); }
      }
    }
    active.delete(metadata);
  }
  scan(root, revision, '', 0);
  for (const entry of exceptions) if (!entry.used) record(findings, { path: findingsIn(entry.path, policy).length ? 'reviewed-entry' : entry.path, line: entry.line, category: 'stale-or-unused-exception' });
  const report = { status: findings.length ? 'failed' : 'passed', textFiles, binaryFiles, observations, findings };
  if (Buffer.byteLength(JSON.stringify(report), 'utf8') > LIMITS.resultBytes) fail('tracked-results-oversized');
  return report;
}

async function inputBytes() {
  const chunks = []; let size = 0;
  for await (const chunk of process.stdin) { size += chunk.length; if (size > LIMITS.input) fail('dictionary-input-invalid'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
async function main() {
  const options = { root: process.cwd() }; const args = process.argv.slice(2); let dictionaryFile;
  for (let i = 0; i < args.length; i += 2) {
    const value = args[i + 1];
    if (!value) fail('arguments-invalid');
    if (args[i] === '--root') options.root = value;
    else if (args[i] === '--font-decoder-root') options.fontDecoderRoot = value;
    else if (args[i] === '--revision') options.revision = value;
    else if (args[i] === '--aggregate-bytes') options.aggregateBytes = /^[1-9][0-9]*$/u.test(value) ? Number(value) : NaN;
    else if (args[i] === '--exceptions-file') options.exceptionsFile = value;
    else if (args[i] === '--dictionary-file') dictionaryFile = value;
    else fail('arguments-invalid');
  }
  if (options.fontDecoderRoot !== undefined) createFontDecoder(options.fontDecoderRoot, realpathSync(options.root));
  let bytes;
  if (dictionaryFile) {
    let file;
    try { file = realpathSync(dictionaryFile); if (inside(realpathSync(options.root), file) || statSync(file).size > LIMITS.input) fail('dictionary-source-invalid'); bytes = readFileSync(file); } catch { fail('dictionary-source-invalid'); }
  } else bytes = await inputBytes();
  options.policy = readPolicy(bytes);
  const result = scanRepository(options);
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exitCode = result.status === 'passed' ? 0 : 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { process.stdout.write(JSON.stringify({ status: 'error', findings: [{ path: null, line: 0, category: /^[a-z-]+$/u.test(error?.code ?? '') ? error.code : 'scan-incomplete' }] }) + '\n'); process.exitCode = 2; });
}
