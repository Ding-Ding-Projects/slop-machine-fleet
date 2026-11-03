import os from 'node:os';
function variants(value){return[value,value.replaceAll('\\','/'),value.replaceAll('\\','\\\\')];}
export function assertGeneratedBytes(bytes,label,{roots=[os.homedir(),process.env.FLEET_SOURCE_ROOT,process.env.GITHUB_WORKSPACE,process.cwd()]}={}){
  const text=bytes.toString('latin1').toLowerCase();
  const markers=[...roots.filter(Boolean).flatMap(variants),'.agent/build-stages','.agent\\build-stages','.agent\\\\build-stages'];
  for(const marker of markers)for(const encoding of ['utf8','utf16le'])if(text.includes(Buffer.from(marker.toLowerCase(),encoding).toString('latin1')))throw Error(`Generated payload has a machine/staging path marker in ${label}; matched content withheld.`);
}
export function assertArchiveEntries(entries,kind){
  const normalized=entries.map(name=>name.replaceAll('\\','/').replace(/^\/+/,''));
  if(normalized.some(name=>/(^|\/)builder\.json$/.test(name)||/\.test\.(cjs|mjs|js)$/.test(name)||kind==='desktop'&&/^dist\/companions(?:\/|$)/.test(name)))throw Error(`Generated ${kind} archive contains build-only configuration or intermediate companion input.`);
  const required=kind==='desktop'?['package.json','dist/main.cjs','dist/preload.cjs','dist/connect.html','dist/connect.js','dist/connect.css','dist/external-links.cjs','dist/update-feed.cjs','dist/updates.cjs']:['package.json','main.cjs','preload.cjs','actions.cjs','protect-config.ps1','index.html','reader.js','ui.js','style.css','mode.json','articles.json','assets.json'];
  for(const name of required)if(!normalized.includes(name))throw Error(`Generated ${kind} archive is missing required runtime input ${name}.`);
}
export function peDebugTypes(bytes){
  if(bytes.toString('ascii',0,2)!=='MZ')throw Error('Managed worker output is not a PE image.');
  const pe=bytes.readUInt32LE(0x3c);if(bytes.toString('ascii',pe,pe+4)!=='PE\0\0')throw Error('Managed worker PE header is invalid.');
  const count=bytes.readUInt16LE(pe+6),optional=pe+24,optionalSize=bytes.readUInt16LE(pe+20),magic=bytes.readUInt16LE(optional);
  const directories=optional+(magic===0x20b?112:magic===0x10b?96:0);if(directories===optional)throw Error('Managed worker PE format is unsupported.');
  const rva=bytes.readUInt32LE(directories+48),size=bytes.readUInt32LE(directories+52);if(!rva&&!size)return[];
  if(size%28||size/28>128)throw Error('Managed worker debug directory exceeds its bounded layout.');
  let start;
  for(let i=0;i<count;i++){const section=optional+optionalSize+i*40,virtualSize=bytes.readUInt32LE(section+8),address=bytes.readUInt32LE(section+12),rawSize=bytes.readUInt32LE(section+16),raw=bytes.readUInt32LE(section+20);if(rva>=address&&rva<address+Math.max(virtualSize,rawSize)){start=raw+rva-address;break;}}
  if(start===undefined||start+size>bytes.length)throw Error('Managed worker debug directory is outside its PE image.');
  const result=[];for(let i=0;i<size;i+=28)result.push(bytes.readUInt32LE(start+i+12));return result;
}
