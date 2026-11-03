const unsafe=new Set(['__proto__','constructor','prototype']);
export function parseWording(source){
 if(typeof source!=='string'||new TextEncoder().encode(source).length>262144)throw Error('Invalid size');
 const stack=[];for(let i=0;i<source.length;i++){const c=source[i];if(c==='"'){const start=i;while(++i<source.length){if(source[i]==='\\'){i++;continue;}if(source[i]==='"')break;}const raw=source.slice(start,i+1);let next=i+1;while(/\s/.test(source[next]||'')&&next<source.length)next++;if(source[next]===':'){const k=JSON.parse(raw);const frame=stack.at(-1);if(!frame||frame.has(k)||unsafe.has(k))throw Error('Invalid key');frame.add(k);}}else if(c==='{'){stack.push(new Set());if(stack.length>8)throw Error('Too deep');}else if(c==='['){stack.push(new Set());if(stack.length>8)throw Error('Too deep');}else if(c==='}'||c===']')stack.pop();}
 const value=JSON.parse(source);if(!value||Array.isArray(value)||Object.keys(value).sort().join(',')!=='entries,schemaVersion'||value.schemaVersion!==1||!value.entries||typeof value.entries!=='object'||Array.isArray(value.entries))throw Error('Invalid schema');
 for(const [k,v]of Object.entries(value.entries)){if(unsafe.has(k)||!k||[...k].length>160||typeof v!=='string'||[...v].length>1000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v))throw Error('Invalid entry');}
 return value;
}
export function replaceWording(text,entries){const keys=Object.keys(entries).sort((a,b)=>b.length-a.length);if(!keys.length)return text;const escaped=keys.map(k=>k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));return text.replace(new RegExp(`(?<![\\p{L}\\p{N}_])(?:${escaped.join('|')})(?![\\p{L}\\p{N}_])`,'gu'),match=>entries[match]);}
