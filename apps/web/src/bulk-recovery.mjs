const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const actions=new Set(['start','stop','restart','repair','update','drain','terminate']);
export function readOperation(value,expectedId){if(!value||typeof value!=='object'||!uuid(value.id)||value.id!==expectedId||typeof value.action!=='string'||value.action.length>80||typeof value.state!=='string'||value.state.length>80||!Array.isArray(value.targets)||value.targets.length>5000)throw Error('OPERATION_RESPONSE_INVALID');const ids=new Set();for(const target of value.targets){if(!target||!uuid(target.id)||ids.has(target.id)||typeof target.state!=='string'||target.state.length>80)throw Error('OPERATION_RESPONSE_INVALID');ids.add(target.id);}return value;}
export function resumeReason(operation,target){
 if(operation?.kind!=='bulk'||operation.durabilityVersion!==1||operation.legacy===true||!uuid(operation.ownerId)||!actions.has(operation.action)||!/^[a-f0-9]{64}$/.test(operation.requestHash||''))return 'ledger-unavailable';
 const original=target&&operation.targets?.find(item=>item.id===target.id);
 if(!original)return 'foreign-target';
 target=original;
 if(target.state==='reconciliation-required'||target.dispatchState==='uncertain'||target.attempt?.phase==='uncertain'||target.attempt?.phase==='dispatching')return 'uncertain';
 if(target.state==='completed')return 'completed';
 if(target.state==='requested'||target.dispatchState==='acknowledged'||target.attempt!==null)return 'already-attempted';
 if(!['pending','blocked'].includes(target.state)||target.dispatchState!=='never-dispatched')return 'not-eligible';
 return null;
}
export function createResumeRequest(operation,workerIds){
 if(!Array.isArray(workerIds)||!workerIds.length||workerIds.length>5||new Set(workerIds).size!==workerIds.length)throw Error('INVALID_RESUME_TARGETS');
 for(const id of workerIds){const target=operation.targets.find(item=>item.id===id);if(resumeReason(operation,target)!==null)throw Error('TARGET_NOT_RESUMABLE');}
 return {workerIds:[...workerIds],requestHash:operation.requestHash};
}
export function resumeReview(operation,workerIds){const request=createResumeRequest(operation,workerIds);return {operationId:operation.id,action:operation.action,request,signature:JSON.stringify({id:operation.id,ownerId:operation.ownerId,action:operation.action,requestHash:operation.requestHash,targets:request.workerIds.map(id=>{const value=operation.targets.find(item=>item.id===id);return {id,state:value.state,dispatchState:value.dispatchState,attempt:value.attempt};})})};}
export function reviewStillEligible(operation,review){try{return resumeReview(operation,review.request.workerIds).signature===review.signature;}catch{return false;}}
