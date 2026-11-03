import {claimTemporary as claim,createTemporarySink as sink,removeTemporary as remove,storageBudget,acquireAndStart} from '../../../packages/shared/local-base64/storage.mjs';
export {storageBudget,acquireAndStart};
export const PUBLIC_TEMP_ROOT='fleet-docs-base64-v1';
export function publicStorage(storage=globalThis.navigator?.storage){return storage&&{estimate:()=>storage.estimate(),getDirectory:async()=>(await storage.getDirectory()).getDirectoryHandle(PUBLIC_TEMP_ROOT,{create:true})};}
export function publicLocks(locks=globalThis.navigator?.locks){return locks&&{request:(name,options,callback)=>locks.request(`fleet.docs:${name}`,options,callback)};}
export function claimTemporary(options){return claim({...options,storage:publicStorage(options.storage),locks:publicLocks(options.locks)});}
export function createTemporarySink(options){return sink({...options,storage:publicStorage(options.storage),locks:publicLocks(options.locks)});}
export function removeTemporary(value,storage,locks){return remove(value,publicStorage(storage),publicLocks(locks));}
