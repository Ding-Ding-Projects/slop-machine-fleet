import {Button} from './components';
import {useUI} from './preferences';
import {promptRequest} from './auth-prompts.mjs';
export type PromptResponse={sessionId:string;promptId:string;action:'choose'|'enter';choice?:'yes'|'no'};
export function AuthPrompt({state,busy,expired,onRespond,onOpenMaintenance}:{state:any;busy:boolean;expired:boolean;onOpenMaintenance:()=>void;onRespond:(request:PromptResponse)=>void}){
 const {t}=useUI(),prompt=state.prompt;
 if(state.legacy)return <div role="status" className="callout"><h4>{t('Worker update required','需要更新工作機')}</h4><p>{t('This worker or service does not provide session-bound prompts. Existing status and unexpired verification details are read-only; interactive answers and cancellation are unavailable without a current identity. Update the compatible worker and service together, then verify status.','此工作機或服務未提供階段綁定提示。現有狀態及未到期驗證資料只供閱讀；沒有目前身份時，不能互動回答或取消。請一併更新相容工作機及服務，再核對狀態。')}</p><Button disabled={busy} onClick={onOpenMaintenance}>{t('Open worker maintenance','開啟工作機維護')}</Button></div>;
 if(state.unsupportedPrompt)return <div role="status" className="callout"><h4>{t('This authentication prompt is not supported','未支援此驗證提示')}</h4><p>{t('No terminal text or automatic answer is exposed. Verify the status, or cancel this session before starting again.','不會顯示終端文字或自動回答。請核對狀態，或取消此階段後再開始。')}</p></div>;
 if(!prompt)return state.state==='pending'?<p role="status" className="muted">{t('Waiting for the worker. Use Verify status to read the next step.','等待工作機，請用核對狀態讀取下一步。')}</p>:null;
 const helper=prompt.kind==='github-credential-helper';
 const respond=(action:'choose'|'enter',choice?:'yes'|'no')=>{if(busy||expired)return;try{onRespond(promptRequest(state,action,choice) as PromptResponse);}catch{/* Parent readback will expose unavailable or replaced prompts. */}};
 return <section className="callout" aria-label={t('Current GitHub authentication prompt','目前 GitHub 驗證提示')}>
  <h4>{helper?t('Use GitHub credentials for Git operations?','為 Git 操作使用 GitHub 憑證？'):t('Continue GitHub device authentication','繼續 GitHub 裝置驗證')}</h4>
  <p>{helper?t('Yes configures the Git credential helper through this GitHub CLI session. No skips that setup. The worker reports Yes as the current default.','是會透過此 GitHub CLI 階段設定 Git 憑證助手，否則略過。工作機回報目前預設為是。'):t('This sends Enter to the recognized device-authentication prompt. It does not prove sign-in succeeded. Use the official verification link and then verify the worker status.','此操作會向已識別裝置驗證提示傳送 Enter，不代表登入成功。請使用官方驗證連結，然後核對工作機狀態。')}</p>
  {expired&&<p role="status">{t('This session has expired. No response can be sent.','此階段已到期，不能傳送回應。')}</p>}
  <div className="actions">{helper&&<><Button disabled={busy||expired} onClick={()=>respond('choose','yes')}>{t('Yes, configure Git credentials','是，設定 Git 憑證')}</Button><Button disabled={busy||expired} onClick={()=>respond('choose','no')}>{t('No, skip credential setup','否，略過憑證設定')}</Button></>}<Button primary disabled={busy||expired} onClick={()=>respond('enter')}>{helper?t('Send Enter, use default Yes','傳送 Enter，使用預設「是」'):t('Send Enter to continue','傳送 Enter 繼續')}</Button></div>
  <p className="muted">{t('Each response is bound to this exact session and prompt. No raw input is accepted.','每次回應只適用於此階段及提示，不接受原始輸入。')}</p>
 </section>;
}
