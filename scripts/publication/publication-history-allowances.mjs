// Historical source allowances remain exact; only content present in a revision is selected.
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { validateExceptionCarrier } from './publication-exceptions.mjs';
export function selectHistoricalAllowances(file, root, revision, git) {
  const absolute = realpathSync(file);
  const relative = path.relative(realpathSync(root), absolute);
  if (relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) throw new Error('trusted-policy-inside-candidate');
  const bytes = readFileSync(absolute);
  if (bytes.length > 262144) throw new Error('historical-allowances-oversized');
  const inventory = JSON.parse(bytes);
  validateExceptionCarrier(inventory);
  if (inventory.schemaVersion !== 1 || inventory.entries.some(entry => entry.line < 1)) throw new Error('historical-allowances-invalid');
  const entries = [];
  for (const entry of inventory.entries) {
    let source;
    try { source = git(root, ['show', revision + ':' + entry.path]); }
    catch { continue; } // An absent source path grants no exception.
    const line = source.split(/\r?\n/u)[entry.line - 1];
    if (line !== undefined && createHash('sha256').update(line).digest('hex') === entry.sha256) entries.push(entry);
  }
  return { schemaVersion: 1, entries };
}
