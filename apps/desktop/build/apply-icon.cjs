const path = require('node:path');
const fs = require('node:fs/promises');
const { executeAppBuilder } = require('builder-util');

// Resource editing is deliberately separate from signing. This hook never calls a signer.
module.exports = async function applyIcon(context) {
  if (context.electronPlatformName !== 'win32') throw new Error('Fleet packaging targets Windows only.');
  const icon = path.join(context.packager.projectDir, 'build', 'icon.ico');
  const bytes = await fs.readFile(icon);
  if (bytes.length < 22 || bytes.readUInt16LE(0) !== 0 || bytes.readUInt16LE(2) !== 1 || bytes.readUInt16LE(4) !== 7) throw new Error('The reviewed seven-size packaging icon is missing or invalid.');
  const executable = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  if (!(await fs.stat(executable)).isFile()) throw new Error('The packaged Windows executable is missing.');
  await executeAppBuilder(['rcedit', '--args', JSON.stringify([executable, '--set-icon', icon])], undefined, {}, 3);
};
