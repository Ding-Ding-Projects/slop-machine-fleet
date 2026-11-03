import React, {useEffect, useState} from 'react';
import {Button} from './components';
import {useUI} from './preferences';

export type DesktopSafety = {
  authenticated?: boolean;
  reachable?: boolean;
  activeTasks?: boolean;
  pendingWrites?: boolean;
  dirty?: boolean;
};
type UpdateState = {
  revision:number;
  status: 'unavailable'|'idle'|'checking'|'downloading'|'current'|'failed'|'ready'|'restarting';
  code: string;
  currentVersion: string;
  availableVersion: string|null;
  notesUrl: string|null;
  unsigned: boolean;
  checkedAt: string|null;
  retryAvailable: boolean;
  installBlocked: boolean;
  operationInProgress: boolean;
};
type Reply<T> = {ok:true;value:T}|{ok:false;code:string};
type DesktopBridge = {
  read():Promise<Reply<UpdateState>>;
  check():Promise<Reply<UpdateState>>;
  reportSafety(value:Required<DesktopSafety>&{language:'en'|'yue'|'both'}):Promise<Reply<UpdateState>>;
  requestRestart():Promise<Reply<{ok:boolean;code?:string}>>;
  later():Promise<Reply<UpdateState>>;
  openReleaseNotes():Promise<Reply<boolean>>;
  subscribe(callback:(state:UpdateState)=>void):()=>void;
};
declare global { interface Window { fleetUpdates?: DesktopBridge } }

const messages:Record<string,[string,string]> = {
  initial:['Reading desktop update status…','正在讀取桌面更新狀態…'],
  'installed-only':['Automatic updates require the installed Windows client. Development and portable copies cannot update here.','自動更新需要已安裝的 Windows 用戶端，開發及可攜版本無法在此更新。'],
  'ready-to-check':['Automatic update checking is enabled.','已啟用自動檢查更新。'],
  'metadata-check':['Checking accepted release metadata and source identity…','正在檢查已接納版本的資料及原始碼身分…'],
  'native-check':['Squirrel is checking the pinned release.','Squirrel 正在檢查固定版本。'],
  downloading:['Downloading and verifying the update package.','正在下載並驗證更新套件。'],
  current:['No newer verified stable package was found in the recent release inventory.','近期版本清單中未發現較新的已驗證穩定套件。'],
  'feed-unavailable':['No source-verified stable update feed is available. Check the connection and release publication, then retry.','目前沒有經原始碼驗證的穩定更新來源。請檢查連線及版本發佈後再試。'],
  'native-error':['Squirrel could not complete the update. The running client remains open; retry after resolving connectivity or package integrity.','Squirrel 未能完成更新。目前用戶端保持開啟，請先處理連線或套件完整性問題再試。'],
  'native-timeout':['The native update operation exceeded five minutes. It may still finish in the background; another download will not start concurrently.','原生更新操作已超過五分鐘，仍可能在背景完成；不會同時啟動另一個下載。'],
  'download-identity-mismatch':['The downloaded version did not match the verified release. Restart is blocked.','下載版本與已驗證發佈不符，已阻止重新啟動。'],
  ready:['Update downloaded. Restart Fleet when your work is saved.','更新已下載，儲存工作後即可重新啟動 Fleet。'],
  'ready-later':['Update remains ready. Fleet will keep running while you finish your work.','更新仍然準備就緒，Fleet 會保持執行，讓你完成工作。'],
  'ready-not-recorded':['Update downloaded, but its local recovery note could not be saved. The current ready state is still verified.','更新已下載，但未能儲存本機復原記錄。目前的就緒狀態仍已驗證。'],
  restarting:['Restarting Fleet to apply the downloaded update.','正在重新啟動 Fleet 以套用已下載更新。'],
  'restart-failed':['Fleet could not restart. The downloaded update remains ready.','Fleet 未能重新啟動，已下載的更新仍然準備就緒。'],
  'workspace-not-safe':['Finish active tasks, queued writes and unsaved drafts, and restore the service connection before restarting.','重新啟動前，請先完成執行中任務、排隊寫入及未儲存草稿，並恢復服務連線。'],
  'workspace-changed':['The workspace changed while confirmation was open. Save your work and request restart again.','確認期間工作區狀態有變，請儲存工作後再次要求重新啟動。'],
  'confirmation-unavailable':['Native confirmation could not open. Fleet remains running and the update stays ready.','未能開啟原生確認，Fleet 保持執行，更新仍然準備就緒。'],
  'update-action-unavailable':['This update action is currently unavailable.','此更新操作目前無法使用。'],
  'untrusted-workspace':['Update controls are only available in the connected Fleet workspace.','更新控制只可在已連線的 Fleet 工作區使用。'],
  later:['Restart deferred. The update stays ready.','已延後重新啟動，更新保持就緒。']
};

/** Parent must aggregate every draft and pending write, including unmounted workflows. */
export function DesktopUpdates(safety:DesktopSafety) {
  const {t,prefs}=useUI();
  const bridge=window.fleetUpdates;
  const [state,setState]=useState<UpdateState|null>(null);
  const [actionCode,setActionCode]=useState('');
  const [requesting,setRequesting]=useState(false);
  const accept=(next:UpdateState)=>setState(previous=>!previous||next.revision>=previous.revision?next:previous);
  const {authenticated,reachable,activeTasks,pendingWrites,dirty}=safety;
  useEffect(()=>{
    if(!bridge)return;
    let live=true;
    const unsubscribe=bridge.subscribe(value=>{if(live)accept(value);});
    void bridge.read().then(reply=>{if(!live)return;if(reply.ok)accept(reply.value);else setActionCode(reply.code);}).catch(()=>{if(live)setActionCode('update-action-unavailable');});
    return()=>{live=false;unsubscribe();};
  },[bridge]);
  useEffect(()=>{
    if(!bridge)return;
    let live=true;
    const report=()=>{void bridge.reportSafety({authenticated:authenticated===true,reachable:reachable===true,activeTasks:activeTasks!==false,pendingWrites:pendingWrites!==false,dirty:dirty!==false,language:prefs.language}).then(reply=>{if(live&&reply.ok)accept(reply.value);}).catch(()=>{});};
    report();const timer=window.setInterval(report,2000);
    return()=>{live=false;window.clearInterval(timer);void bridge.reportSafety({authenticated:false,reachable:false,activeTasks:true,pendingWrites:true,dirty:true,language:prefs.language}).catch(()=>{});};
  },[bridge,authenticated,reachable,activeTasks,pendingWrites,dirty,prefs.language]);
  if(!bridge)return null;
  const describe=(code:string)=>{const pair=messages[code]||messages['update-action-unavailable'];return t(pair[0],pair[1]);};
  const action=async(kind:'check'|'restart'|'later'|'notes')=>{
    if(requesting)return;setRequesting(true);setActionCode('');
    try{
      if(kind==='restart') {const reply=await bridge.requestRestart();if(!reply.ok)setActionCode(reply.code);else if(!reply.value.ok)setActionCode(reply.value.code||'update-action-unavailable');}
      else if(kind==='notes'){const reply=await bridge.openReleaseNotes();if(!reply.ok)setActionCode(reply.code);}
      else {const reply=await(kind==='check'?bridge.check():bridge.later());if(reply.ok)accept(reply.value);else setActionCode(reply.code);}
    }catch{setActionCode('update-action-unavailable');}finally{setRequesting(false);}
  };
  return <aside className="panel" aria-labelledby="desktop-update-heading" style={{margin:'12px 0',padding:'16px',minWidth:0}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:'12px'}}>
      <div style={{minWidth:0,flex:'1 1 260px'}}>
        <h2 id="desktop-update-heading" style={{fontSize:'1rem',margin:'0 0 6px'}}>{t('Desktop updates','桌面更新')}{state?` · ${state.currentVersion}`:''}</h2>
        <p role="status" aria-live="polite" style={{margin:0,overflowWrap:'anywhere'}}>{describe(state?.code||'initial')}</p>
        {state?.availableVersion&&<p style={{margin:'6px 0'}}>{t('Available version','可用版本')}: <strong>{state.availableVersion}</strong></p>}
        {state?.status==='ready'&&<p style={{margin:'6px 0'}}>{t('This package is unsigned. Check the source and release notes before restarting. A downloaded update can also take effect on your next normal application launch.','此套件未簽署。重新啟動前請檢查來源及版本說明。已下載的更新亦可能在下次正常啟動應用程式時生效。')}</p>}
        {state?.status==='ready'&&state.installBlocked&&<p style={{margin:'6px 0'}}>{describe('workspace-not-safe')}</p>}
        {actionCode&&<p role="status" style={{margin:'6px 0'}}>{describe(actionCode)}</p>}
      </div>
      <div style={{display:'flex',gap:'8px',flexWrap:'wrap',alignItems:'center'}}>
        <Button disabled={requesting||!state?.retryAvailable||state.operationInProgress} onClick={()=>void action('check')}>{t('Check for updates','檢查更新')}</Button>
        {state?.notesUrl&&<Button disabled={requesting} onClick={()=>void action('notes')}>{t('Release notes','版本說明')}</Button>}
        {state?.status==='ready'&&<><Button disabled={requesting} onClick={()=>void action('later')}>{t('Later','稍後')}</Button><Button primary disabled={requesting||state.installBlocked} onClick={()=>void action('restart')}>{t('Restart Fleet to update','重新啟動 Fleet 以更新')}</Button></>}
      </div>
    </div>
  </aside>;
}
