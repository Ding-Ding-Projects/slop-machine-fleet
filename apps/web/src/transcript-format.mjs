/** Parse a deliberately bounded Markdown subset. HTML and images remain inert text. */
export function safeLink(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function inlineNodes(text) {
  const nodes = [];
  const syntax = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|\[[^\]\n]+\]\([^\s)]+\))/g;
  let cursor = 0;
  for (const match of text.matchAll(syntax)) {
    const index = match.index;
    if (index > cursor) nodes.push({ type: 'text', text: text.slice(cursor, index) });
    const value = match[0];
    if (value.startsWith('`')) nodes.push({ type: 'code', text: value.slice(1, -1) });
    else if (value.startsWith('**')) nodes.push({ type: 'strong', text: value.slice(2, -2) });
    else if (value.startsWith('*')) nodes.push({ type: 'em', text: value.slice(1, -1) });
    else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(value);
      const href = safeLink(link[2]);
      nodes.push(href ? { type: 'link', text: link[1], href } : { type: 'text', text: value });
    }
    cursor = index + value.length;
  }
  if (cursor < text.length) nodes.push({ type: 'text', text: text.slice(cursor) });
  return nodes;
}

export function markdownBlocks(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let paragraph = [], code = null, list = null;
  const flushParagraph = () => { if (paragraph.length) { blocks.push({ type: 'paragraph', text: paragraph.join('\n') }); paragraph = []; } };
  const flushList = () => { if (list) { blocks.push(list); list = null; } };
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      flushParagraph(); flushList();
      if (code) { blocks.push({ type: 'code', text: code.join('\n') }); code = null; }
      else code = [];
      continue;
    }
    if (code) { code.push(line); continue; }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    const item = /^\s*(?:([-*+])|\d+\.)\s+(.+)$/.exec(line);
    if (heading) { flushParagraph(); flushList(); blocks.push({ type: 'heading', text: heading[2], level: heading[1].length }); }
    else if (item) {
      flushParagraph(); const ordered = !item[1];
      if (list && list.ordered !== ordered) flushList();
      list ||= { type: 'list', ordered, items: [] }; list.items.push(item[2]);
    } else if (!line.trim()) { flushParagraph(); flushList(); }
    else { flushList(); paragraph.push(line); }
  }
  flushParagraph(); flushList();
  if (code) blocks.push({ type: 'code', text: code.join('\n'), incompleteFence: true });
  return blocks;
}
