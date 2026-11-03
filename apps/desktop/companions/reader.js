/* Local Markdown reader: source text never becomes HTML or executable markup. */
window.FleetReader = (() => {
  const slug = text => text.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-');
  function resolveLink(current, target) {
    try { target = decodeURIComponent(target); } catch { return null; }
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//') || target.includes('\\')) return null;
    const [file, anchor = ''] = target.split('#');
    const parts = (file ? (file.startsWith('/') ? [] : current.split('/').slice(0, -1)).concat(file.split('/')) : current.split('/'));
    const resolved = [];
    for (const part of parts) { if (part === '..') { if (!resolved.length) return null; resolved.pop(); } else if (part && part !== '.') resolved.push(part); }
    return { id: resolved.join('/'), anchor };
  }
  function inline(parent, text, current, articles, assets, navigate) {
    const expression = /(!?\[([^\]]*)\]\(([^\s)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*)/g;
    let cursor = 0;
    for (const match of text.matchAll(expression)) {
      parent.append(document.createTextNode(text.slice(cursor, match.index)));
      let node;
      if (match[4]) { node = document.createElement('code'); node.textContent = match[4]; }
      else if (match[5]) { node = document.createElement('strong'); node.textContent = match[5]; }
      else {
        const target = resolveLink(current, match[3]);
        if (match[0][0] === '!' && target && assets[target.id]) { node = document.createElement('img'); node.src = assets[target.id]; node.alt = match[2]; node.loading = 'lazy'; }
        else if (target && articles.some(article => article.id === target.id)) { node = document.createElement('a'); node.href = '#'; node.textContent = match[2]; node.addEventListener('click', event => { event.preventDefault(); navigate(target.id, target.anchor); }); }
        else { node = document.createElement('span'); node.textContent = `${match[2]} (${match[3]})`; node.title = 'External or unavailable offline resource'; }
      }
      parent.append(node); cursor = match.index + match[0].length;
    }
    parent.append(document.createTextNode(text.slice(cursor)));
  }
  function render(container, article, articles, assets, navigate) {
    container.replaceChildren();
    let fence = false, code = [], paragraph = [], list = null;
    const flush = () => { if (paragraph.length) { const p = document.createElement('p'); inline(p, paragraph.join(' '), article.id, articles, assets, navigate); container.append(p); paragraph = []; } list = null; };
    const headings = new Map();
    const lines = article.text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (/^\s*```/.test(line)) {
        flush();
        if (fence) { const pre = document.createElement('pre'), child = document.createElement('code'); child.textContent = code.join('\n'); pre.append(child); container.append(pre); code = []; }
        fence = !fence; continue;
      }
      if (fence) { code.push(line); continue; }
      if (line.includes('|') && /^\s*\|?\s*:?-{3,}:?\s*\|/.test(lines[index + 1] ?? '')) {
        flush();
        const wrapper = document.createElement('div'); wrapper.className = 'table-scroll'; wrapper.tabIndex = 0;
        const table = document.createElement('table'), head = document.createElement('thead'), body = document.createElement('tbody');
        const cells = value => value.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
        const appendRow = (values, target, tag) => { const row = document.createElement('tr'); for (const value of values) { const cell = document.createElement(tag); if (tag === 'th') cell.scope = 'col'; inline(cell, value, article.id, articles, assets, navigate); row.append(cell); } target.append(row); };
        appendRow(cells(line), head, 'th'); index++;
        while (index + 1 < lines.length && lines[index + 1].includes('|') && lines[index + 1].trim()) appendRow(cells(lines[++index]), body, 'td');
        table.append(head, body); wrapper.append(table); container.append(wrapper); continue;
      }
      const heading = /^(#{1,6})\s+(.+)$/.exec(line);
      if (heading) { flush(); const node = document.createElement(`h${heading[1].length}`); const base = slug(heading[2]); const count = headings.get(base) ?? 0; headings.set(base, count + 1); node.id = `article-${base}${count ? `-${count}` : ''}`; inline(node, heading[2], article.id, articles, assets, navigate); container.append(node); continue; }
      const item = /^\s*(?:[-*]|\d+\.)\s+(.+)$/.exec(line);
      if (item) {
        if (!list) { flush(); list = document.createElement('ul'); container.append(list); }
        const node = document.createElement('li'); inline(node, item[1], article.id, articles, assets, navigate); list.append(node); continue;
      }
      if (!line.trim()) { flush(); continue; }
      paragraph.push(line);
    }
    flush();
    if (code.length) { const pre = document.createElement('pre'); pre.textContent = code.join('\n'); container.append(pre); }
  }
  return { render, resolveLink };
})();
