import {openHistory as open} from '../../../packages/shared/local-base64/history.mjs';
export {metadataOnly} from '../../../packages/shared/local-base64/history.mjs';
export const PUBLIC_HISTORY_NAME='fleet.docs.base64.history.v1';
export function openHistory(factory=globalThis.indexedDB){return open(factory&&{open:(_name,version)=>factory.open(PUBLIC_HISTORY_NAME,version)});}
