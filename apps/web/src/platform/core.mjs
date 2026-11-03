export const PLATFORM_SCHEMA=1;
export const RECORD_LIMIT=500;
export const STORAGE_BYTES=2*1024*1024;
const idPattern=/^[a-z][a-z0-9_-]{0,63}$/;
const workspacePattern=/^[a-f0-9]{32,64}$/;
const safeKeys=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>keys.includes(key));
export function validId(value){return typeof value==='string'&&idPattern.test(value);}
export function validScope(value){return typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);}
export function reviewStillCurrent(before,current,scope,currentScope,version,currentVersion){return before===current&&validScope(scope)&&scope===currentScope&&version===currentVersion;}
export function rovingTabId(visible,active){return visible.find(tab=>tab.id===active)?.id||visible[0]?.id||'';}
export function registryMap(entries){const map=new Map();for(const entry of entries){if(!validId(entry.id)||map.has(entry.id))throw Error('Registry IDs must be unique bounded technical identifiers.');map.set(entry.id,entry);}return map;}
export function initialState(){return {schemaVersion:1,tabs:[],activeTab:'',preferences:{dock:'left',showLabels:true},appearance:{},notifications:[],history:[],nextSequence:1};}
export function validatePreferences(value){if(!safeKeys(value,['dock','showLabels'])||!['left','right','top','bottom'].includes(value.dock)||typeof value.showLabels!=='boolean')throw Error('Invalid platform preferences.');return {...value};}
export const fontFamilies=['Geist','Geist Mono','system-ui','serif','monospace'];
export function validateAppearance(value){
 const bounds={fontSize:[10,48],fontWeight:[100,900],padding:[0,48],gap:[0,48],radius:[0,64],borderWidth:[0,8]};
 if(!safeKeys(value,['foreground','background','fontFamily','fontSize','fontWeight','padding','gap','radius','borderWidth','reduceMotion']))throw Error('Unknown appearance property.');
 for(const [key,item]of Object.entries(value)){
  if(['foreground','background'].includes(key)){if(typeof item!=='string'||!/^#[0-9a-fA-F]{6}$/.test(item))throw Error('Use a six-digit hexadecimal color.');}
  else if(key==='fontFamily'){if(!fontFamilies.includes(item))throw Error('Unsupported font family.');}
  else if(key==='reduceMotion'){if(typeof item!=='boolean')throw Error('Invalid motion preference.');}
  else {const [min,max]=bounds[key];if(!Number.isFinite(item)||!Number.isInteger(item)||item<min||item>max)throw Error('Appearance value is outside its supported range.');}
 }
 return {...value};
}
export function appearanceProperties(value){const valid=validateAppearance(value),out={};const names={foreground:'color',background:'background-color',fontFamily:'font-family',fontSize:'font-size',fontWeight:'font-weight',padding:'padding',gap:'gap',radius:'border-radius',borderWidth:'border-width'};for(const [key,item]of Object.entries(valid)){if(key==='reduceMotion'){if(item){out['transition-duration']='0s';out['animation-duration']='0s';}continue;}out[names[key]]=typeof item==='number'&&key!=='fontWeight'?`${item}px`:String(item);}if(valid.borderWidth>0)out['border-style']='solid';return out;}
export function validateNotification(value,destinationIds){
 if(!safeKeys(value,['kind','outcome','destinationId','count'])||!['operation','settings','export','navigation'].includes(value.kind)||!['queued','running','completed','failed','cancelled','partial','unavailable'].includes(value.outcome)||!destinationIds.includes(value.destinationId)||!Number.isSafeInteger(value.count)||value.count<0||value.count>1000000)throw Error('Only structured registered status metadata is accepted.');
 return {kind:value.kind,outcome:value.outcome,destinationId:value.destinationId,count:value.count};
}
export function navigateState(state,destinationId,{explicit=false,workspaceKey=''}={}){
 if(!validId(destinationId)||workspaceKey&&!workspacePattern.test(workspaceKey))throw Error('Invalid navigation identity.');
 const existing=state.tabs.find(tab=>workspaceKey?tab.workspaceKey===workspaceKey:!tab.workspaceKey&&tab.destinationId===destinationId);
 if(existing)return {...state,activeTab:existing.id};
 const tabs=state.tabs.map(tab=>({...tab}));
 const active=tabs.find(tab=>tab.id===state.activeTab);
 if(active?.pinned&&!explicit&&!workspaceKey)throw Error('Unpin the active tab or use the explicit New tab catalog.');
 if(active&&!explicit&&!workspaceKey&&!active.workspaceKey){active.destinationId=destinationId;return {...state,tabs};}
 if(active&&!explicit&&!workspaceKey&&active.workspaceKey){active.destinationId=destinationId;return {...state,tabs};}
 const id=workspaceKey?`workspace-${workspaceKey}`:`tab-${crypto.randomUUID()}`;
 tabs.push({id,destinationId,workspaceKey,pinned:false});
 return {...state,tabs,activeTab:id};
}
export function closeTabState(state,id,includePinned=false){const current=state.tabs.find(tab=>tab.id===id);if(!current)return state;if(current.pinned&&!includePinned)throw Error('Unpin this tab before closing it.');const index=state.tabs.indexOf(current),tabs=state.tabs.filter(tab=>tab.id!==id);return {...state,tabs,activeTab:state.activeTab===id?(tabs[Math.min(index,tabs.length-1)]?.id||''):state.activeTab};}
function snapshot(state){return {preferences:{...state.preferences},appearance:structuredClone(state.appearance)};}
export function recordMutation(state,action,next,at,targetId='',restores=0){
 if(state.history.length>=RECORD_LIMIT)throw Error('History capacity reached. Export and explicitly reset history before further changes.');
 if(!['preferences','appearance','appearance-reset','restore'].includes(action)||!Number.isFinite(Date.parse(at))||targetId&&!validId(targetId))throw Error('Invalid history event.');
 const record={sequence:state.nextSequence,at,action,targetId,restores,snapshot:snapshot(next)};
 return {...next,history:[...state.history,record],nextSequence:state.nextSequence+1};
}
export function restoreHistory(state,sequence,at,elementIds){const record=state.history.find(item=>item.sequence===sequence);if(!record)throw Error('History entry is unavailable.');const appearance={};for(const [id,value]of Object.entries(record.snapshot.appearance)){if(!elementIds.includes(id))throw Error('A recorded appearance target is no longer registered.');appearance[id]=validateAppearance(value);}const next={...state,preferences:validatePreferences(record.snapshot.preferences),appearance};return recordMutation(state,'restore',next,at,'',sequence);}
export function parseStored(source){
 if(typeof source!=='string'||new TextEncoder().encode(source).length>STORAGE_BYTES)throw Error('Stored platform data exceeds its size bound.');
 const value=JSON.parse(source);
 if(!safeKeys(value,['schemaVersion','tabs','activeTab','preferences','appearance','notifications','history','nextSequence'])||value.schemaVersion!==1||!Array.isArray(value.tabs)||value.tabs.length>100||!Array.isArray(value.notifications)||value.notifications.length>RECORD_LIMIT||!Array.isArray(value.history)||value.history.length>RECORD_LIMIT||!Number.isSafeInteger(value.nextSequence)||value.nextSequence<1)throw Error('Stored platform data is invalid.');
 validatePreferences(value.preferences);
 const validateStyles=styles=>{if(!styles||typeof styles!=='object'||Array.isArray(styles))throw Error('Invalid appearance records.');for(const [id,style]of Object.entries(styles)){if(!validId(id))throw Error('Invalid appearance ID.');validateAppearance(style);}};
 validateStyles(value.appearance);
 const seen=new Set();for(const tab of value.tabs){if(!safeKeys(tab,['id','destinationId','workspaceKey','pinned'])||typeof tab.id!=='string'||!/^(?:tab-[0-9a-f-]{36}|workspace-[a-f0-9]{32,64})$/.test(tab.id)||seen.has(tab.id)||!validId(tab.destinationId)||typeof tab.workspaceKey!=='string'||tab.workspaceKey&&!workspacePattern.test(tab.workspaceKey)||typeof tab.pinned!=='boolean')throw Error('Invalid stored tab.');seen.add(tab.id);}
 if(typeof value.activeTab!=='string'||value.activeTab&&!seen.has(value.activeTab))throw Error('Invalid active tab.');
 let prior=0;for(const item of value.history){if(!safeKeys(item,['sequence','at','action','targetId','restores','snapshot'])||!Number.isSafeInteger(item.sequence)||item.sequence<=prior||item.sequence>=value.nextSequence||!Number.isFinite(Date.parse(item.at))||!['preferences','appearance','appearance-reset','restore'].includes(item.action)||typeof item.targetId!=='string'||item.targetId&&!validId(item.targetId)||!Number.isSafeInteger(item.restores)||item.restores<0||item.restores>=item.sequence||!safeKeys(item.snapshot,['preferences','appearance']))throw Error('Invalid history record.');prior=item.sequence;validatePreferences(item.snapshot.preferences);validateStyles(item.snapshot.appearance);}
 const notificationIds=new Set();for(const item of value.notifications){if(!safeKeys(item,['id','at','kind','outcome','destinationId','count','dismissed'])||typeof item.id!=='string'||!/^[0-9a-f-]{36}$/.test(item.id)||notificationIds.has(item.id)||!Number.isFinite(Date.parse(item.at))||typeof item.dismissed!=='boolean'||!validId(item.destinationId))throw Error('Invalid notification record.');validateNotification({kind:item.kind,outcome:item.outcome,destinationId:item.destinationId,count:item.count},[item.destinationId]);notificationIds.add(item.id);}
 return value;
}
export function safeEnvelope(state){return {schemaVersion:1,exclusions:['Product records, task prompts and output, account data, authentication values, personal wording, source image pixels and file metadata are excluded.'],representation:'Original technical metadata; no display translations.',preferences:state.preferences,appearance:state.appearance,notifications:state.notifications,history:state.history};}
