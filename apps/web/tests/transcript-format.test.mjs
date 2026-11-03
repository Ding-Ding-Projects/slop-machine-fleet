import test from 'node:test';
import assert from 'node:assert/strict';
import {inlineNodes,markdownBlocks,safeLink} from '../src/transcript-format.mjs';

test('renders a useful Markdown subset without accepting HTML execution',()=>{
 const blocks=markdownBlocks('# Result\n\n**Done** and `code`\n\n- first\n- second\n\n```js\n<script>alert(1)</script>\n```');
 assert.deepEqual(blocks.map(b=>b.type),['heading','paragraph','list','code']);
 assert.equal(blocks[3].text,'<script>alert(1)</script>');
 assert.deepEqual(inlineNodes('**Done** and `code`').map(n=>n.type),['strong','text','code']);
 assert.deepEqual(inlineNodes('<img src=x onerror=alert(1)>'),[{type:'text',text:'<img src=x onerror=alert(1)>'}]);
});
test('links reject script schemes, relative targets and embedded credentials',()=>{
 for(const url of ['javascript:alert(1)','data:text/html,test','file:///private','//host/path','https://user:password@example.com/'])assert.equal(safeLink(url),null);
 assert.equal(safeLink('https://example.com/docs'),'https://example.com/docs');
 assert.equal(inlineNodes('[run](javascript:alert)')[0].type,'text');
});
test('unterminated streamed fences remain code and CRLF normalizes predictably',()=>{
 const blocks=markdownBlocks('```\r\npartial **literal**\r\nnext');
 assert.deepEqual(blocks,[{type:'code',text:'partial **literal**\nnext',incompleteFence:true}]);
});
test('empty output never invents a status or result',()=>assert.deepEqual(markdownBlocks(''),[]));
