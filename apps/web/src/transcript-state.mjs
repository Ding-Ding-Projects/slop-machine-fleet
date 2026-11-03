const kinds = new Set(['assistant','command','command-output','file-change','progress','state','result']);
const streams = new Set(['combined','stdout','stderr']);
const integer = value => Number.isSafeInteger(value) && value >= 0;
export function validateOutputPage(value, taskId) {
  if (!value || value.taskId !== taskId || !Array.isArray(value.events) || value.events.length > 200 ||
      !['nextCursor','oldestSequence','latestSequence'].every(key => integer(value[key])) ||
      typeof value.gap !== 'boolean' || typeof value.truncated !== 'boolean' ||
      value.nextCursor > value.latestSequence ||
      (value.resetReason != null && (typeof value.resetReason !== 'string' || value.resetReason.length > 160))) throw Error('Invalid task output envelope.');
  let previous = -1;
  for (const event of value.events) {
    if (!event || !integer(event.sequence) || event.sequence <= previous || event.sequence > value.nextCursor ||
        !kinds.has(event.kind) || typeof event.content !== 'string' || event.content.length > 2048 ||
        typeof event.at !== 'string' || event.at.length > 100 ||
        typeof event.truncated !== 'boolean' || typeof event.redacted !== 'boolean' ||
        (event.stream != null && !streams.has(event.stream)) ||
        (event.itemId != null && (typeof event.itemId !== 'string' || event.itemId.length > 256))) throw Error('Invalid task output event.');
    previous = event.sequence;
  }
  return value;
}
export function emptyTranscript() {
  return {events:[],cursor:0,latest:0,oldest:0,gap:false,truncated:false,resetReason:'',discarded:0};
}
export function mergeOutputPage(previous,page) {
  const restarted = !!page.resetReason && page.nextCursor < previous.cursor;
  if (page.nextCursor < previous.cursor && !restarted) throw Error('Task output cursor moved backwards.');
  const map = new Map((restarted ? [] : previous.events).map(event => [event.sequence,event]));
  for (const event of page.events) map.set(event.sequence,event);
  const events = [...map.values()].sort((a,b)=>a.sequence-b.sequence);
  const encoder = new TextEncoder();
  let bytes=events.reduce((sum,event)=>sum+encoder.encode(event.content).length,0),discarded=previous.discarded;
  if(restarted)discarded+=previous.events.length;
  while(events.length>512||bytes>262144){bytes-=encoder.encode(events.shift().content).length;discarded++;}
  return {events,cursor:page.nextCursor,latest:page.latestSequence,oldest:page.oldestSequence,
    gap:previous.gap||page.gap||restarted,truncated:previous.truncated||page.truncated||page.events.some(event=>event.truncated),
    resetReason:page.resetReason||previous.resetReason,discarded};
}
