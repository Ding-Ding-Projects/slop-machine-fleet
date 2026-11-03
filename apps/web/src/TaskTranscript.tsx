import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {api} from './api';
import {Button} from './components';
import {Search,useSearch} from './Search';
import {SafeMarkdown} from './SafeMarkdown';
import {emptyTranscript,mergeOutputPage,validateOutputPage} from './transcript-state.mjs';
import {useUI} from './preferences';

type OutputEvent={sequence:number;kind:string;content:string;at:string;itemId?:string;stream?:string;truncated:boolean;redacted:boolean};
type Transcript={events:OutputEvent[];cursor:number;latest:number;oldest:number;gap:boolean;truncated:boolean;resetReason:string;discarded:number};

export function TaskTranscript({taskId}:{taskId:string}) {
 const {t}=useUI();
 const [transcript,setTranscript]=useState<Transcript>(emptyTranscript),[error,setError]=useState(''),[loading,setLoading]=useState(true),[following,setFollowing]=useState(true),[updated,setUpdated]=useState('');
 const viewport=useRef<HTMLDivElement>(null),generation=useRef(0),cursor=useRef(0),inFlight=useRef(false),request=useRef<AbortController|null>(null),isFollowing=useRef(true);
 const search=useSearch(transcript.events,event=>`${event.kind} ${event.stream||''} ${event.content}`);
 const read=useCallback(async()=>{
   if(inFlight.current)return;
   const version=generation.current;
   inFlight.current=true;
   const controller=new AbortController();request.current=controller;
   try {
     // Three bounded pages cover the worker's 512-event retained buffer.
     for(let batch=0;batch<3;batch++) {
       const value=await api<unknown>(`/tasks/${encodeURIComponent(taskId)}/output?after=${cursor.current}&limit=200`,'GET',undefined,controller.signal);
       if(version!==generation.current)return;
       const page=validateOutputPage(value,taskId);
       if(page.nextCursor<cursor.current&&!page.resetReason)throw Error(t('The output cursor moved backwards. Refresh after the worker recovers.','輸出次序倒退，請於工作機復原後重新整理。'));
       const before=cursor.current;
       cursor.current=page.nextCursor;
       setTranscript(previous=>mergeOutputPage(previous,page));
       setError('');setUpdated(new Date().toLocaleTimeString());setLoading(false);
       if(page.nextCursor>=page.latestSequence||page.nextCursor===before)break;
     }
   } catch(cause) {
     if(version===generation.current&&!controller.signal.aborted){setError((cause as Error).message);setLoading(false);}
   } finally {
     if(version===generation.current){inFlight.current=false;request.current=null;}
   }
 },[taskId]);
 useEffect(()=>{
   generation.current++;cursor.current=0;inFlight.current=false;setTranscript(emptyTranscript());setError('');setLoading(true);setUpdated('');setFollowing(true);isFollowing.current=true;
   void read();const timer=setInterval(()=>void read(),2500);
   return()=>{generation.current++;clearInterval(timer);request.current?.abort();request.current=null;inFlight.current=false;};
 },[read]);
 useLayoutEffect(()=>{if(isFollowing.current&&viewport.current)viewport.current.scrollTop=viewport.current.scrollHeight;},[search.filtered]);
 const pause=()=>{isFollowing.current=false;setFollowing(false);};
 const follow=()=>{isFollowing.current=true;setFollowing(true);if(viewport.current)viewport.current.scrollTop=viewport.current.scrollHeight;};
 const labels:Record<string,string>={assistant:t('Assistant','助手'),command:t('Command','指令'),'file-change':t('File change','檔案改動'),progress:t('Progress','進度'),state:t('Status','狀態'),result:t('Result','結果')};
 const label=(event:OutputEvent)=>event.kind==='command-output'?(event.stream==='stderr'?t('Standard error','標準錯誤輸出'):event.stream==='stdout'?t('Standard output','標準輸出'):t('Combined command output','合併指令輸出')):labels[event.kind];
 return <section className="task-transcript" aria-label={t('Task transcript','任務記錄')}>
   <div className="section-heading"><div><h3>{t('Task transcript','任務記錄')}</h3><p className="muted transcript-subtitle">{t('Actual worker output. No estimated percentage.','工作機實際輸出，沒有估算百分比。')}</p></div><div className="actions"><Button onClick={following?pause:follow}>{following?t('Pause following','暫停跟隨'):t('Follow latest','跟隨最新')}</Button><Button onClick={()=>void read()}>{t('Refresh output','更新輸出')}</Button></div></div>
   <Search label={t('Search this task’s output','搜尋此任務輸出')} state={search.state} onChange={search.setState} error={search.error}/>
   {(transcript.gap||transcript.discarded>0)&&<p className="transcript-warning" role="status">{t('Some earlier output is unavailable. This is a partial transcript, not a complete replay.','部分較早輸出無法提供。此記錄並非完整重播。')} {transcript.resetReason&&<span>{t('Worker reset reason','工作機重設原因')}: <code>{transcript.resetReason}</code>.</span>} {transcript.discarded>0&&<span>{t('Older events removed from this bounded view','此有限記錄已移除較早事件')}: {transcript.discarded}.</span>}</p>}
   {transcript.truncated&&<p className="transcript-warning">{t('The worker reported truncated output. Marked entries are incomplete.','工作機回報輸出已截短，標記項目並不完整。')}</p>}
   {error&&<p className="inline-error" role="alert">{t('Live output is unavailable; retained entries may be stale.','即時輸出未能提供，保留記錄可能過時。')} {error}</p>}
   <p className="sr-only" role="status" aria-live="polite">{transcript.events.length} {t('retained output events','個保留輸出事件')}. {following?t('Following latest output.','跟隨最新輸出。'):t('Following paused. New output continues to arrive.','已暫停跟隨，仍會接收新輸出。')}</p>
   <div ref={viewport} className="transcript-viewport" tabIndex={0} role="region" aria-label={t('Scrollable task output','可捲動任務輸出')} onScroll={()=>{const view=viewport.current;if(view&&view.scrollHeight-view.scrollTop-view.clientHeight>48&&isFollowing.current)pause();}}>
     {loading&&!transcript.events.length?<p className="transcript-empty">{t('Reading actual task output…','讀取實際任務輸出中…')}</p>:!transcript.events.length?<p className="transcript-empty">{t('No output has been returned for this task.','此任務尚未回傳輸出。')}</p>:!search.filtered.length?<p className="transcript-empty">{t('No output matches this search.','沒有符合搜尋嘅輸出。')}</p>:search.filtered.map(event=><article key={event.sequence} className={`transcript-entry kind-${event.kind} stream-${event.stream||'none'}`}>
       <header><strong>{label(event)}</strong><span className="transcript-sequence">#{event.sequence}</span>{Number.isFinite(Date.parse(event.at))?<time dateTime={event.at}>{new Date(event.at).toLocaleTimeString()}</time>:<span>{t('Timestamp unavailable','時間未能提供')}</span>}</header>
       {event.redacted&&<p className="transcript-marker">{t('Sensitive content was redacted by the worker.','工作機已遮蔽敏感內容。')}</p>}
       {['assistant','result'].includes(event.kind)?<SafeMarkdown text={event.content}/>:<pre className="transcript-text">{event.content}</pre>}
       {event.truncated&&<p className="transcript-marker">{t('This event was truncated at the worker boundary.','此事件於工作機界線已截短。')}</p>}
     </article>)}
   </div>
   <footer className="transcript-footer"><span>{following?t('Following latest','跟隨最新'):t('Following paused','已暫停跟隨')}</span><span>{updated?`${t('Last read','上次讀取')} ${updated}`:t('No successful read yet','尚未成功讀取')}</span>{transcript.cursor<transcript.latest&&<span>{t('More retained output is pending.','仍有保留輸出待讀取。')}</span>}</footer>
 </section>;
}
