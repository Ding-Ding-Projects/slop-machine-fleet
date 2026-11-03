import {pendingApiWrites} from './platform/integration/safety.mjs';
export {pendingApiWrites};
export type WorkerRecord = {id:string;name:string;instanceId?:string;region:string;state:string;transport:string;createdAt:string;[key:string]:unknown};
export type TaskRecord = {id:string;workerId:string;repository:string;prompt:string;model?:string;state:string;createdAt:string;result?:unknown;[key:string]:unknown};
export type Operation = {id:string;action:string;state:string;targets:{id:string;state:string;message?:string}[];createdAt:string};
export type LaunchSpec = {count:number;region:string;instanceType:string;subnetId:string;securityGroupId:string;instanceProfile:string;bootGiB:number;dataGiB:number};
export type Review = {id:string;spec:LaunchSpec;specificationHash:string;expiresAt:string;estimate:{available:boolean;currency:string;hourly?:number;monthly?:number;source:string;retrievedAt:string;exclusions:string[];reason?:string}};
export type Discovery = {account:string;regions:string[];subnets:{id:string;vpcId:string;availabilityZone:string}[];instanceTypes:{name:string;vcpus:number;memoryMiB:number}[];imageParameter:string};
let csrf = '';
export function setCsrf(value:string) { csrf=value; }
export class ApiError extends Error { constructor(public code:string,message:string,public status:number){super(message);} }
export async function api<T>(path:string,method='GET',body?:unknown,signal?:AbortSignal):Promise<T>{
  const endWrite=['POST','PUT','PATCH','DELETE'].includes(method.toUpperCase())?pendingApiWrites.begin():()=>{};
  try {
  const timeout=AbortSignal.timeout(method==='GET'?15000:60000);
  const response=await fetch(`/api${path}`,{method,credentials:'same-origin',cache:'no-store',signal:signal?AbortSignal.any([signal,timeout]):timeout,headers:{Accept:'application/json',...(body!==undefined?{'Content-Type':'application/json'}:{}),...(method!=='GET'?{'x-csrf-token':csrf}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  const value=await response.json().catch(()=>null);
  if(response.status===401)window.dispatchEvent(new Event('fleet:session-expired'));
  if(!response.ok) throw new ApiError(value?.error?.code||'REQUEST_FAILED',value?.error?.message||`Request failed (${response.status})`,response.status);
  return value as T;
  } finally {endWrite();}
}
export const idempotencyKey=()=>crypto.randomUUID();
