const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const states=new Set(['unknown','pending','input-required','code-issued','verified','error','expired','cancelled']);
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
function bounded(value,max){return typeof value==='string'&&value.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);}
export function recognizedPrompt(value,provider,state){
 if(value==null)return null;
 if(provider!=='github'||!object(value)||!uuid(value.promptId)||!bounded(value.title,200)||!Array.isArray(value.choices)||!Array.isArray(value.allowedActions))return null;
 const allowed=['promptId','kind','title','choices','defaultChoice','allowedActions'];
 if(Object.keys(value).some(key=>!allowed.includes(key)))return null;
 if(value.choices.some(choice=>!object(choice)||!['yes','no'].includes(choice.value)||!bounded(choice.label,80)||Object.keys(choice).some(key=>!['value','label'].includes(key))))return null;
 if(value.kind==='github-credential-helper'&&state==='input-required'&&value.defaultChoice==='yes'&&value.choices.length===2&&new Set(value.choices.map(choice=>choice.value)).size===2&&value.allowedActions.length===2&&new Set(value.allowedActions).size===2&&value.allowedActions.includes('choose')&&value.allowedActions.includes('enter'))return {promptId:value.promptId,kind:value.kind,choices:['yes','no'],defaultChoice:'yes',allowedActions:['choose','enter']};
 if(value.kind==='github-open-browser'&&state==='code-issued'&&value.defaultChoice===null&&value.choices.length===0&&value.allowedActions.length===1&&value.allowedActions[0]==='enter')return {promptId:value.promptId,kind:value.kind,choices:[],defaultChoice:null,allowedActions:['enter']};
 return null;
}
/** @param {unknown} value @param {string} provider @param {string|null} expectedSessionId */
export function readAuthState(value,provider,expectedSessionId=null){
 if(!object(value)||!states.has(value.state)||!['github','codex','pairing'].includes(provider))throw Error('AUTH_RESPONSE_INVALID');
 const legacy=!Object.hasOwn(value,'sessionId')||!Object.hasOwn(value,'prompt');
 if(!legacy&&!(value.sessionId===null||uuid(value.sessionId)))throw Error('AUTH_RESPONSE_INVALID');
 if(Object.keys(value).some(key=>!['state','sessionId','prompt','verificationUrl','userCode','expiresAt','errorCode'].includes(key)))throw Error('AUTH_RESPONSE_INVALID');
 if(expectedSessionId&&!same(value.sessionId,expectedSessionId))throw Error('AUTH_SESSION_CHANGED');
 if(value.verificationUrl!=null&&!bounded(value.verificationUrl,2048)||value.userCode!=null&&!bounded(value.userCode,128)||value.errorCode!=null&&(!bounded(value.errorCode,100)||!/^[A-Z0-9_]+$/.test(value.errorCode)))throw Error('AUTH_RESPONSE_INVALID');
 if(value.expiresAt!=null&&(!bounded(value.expiresAt,80)||!Number.isFinite(Date.parse(value.expiresAt))))throw Error('AUTH_RESPONSE_INVALID');
 let verificationUrl;
 if(value.verificationUrl){try{const url=new URL(value.verificationUrl);if(url.protocol==='https:'&&!url.username&&!url.password)verificationUrl=url.href;}catch{/* Invalid links remain inactive. */}}
 const prompt=!legacy&&value.sessionId?recognizedPrompt(value.prompt,provider,value.state):null;
 return {state:value.state,sessionId:legacy?null:value.sessionId,prompt,legacy,unsupportedPrompt:!legacy&&(value.state==='input-required'&&!prompt||value.prompt!=null&&!prompt),
  ...(value.state==='code-issued'?{verificationUrl,userCode:value.userCode}:{}),expiresAt:value.expiresAt??null,errorCode:value.errorCode??null};
}
export function promptRequest(current,action,choice){
 if(!current||!uuid(current.sessionId)||!current.prompt||current.unsupportedPrompt||!current.prompt.allowedActions.includes(action)||current.expiresAt&&Date.parse(current.expiresAt)<=Date.now())throw Error('AUTH_PROMPT_UNAVAILABLE');
 const request={sessionId:current.sessionId,promptId:current.prompt.promptId,action};
 if(action==='choose'){if(!current.prompt.choices.includes(choice))throw Error('AUTH_CHOICE_INVALID');request.choice=choice;}
 else if(action!=='enter'||choice!==undefined)throw Error('AUTH_ACTION_INVALID');
 return request;
}
export function isCurrentPrompt(current,request){
 if(!current?.prompt||!same(current.sessionId,request?.sessionId)||!same(current.prompt.promptId,request?.promptId))return false;
 try{const valid=promptRequest(current,request.action,request.choice);return Object.keys(request).length===Object.keys(valid).length&&Object.keys(valid).every(key=>request[key]===valid[key]);}catch{return false;}
}
export function cancellationPath(path,current){if(!uuid(current?.sessionId))throw Error('AUTH_SESSION_UNAVAILABLE');return `${path}?sessionId=${encodeURIComponent(current.sessionId)}`;}
export function createAuthOwnership(){let sequence=0,alive=false;return {mount(){alive=true;sequence++;},dispose(){alive=false;sequence++;},begin(){if(!alive)throw Error('AUTH_VIEW_UNAVAILABLE');return ++sequence;},isCurrent(ticket){return alive&&ticket===sequence;}};}
