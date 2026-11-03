import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyTranscript,mergeOutputPage,validateOutputPage} from '../src/transcript-state.mjs';
const event=(sequence,content=`message ${sequence}`)=>({sequence,kind:'assistant',content,at:'2026-01-01T00:00:00Z',truncated:false,redacted:false});
const page=(events,extra={})=>({taskId:'task-a',events,nextCursor:events.at(-1)?.sequence||0,oldestSequence:events[0]?.sequence||0,latestSequence:events.at(-1)?.sequence||0,gap:false,truncated:false,...extra});

test('rejects another task, unknown channels, oversized events and invalid order',()=>{
 assert.throws(()=>validateOutputPage(page([event(1)]),'task-b'));
 assert.throws(()=>validateOutputPage(page([{...event(1),kind:'authentication'}]),'task-a'));
 assert.throws(()=>validateOutputPage(page([event(1,'a'.repeat(2049))]),'task-a'));
 assert.throws(()=>validateOutputPage(page([event(2),event(1)]),'task-a'));
 assert.throws(()=>validateOutputPage(page([{...event(1),stream:'invented'}]),'task-a'));
});
test('overlapping pages deduplicate without manufacturing output',()=>{
 let state=mergeOutputPage(emptyTranscript(),validateOutputPage(page([event(1),event(2)]),'task-a'));
 state=mergeOutputPage(state,validateOutputPage(page([event(2),event(3)]),'task-a'));
 assert.deepEqual(state.events.map(e=>e.sequence),[1,2,3]);
 assert.equal(state.cursor,3);
 assert.deepEqual(emptyTranscript().events,[]);
});
test('server gaps and event truncation remain visible after later successful pages',()=>{
 let state=mergeOutputPage(emptyTranscript(),page([{...event(4),truncated:true,redacted:true}],{gap:true}));
 state=mergeOutputPage(state,page([event(5)]));
 assert.equal(state.gap,true);assert.equal(state.truncated,true);assert.equal(state.events[0].redacted,true);
});
test('bounded local retention reports removed events instead of claiming complete history',()=>{
 let state=emptyTranscript();
 for(let index=1;index<=600;index+=100)state=mergeOutputPage(state,page(Array.from({length:100},(_,i)=>event(index+i))));
 assert.equal(state.events.length,512);assert.equal(state.discarded,88);assert.equal(state.events[0].sequence,89);
 const large=mergeOutputPage(emptyTranscript(),page(Array.from({length:100},(_,i)=>event(i+1,'界'.repeat(2048)))));
 assert.equal(large.events.length,42);assert.equal(large.discarded,58);
 assert.ok(large.events.reduce((sum,e)=>sum+new TextEncoder().encode(e.content).length,0)<=262144);
});
test('backward cursors require an explicit reset and keep a truthful reset marker',()=>{
 const previous=mergeOutputPage(emptyTranscript(),page([event(20)]));
 assert.throws(()=>mergeOutputPage(previous,page([event(1)])));
 const reset=mergeOutputPage(previous,page([event(1)],{resetReason:'worker-restarted',gap:true}));
 assert.equal(reset.gap,true);assert.equal(reset.resetReason,'worker-restarted');assert.equal(reset.discarded,1);assert.deepEqual(reset.events.map(e=>e.sequence),[1]);
});

test('a paginated snapshot is not misreported as truncated event content',()=>{
 const state=mergeOutputPage(emptyTranscript(),page([event(1)],{truncated:true,latestSequence:3}));
 assert.equal(state.truncated,false);assert.equal(state.cursor,1);assert.equal(state.latest,3);
});
