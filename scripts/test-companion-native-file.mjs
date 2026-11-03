import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);const{configurationHelperPath,validatedConfigurationHelper}=require('../apps/desktop/companions/actions.cjs');
test('packaged helper uses real unpacked resources while prepared development uses its source file',()=>{
  const resources=path.resolve('fixture-resources');assert.equal(configurationHelperPath(path.join(resources,'app.asar'),resources),path.join(resources,'app.asar.unpacked','protect-config.ps1'));
  const source=path.resolve('fixture-source');assert.equal(configurationHelperPath(source,resources),path.join(source,'protect-config.ps1'));assert.throws(()=>configurationHelperPath(path.join(resources,'app.asar'),undefined));
});
test('helper inventory/hash is verified before use; source bytes remain unchanged',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'fleet-native-file-'));
  try{const bytes=await fs.readFile(new URL('../apps/desktop/companions/protect-config.ps1',import.meta.url));const file=path.join(directory,'protect-config.ps1');await fs.writeFile(file,bytes);await fs.writeFile(path.join(directory,'mode.json'),JSON.stringify({nativeHelper:{name:'protect-config.ps1',bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')}}));assert.equal(await validatedConfigurationHelper(directory),file);assert.deepEqual(await fs.readFile(file),bytes);await fs.appendFile(file,'\n# altered fixture');await assert.rejects(()=>validatedConfigurationHelper(directory),/inventoried/);await fs.writeFile(file,Buffer.alloc(bytes.length));await assert.rejects(()=>validatedConfigurationHelper(directory),/hash/);}finally{await fs.rm(directory,{recursive:true});}
});
