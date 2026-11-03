import {safeEnvelope,parseStored} from './core.mjs';
export const exportFormats=['json','yaml','toml','xml','csv','tsv','md','html','sql'];
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
const quoted=value=>JSON.stringify(value);
function toml(value){if(typeof value==='string')return quoted(value);if(typeof value==='number'||typeof value==='boolean')return String(value);if(Array.isArray(value))return `[${value.map(toml).join(', ')}]`;if(value&&typeof value==='object')return `{ ${Object.entries(value).map(([key,item])=>`${quoted(key)} = ${toml(item)}`).join(', ')} }`;throw Error('TOML export does not accept null or unsupported values.');}
function xml(value){if(Array.isArray(value))return `<array>${value.map(item=>`<item>${xml(item)}</item>`).join('')}</array>`;if(value&&typeof value==='object')return `<object>${Object.entries(value).map(([key,item])=>`<member name="${escape(key)}">${xml(item)}</member>`).join('')}</object>`;return `<${typeof value}>${escape(value)}</${typeof value}>`;}
export function tableCell(value){return `json:${JSON.stringify(value)}`;}
export function decodeTableCell(value){if(!value.startsWith('json:'))throw Error('Missing typed cell prefix.');return JSON.parse(value.slice(5));}
function delimited(rows,separator){return rows.map(row=>row.map(value=>`"${tableCell(value).replaceAll('"','""')}"`).join(separator)).join('\r\n')+'\r\n';}
export function serializeExport(state,format){
 if(!exportFormats.includes(format))throw Error('Unsupported export format.');
 const data=safeEnvelope(parseStored(JSON.stringify(state)));
 data.exclusions.push('Workspace navigation identities and live destination/element labels are omitted.');
 data.representation='Original technical metadata. CSV/TSV cells use a reversible json: prefix plus JSON-typed values, preventing spreadsheet formula execution. YAML uses the JSON-compatible YAML 1.2 subset. SQL targets SQLite and stores each complete top-level value as JSON text.';
 const json=JSON.stringify(data,null,2);
 if(format==='json')return {text:json,mime:'application/json'};
 if(format==='yaml')return {text:json+'\n',mime:'application/yaml'};
 if(format==='toml')return {text:Object.entries(data).map(([key,value])=>`${quoted(key)} = ${toml(value)}`).join('\n')+'\n',mime:'application/toml'};
 if(format==='xml')return {text:`<?xml version="1.0" encoding="UTF-8"?>\n<platform-export>${xml(data)}</platform-export>`,mime:'application/xml'};
 if(format==='csv'||format==='tsv')return {text:delimited([['field','typed_value'],...Object.entries(data)],format==='csv'?',':'\t'),mime:format==='csv'?'text/csv':'text/tab-separated-values'};
 if(format==='md')return {text:`# Platform records\n\n${data.representation}\n\n## Exclusions\n\n${data.exclusions.map(item=>`- ${item}`).join('\n')}\n\n## Complete safe records\n\n\`\`\`json\n${json}\n\`\`\`\n`,mime:'text/markdown'};
 if(format==='html')return {text:`<!doctype html><html lang="en"><meta charset="utf-8"><title>Platform records</title><body><h1>Platform records</h1><p>${escape(data.representation)}</p><h2>Exclusions</h2><ul>${data.exclusions.map(item=>`<li>${escape(item)}</li>`).join('')}</ul><h2>Complete safe records</h2><pre>${escape(json)}</pre></body></html>`,mime:'text/html'};
 const sql=value=>`'${String(value).replaceAll("'","''")}'`;
 return {text:'BEGIN TRANSACTION;\nCREATE TABLE IF NOT EXISTS platform_export (field TEXT NOT NULL, payload_json TEXT NOT NULL);\n'+Object.entries(data).map(([key,value])=>`INSERT INTO platform_export (field, payload_json) VALUES (${sql(key)}, ${sql(JSON.stringify(value))});`).join('\n')+'\nCOMMIT;\n',mime:'application/sql'};
}
