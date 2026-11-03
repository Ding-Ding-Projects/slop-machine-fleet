import {inlineNodes,markdownBlocks} from './transcript-format.mjs';

function Inline({text}:{text:string}) {
  return <>{inlineNodes(text).map((node:any,index:number)=> {
    if(node.type==='code')return <code key={index}>{node.text}</code>;
    if(node.type==='strong')return <strong key={index}>{node.text}</strong>;
    if(node.type==='em')return <em key={index}>{node.text}</em>;
    if(node.type==='link')return <a key={index} href={node.href} target="_blank" rel="noopener noreferrer">{node.text}</a>;
    return <span key={index}>{node.text}</span>;
  })}</>;
}

export function SafeMarkdown({text}:{text:string}) {
  return <div className="safe-markdown">{markdownBlocks(text).map((block:any,index:number)=> {
    if(block.type==='code')return <pre key={index}><code>{block.text}</code></pre>;
    if(block.type==='heading')return <h4 key={index}><Inline text={block.text}/></h4>;
    if(block.type==='list') {
      const children=block.items.map((item:string,i:number)=><li key={i}><Inline text={item}/></li>);
      return block.ordered?<ol key={index}>{children}</ol>:<ul key={index}>{children}</ul>;
    }
    return <p key={index}><Inline text={block.text}/></p>;
  })}</div>;
}
