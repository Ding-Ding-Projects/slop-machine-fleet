import {useState,useEffect,useLayoutEffect,useRef} from 'react';
import {api,ApiError,WorkerRecord} from './api';
import {Badge,Button,Confirm,Modal} from './components';
import {useUI} from './preferences';
import {useWorkflow} from './platform/integration/WorkflowSafety';
import {usePlatform} from './platform';
import {AuthPrompt,type PromptResponse} from './AuthPrompt';
import {readAuthState,isCurrentPrompt,cancellationPath,createAuthOwnership} from './auth-prompts.mjs';
const blankAuth=(state='unknown')=>({state,sessionId:null,prompt:null,unsupportedPrompt:false,expiresAt:null,errorCode:null});
function Connection({workerId,provider,onOpenMaintenance}:{workerId:string;provider:'codex'|'github'|'pairing';onOpenMaintenance:()=>void}){
 const {t}=useUI(),[state,setState]=useState<any>(blankAuth),[busy,setBusy]=useState(false),[error,setError]=useState(''),[clock,setClock]=useState(Date.now()),[revealed,setRevealed]=useState(false);
 const current=useRef<any>(state),session=useRef<string|null>(null),ownership=useRef(createAuthOwnership()),inFlight=useRef(false),request=useRef<AbortController|null>(null);
 useWorkflow({known:true,dirty:false,pendingWrites:busy});
 const path=`/workers/${workerId}/auth/${provider}`;
 const replace=(value:any)=>{current.current=value;setState(value);};
 const action=async(method:string,suffix='',body?:unknown)=>{
  if(inFlight.current)return;
  let ticket:number;try{ticket=ownership.current.begin();}catch{return;}
  if(suffix==='/input'&&!isCurrentPrompt(current.current,body)){setError('AUTH_PROMPT_CHANGED');setRevealed(false);return;}
  const expectedSession=method==='POST'&&suffix==='/start'?null:session.current;
  let target=path+suffix;
  if(method==='DELETE'){try{target=cancellationPath(path,{sessionId:session.current});}catch{setError('AUTH_SESSION_UNAVAILABLE');return;}}
  const controller=new AbortController();request.current=controller;inFlight.current=true;
  setBusy(true);setError('');setRevealed(false);replace(blankAuth('checking'));
  try{
   const result=await api<unknown>(target,method,body,controller.signal);
   if(!ownership.current.isCurrent(ticket))return;
   const next=readAuthState(result,provider,expectedSession);session.current=next.sessionId;replace(next);
  }catch(cause){
   if(!ownership.current.isCurrent(ticket)||controller.signal.aborted)return;
   const message=(cause as Error).message;
   const conflict=cause instanceof ApiError&&cause.status===409;const updateRequired=cause instanceof ApiError&&cause.code==='WORKER_AUTH_PROTOCOL_UPDATE_REQUIRED';
   if(message==='AUTH_SESSION_CHANGED'||conflict)session.current=null;
   replace(updateRequired?{...blankAuth('update-required'),legacy:true}:blankAuth('unavailable'));setError(updateRequired?'WORKER_AUTH_PROTOCOL_UPDATE_REQUIRED':conflict?'AUTH_IDENTITY_CONFLICT':message.startsWith('AUTH_')?message:'AUTH_REQUEST_FAILED');
  }finally{if(ownership.current.isCurrent(ticket)){request.current=null;inFlight.current=false;setBusy(false);}}
 };
 useLayoutEffect(()=>{ownership.current.mount();session.current=null;current.current=blankAuth();setState(current.current);inFlight.current=false;setBusy(false);void action('GET');return()=>{ownership.current.dispose();request.current?.abort();request.current=null;inFlight.current=false;session.current=null;current.current=blankAuth();};},[workerId,provider]);
 useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),1000);return()=>clearInterval(timer);},[]);
 const expired=!!state.expiresAt&&Date.parse(state.expiresAt)<=clock;
 useEffect(()=>{if(expired)setRevealed(false);},[expired]);
 const messages:Record<string,[string,string]>={WORKER_AUTH_PROTOCOL_UPDATE_REQUIRED:['Update this worker to the structured authentication protocol before continuing.','請先將工作機更新至結構化驗證協定，再繼續。'],AUTH_PROMPT_CHANGED:['This prompt changed. Verify status before responding.','此提示已改變，回應前請核對狀態。'],AUTH_SESSION_CHANGED:['The authentication session changed. Previous codes and choices were cleared; verify the current session.','驗證階段已改變，舊驗證碼及選項已清除，請核對目前階段。'],AUTH_IDENTITY_CONFLICT:['The worker rejected an outdated session or prompt. Verify status before retrying.','工作機拒絕過期階段或提示，重試前請核對狀態。'],AUTH_RESPONSE_INVALID:['The worker response does not match the supported authentication contract. No prompt can be answered.','工作機回應不符合支援嘅驗證格式，不能回答提示。'],AUTH_SESSION_UNAVAILABLE:['No current authentication session is available to cancel.','沒有可取消嘅目前驗證階段。'],AUTH_REQUEST_FAILED:['The authentication request could not complete. Codes and prompts were cleared; verify status or cancel the known session.','驗證要求未能完成，驗證碼及提示已清除；請核對狀態或取消已知階段。']};
 const failure=messages[error]||messages.AUTH_REQUEST_FAILED;
 const canCancel=!!session.current&&state.state!=='cancelled';
 return <section className="connection"><div className="section-heading"><h3>{provider==='codex'?'Codex':provider==='github'?'GitHub':t('Pairing','配對')}</h3><Badge value={expired?'expired':state.state}/></div>
  <p className="muted">{provider==='codex'?t('Worker coding account. Independent of GitHub and pairing.','工作機編程帳戶，與 GitHub 及配對獨立。'):provider==='github'?t('Repository access on this worker. Recognized interactive prompts appear below.','此工作機嘅儲存庫存取，已識別互動提示會喺下方顯示。'):t('Connect this worker to its remote task session.','連接此工作機至遠端任務工作階段。')}</p>
  {error&&<p className="inline-error" role="alert">{t(failure[0],failure[1])}</p>}
  {state.errorCode&&!state.unsupportedPrompt&&<p className="inline-error" role="status">{t('The worker reports an authentication problem. Verify status or cancel before retrying.','工作機回報驗證問題，重試前請核對狀態或取消。')}</p>}
  {state.state==='code-issued'&&state.verificationUrl&&!expired&&<a className="external-link" href={state.verificationUrl} target="_blank" rel="noopener noreferrer">{t('Open provider verification','開啟供應商驗證')}</a>}
  {state.state==='code-issued'&&state.userCode&&!expired&&<div className="device-code"><span>{t('One-time verification code','一次性驗證碼')}</span>{revealed?<code>{state.userCode}</code>:<span className="code-hidden">{t('Code hidden until you choose to reveal it.','選擇顯示前，驗證碼保持隱藏。')}</span>}<Button onClick={()=>setRevealed(value=>!value)}>{revealed?t('Hide code','隱藏驗證碼'):t('Reveal code','顯示驗證碼')}</Button><small>{t('Shown only for this active connection flow. Do not include it in task prompts.','只於此連接流程顯示，請勿放入任務指示。')}</small></div>}
  {state.expiresAt&&<p className="muted">{t('Expires','到期')} {state.expiresAt}</p>}
  <AuthPrompt state={state} busy={busy} expired={expired} onOpenMaintenance={onOpenMaintenance} onRespond={(response:PromptResponse)=>void action('POST','/input',response)}/>
  <div className="actions"><Button disabled={busy||state.legacy===true} onClick={()=>void action('POST','/start',{})}>{t('Start connection','開始連接')}</Button><Button disabled={busy} onClick={()=>void action('GET')}>{t('Verify status','核對狀態')}</Button><Button disabled={busy||!canCancel} onClick={()=>void action('DELETE')}>{t('Cancel / disconnect','取消 / 中斷')}</Button></div>
  {!canCancel&&<p className="muted">{t('Cancel becomes available after the worker identifies a current authentication session.','工作機確認目前驗證階段後才可取消。')}</p>}
  <p className="muted">{t('A code, an Enter response or a link is not proof of connection. Verify status reads the worker’s actual result.','驗證碼、Enter 回應或連結並非已連接證明，核對狀態會讀取工作機實際結果。')}</p>
 </section>;
}
export function WorkerDetail({worker,onClose,onChanged}:{worker:WorkerRecord;onClose:()=>void;onChanged:()=>void}){
 const {t,notice}=useUI(),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[tab,setTab]=useState('overview');
 const platform=usePlatform();const flow=useWorkflow({known:true,dirty:!!confirm,pendingWrites:busy,discard:()=>setConfirm('')});
 const run=async(action:string)=>{setBusy(true);try{await api(`/workers/${worker.id}/actions`,'POST',{action});notice(t('Worker action accepted. Check Operations for the outcome.','工作機操作已接收，請於操作記錄查看結果。'));setConfirm('');platform.notify({kind:'operation',outcome:'queued',destinationId:'fleet',count:1});onChanged();}catch(e){notice((e as Error).message,true);}finally{setBusy(false);}};
 return <Modal title={worker.name||worker.id} onClose={()=>flow.requestClose(onClose)} wide><div className="tabs" role="tablist">{[['overview',t('Overview','概覽')],['connections',t('Connections','連接')]].map(([id,label])=><button role="tab" aria-selected={tab===id} key={id} onClick={()=>{if(id!==tab)flow.requestClose(()=>setTab(id));}}>{label}</button>)}</div>{tab==='overview'?<><div className="status-row"><Badge value={worker.state}/><Badge value={worker.transport}/></div><dl className="facts"><dt>{t('Worker ID','工作機 ID')}</dt><dd><code>{worker.id}</code></dd><dt>{t('Instance','執行個體')}</dt><dd>{worker.instanceId||t('Not assigned','尚未分配')}</dd><dt>{t('Region','地區')}</dt><dd>{worker.region}</dd><dt>{t('Created','建立時間')}</dt><dd>{worker.createdAt}</dd></dl><h3>{t('Lifecycle controls','生命週期控制')}</h3><p>{t('Drain waits for active work. Termination preserves workspace storage by default.','排空會等待進行中工作完成。終止預設保留工作區儲存空間。')}</p><div className="actions">{['start','stop','restart','repair','update','drain','terminate'].map(action=><Button key={action} disabled={busy} onClick={()=>['stop','restart','terminate'].includes(action)?setConfirm(action):void run(action)}>{t(action[0].toUpperCase()+action.slice(1),({start:'啟動',stop:'停止',restart:'重新啟動',repair:'修復',update:'更新',drain:'排空',terminate:'終止'}as any)[action])}</Button>)}</div></>:<div className="connection-grid">{(['codex','github','pairing']as const).map(provider=><Connection key={provider} workerId={worker.id} provider={provider} onOpenMaintenance={()=>flow.requestClose(()=>setTab('overview'))}/>)}</div>}{confirm&&<Confirm title={t('Confirm worker action','確認工作機操作')} description={`${confirm}: ${worker.name||worker.id}. ${t('Active work may be interrupted. Workspace storage is preserved.','進行中工作可能中斷，工作區儲存空間會保留。')}`} onClose={()=>setConfirm('')} onConfirm={()=>void run(confirm)} busy={busy}/>}</Modal>;
}
