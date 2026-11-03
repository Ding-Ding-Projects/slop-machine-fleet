import React,{createContext,useContext,useLayoutEffect,useRef,useState,useSyncExternalStore} from 'react';
import {Confirm} from '../../components';
import {useUI} from '../../preferences';
import {usePlatformTabId} from '../context';
import {createWorkflowRegistry} from './safety.mjs';
type Safety={known:boolean;dirty:boolean;pendingWrites:boolean;discard?:()=>void};
type Value={registry:ReturnType<typeof createWorkflowRegistry>;requestLeave:(tabId?:string)=>Promise<boolean>};
const C=createContext<Value|null>(null);
export function WorkflowSafetyProvider({children}:{children:React.ReactNode}){
 const {t}=useUI(),[registry]=useState(createWorkflowRegistry),[decision,setDecision]=useState<{capture:any;resolve:(value:boolean)=>void}|null>(null),alive=useRef(true);
 useLayoutEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useLayoutEffect(()=>()=>{decision?.resolve(false);},[decision]);
 const requestLeave=async(tabId?:string)=>{const capture=registry.capture(tabId);if(!capture.known||capture.pendingWrites)return false;if(!capture.dirty)return true;if(decision)return false;return new Promise<boolean>(resolve=>setDecision({capture,resolve}));};
 const settle=(approved:boolean)=>{if(!decision)return;const valid=approved&&alive.current&&registry.getSnapshot().revision===decision.capture.revision&&decision.capture.discard();decision.resolve(valid);setDecision(null);};
 return <C.Provider value={{registry,requestLeave}}>{children}{decision&&<Confirm title={t('Discard unsaved workflow changes','放棄未儲存工作流程改動')} description={t('The selected tab contains unsaved local edits. Pending operations and unknown state cannot be discarded through this control.','所選分頁有未儲存本機改動。待處理操作及未知狀態不能透過此控制放棄。')} onClose={()=>settle(false)} onConfirm={()=>settle(true)}/>}</C.Provider>;
}
export function useWorkflowSafety(){const value=useContext(C);if(!value)throw Error('WorkflowSafetyProvider is required.');return value;}
export function useWorkflow(value:Safety){const {registry,requestLeave}=useWorkflowSafety(),tabId=usePlatformTabId(),id=useRef(Symbol('workflow'));useLayoutEffect(()=>{registry.update(id.current,{...value,tabId});},[registry,tabId,value.known,value.dirty,value.pendingWrites,value.discard]);useLayoutEffect(()=>()=>registry.remove(id.current),[registry]);return {requestClose:(close:()=>void)=>{void requestLeave(tabId).then(allowed=>{if(allowed)close();});}};}
export function useWorkflowSnapshot(){const {registry}=useWorkflowSafety();return useSyncExternalStore(registry.subscribe,registry.getSnapshot);}
