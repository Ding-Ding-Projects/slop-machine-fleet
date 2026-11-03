import {useEffect,useState} from 'react';
import {Tasks} from '../../Tasks';
import type {TaskRecord,WorkerRecord} from '../../api';
import {useUI} from '../../preferences';
import {repositoryWorkspaceKey} from './safety.mjs';
export function RepositoryTasks({workspaceKey,tasks,workers,refresh}:{workspaceKey:string;tasks:TaskRecord[];workers:WorkerRecord[];refresh:()=>void}){
 const {t}=useUI(),[matches,setMatches]=useState<string[]|null>(null);
 const repositories=JSON.stringify([...new Set(tasks.map(task=>task.repository))].sort());
 useEffect(()=>{let live=true;if(!workspaceKey){setMatches([]);return;}setMatches(null);void Promise.all((JSON.parse(repositories)as string[]).map(async repository=>{try{return {repository,key:await repositoryWorkspaceKey(repository)};}catch{return null;}})).then(results=>{if(live)setMatches(results.filter(result=>result?.key===workspaceKey).map(result=>result!.repository));});return()=>{live=false;};},[workspaceKey,repositories]);
 if(!workspaceKey)return <Tasks tasks={tasks} workers={workers} refresh={refresh}/>;
 if(matches===null)return <p role="status">{t('Resolving this workspace against current repository records…','正按目前儲存庫記錄核對工作區…')}</p>;
 return <><p className="muted">{matches.length?`${t('Repository workspace','儲存庫工作區')}: ${matches.join(', ')}`:t('No current task record resolves this saved repository workspace. No repository identity was guessed.','目前任務記錄未能對應此工作區，沒有猜測儲存庫身份。')}</p><Tasks tasks={tasks.filter(task=>matches.includes(task.repository))} workers={workers} refresh={refresh}/></>;
}
