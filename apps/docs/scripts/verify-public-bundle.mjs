import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const dist=fileURLToPath(new URL('../dist/',import.meta.url));
const files=await fs.readdir(dist),inventories=files.filter(name=>/^public-(module|worker)-inventory.*\.json$/.test(name));
if(!inventories.includes('public-module-inventory.json')||inventories.filter(name=>name.startsWith('public-worker-')).length<2)throw Error('Production main and worker module inventories are required.');
let storageGraphs=0;
for(const file of inventories){const value=JSON.parse(await fs.readFile(path.join(dist,file),'utf8'));if(value.schemaVersion!==1||!Array.isArray(value.modules))throw Error('Invalid module inventory.');for(const id of value.modules)if(/apps\/web\/src\/(preferences\.tsx|wording\.mjs|api\.ts)$/.test(id))throw Error('Forbidden public module.');if(value.modules.some(id=>id.endsWith('/local-base64/storage.mjs'))){storageGraphs++;if(!value.modules.includes('apps/docs/src/base64-storage.mjs'))throw Error('Production storage graph is missing its public adapter.');}}
if(storageGraphs<2)throw Error('Both main cleanup/acquisition and stream worker storage graphs must be inspected.');
console.log(`PASS: ${inventories.length} actual production module graphs inspected; ${storageGraphs} storage graphs use the public adapter; forbidden application-state modules absent.`);
