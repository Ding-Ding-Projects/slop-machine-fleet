import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const desktop = path.join(root, 'apps/desktop');
const require = createRequire(path.join(desktop, 'package.json'));
const args = process.argv.slice(2);
if (args.some(arg => !['--prepare-only'].includes(arg))) throw new Error('Supported option: --prepare-only');
const pkg = JSON.parse(await fs.readFile(path.join(desktop, 'package.json'), 'utf8'));
const articles = [];
const assets = {};
async function collect(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('Documentation symlinks are not bundled.');
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await collect(file);
    else if (/\.md$/i.test(entry.name)) {
      const text = await fs.readFile(file, 'utf8');
      if (Buffer.byteLength(text) > 2 * 1024 * 1024) throw new Error('A documentation article exceeds the offline reader limit.');
      articles.push({ id: path.relative(root, file).replaceAll('\\', '/'), title: text.match(/^#\s+(.+)$/m)?.[1] ?? entry.name, text });
    }
  }
}
await collect(path.join(root, 'docs'));
await collect(path.join(root, 'deploy'));
for (const name of ['README.md', 'ROADMAP.md', 'HANDOFF.md']) {
  const text = await fs.readFile(path.join(root, name), 'utf8');
  articles.push({ id: name, title: text.match(/^#\s+(.+)$/m)?.[1] ?? name, text });
}
if (!articles.length) throw new Error('Complete documentation must be present before packaging.');
const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
for (const article of articles) {
  for (const match of article.text.matchAll(/!\[[^\]]*\]\(([^\s)]+)\)/g)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(match[1])) continue;
    const source = path.resolve(root, path.dirname(article.id), decodeURIComponent(match[1].split('#')[0]));
    const real = await fs.realpath(source);
    const relative = path.relative(root, real);
    if (relative.startsWith('..') || path.isAbsolute(relative) || !mime[path.extname(real).toLowerCase()]) throw new Error('An offline image is outside the source or has an unsupported format.');
    const bytes = await fs.readFile(real);
    if (bytes.length > 8 * 1024 * 1024) throw new Error('An offline image exceeds the 8 MB limit.');
    assets[path.relative(root, source).replaceAll('\\', '/')] = `data:${mime[path.extname(real).toLowerCase()]};base64,${bytes.toString('base64')}`;
  }
}
for (const mode of ['build', 'host', 'docs']) {
  const stage = path.join(desktop, 'dist/companions', mode);
  await fs.mkdir(stage, { recursive: true });
  await fs.cp(path.join(desktop, 'companions'), stage, { recursive: true });
  await fs.mkdir(path.join(stage, 'build'), { recursive: true });
  for (const name of ['icon.ico', 'LICENSE.material-symbols', 'apply-icon.cjs']) await fs.copyFile(path.join(desktop, 'build', name), path.join(stage, 'build', name));
  const helperBytes = await fs.readFile(path.join(desktop,'companions/protect-config.ps1'));
  const nativeHelper = { name:'protect-config.ps1',bytes:helperBytes.length,sha256:createHash('sha256').update(helperBytes).digest('hex') };
  await fs.writeFile(path.join(stage, 'mode.json'), JSON.stringify({ mode, version: pkg.version, nativeHelper }));
  await fs.writeFile(path.join(stage, 'articles.json'), JSON.stringify(articles));
  await fs.writeFile(path.join(stage, 'assets.json'), JSON.stringify(assets));
  const title = { build: 'Build', host: 'Hosting Setup', docs: 'Offline Guide' }[mode];
  await fs.writeFile(path.join(stage, 'package.json'), JSON.stringify({ name: `fleet-${mode}-companion`, version: pkg.version, description: `Slop Machine Fleet ${title}`, author: 'Ding Ding Projects', main: 'main.cjs', private: true }, null, 2));
  if (args.includes('--prepare-only')) continue;
  if (process.platform !== 'win32') throw new Error('Portable companion production requires Windows.');
  const runtimeFiles = ['main.cjs','preload.cjs','actions.cjs','protect-config.ps1','index.html','reader.js','ui.js','style.css','mode.json','articles.json','assets.json','package.json','build/icon.ico','build/LICENSE.material-symbols'];
  const config = { appId: `org.dingdingprojects.slopmachinefleet.${mode}`, productName: `Fleet ${title}`, asar: true, asarUnpack:['protect-config.ps1'], afterPack: 'build/apply-icon.cjs', files: runtimeFiles, electronVersion: pkg.devDependencies.electron, directories: { output: path.join(desktop, 'release/companions', mode) }, win: { target: ['portable'], icon: 'build/icon.ico', signAndEditExecutable: false, forceCodeSigning: false }, portable: { artifactName: `Fleet-${mode}-${pkg.version}.exe` } };
  await fs.writeFile(path.join(stage, 'builder.json'), JSON.stringify(config));
  const cli = require.resolve('electron-builder/cli.js');
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, '--projectDir', stage, '--config', 'builder.json', '--win', 'portable', '--publish', 'never'], { cwd: desktop, stdio: 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Companion ${mode} packaging exited ${code}.`)));
  });
}
console.log(`Prepared ${articles.length} complete documentation articles for three companions. Portable runtime verification is separate.`);
