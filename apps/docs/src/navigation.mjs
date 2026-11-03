export function needsProtection(value){return !value||value.known!==true||value.pendingWrites===true||value.dirty===true;}
export function createRouteGuard({getSafety,getLifecycle,commit,ask,onBlocked,now=Date.now,wait=()=>new Promise(resolve=>setTimeout(resolve,20))}){
 let active=true,pending=false,generation=0;
 return {dispose(){active=false;generation++;},async navigate(target,current){
  if(!active||pending)return false;
  if(target===current)return true;
  if(current!=='#/base64'){commit(target);return true;}
  const initial=getSafety();
  if(initial?.known!==true||initial.pendingWrites){onBlocked('busy');return false;}
  if(!initial.dirty&&getLifecycle()?.canLeave()){commit(target);return true;}
  pending=true;const version=++generation;
  try {
   if(!await ask()||!active||version!==generation)return false;
   const next=getSafety(),lifecycle=getLifecycle();
   if(next?.known!==true||next.pendingWrites||!lifecycle){onBlocked('busy');return false;}
   lifecycle.discard();
   const deadline=now()+5000;
   while(active&&version===generation&&now()<=deadline){const currentState=getSafety();if(currentState?.known===true&&!currentState.dirty&&!currentState.pendingWrites&&getLifecycle()?.canLeave()){commit(target);return true;}await wait();}
   if(active)onBlocked('cleanup');return false;
  } finally {pending=false;}
 }};
}
