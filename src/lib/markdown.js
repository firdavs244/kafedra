// AI javoblari uchun kichik markdown: avval bloklarga ajratiladi, keyin HTML
// (matn OLDIN ekranlanadi — XSS mumkin emas) yoki Word hujjatiga aylantiriladi.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const isRow = (l) => /^\s*\|.*\|\s*$/.test(l);
const isSep = (l) => /^\s*\|?\s*:?-{2,}/.test(l);
const splitRow = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

export function mdBlocks(src) {
  const L = String(src ?? '').replace(/\r/g, '').split('\n');
  const out = [];
  let i = 0;
  while (i < L.length) {
    const l = L[i];
    let m;
    if (isRow(l) && i + 1 < L.length && isSep(L[i + 1])) {
      const head = splitRow(l);
      i += 2;
      const rows = [];
      while (i < L.length && isRow(L[i])) {
        rows.push(splitRow(L[i]));
        i += 1;
      }
      out.push({ type: 'table', head, rows });
      continue;
    }
    if ((m = l.match(/^(#{1,6})\s+(.*)/))) {
      out.push({ type: 'h', level: m[1].length, text: m[2].replace(/\*\*/g, '') });
      i += 1;
      continue;
    }
    if (/^\s*(---|\*\*\*|___)\s*$/.test(l)) {
      out.push({ type: 'hr' });
      i += 1;
      continue;
    }
    if (/^\s*[-*•]\s+/.test(l)) {
      const items = [];
      while (i < L.length && /^\s*[-*•]\s+/.test(L[i])) {
        items.push(L[i].replace(/^\s*[-*•]\s+/, ''));
        i += 1;
      }
      out.push({ type: 'ul', items });
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(l)) {
      const items = [];
      while (i < L.length && /^\s*\d+[.)]\s+/.test(L[i])) {
        items.push(L[i].replace(/^\s*\d+[.)]\s+/, ''));
        i += 1;
      }
      out.push({ type: 'ol', items });
      continue;
    }
    if (!l.trim()) {
      i += 1;
      continue;
    }
    const p = [];
    while (i < L.length && L[i].trim() && !/^(#{1,6}\s|\s*[-*•]\s+|\s*\d+[.)]\s+|\s*(---|\*\*\*)\s*$)/.test(L[i]) && !isRow(L[i])) {
      p.push(L[i]);
      i += 1;
    }
    if (p.length) out.push({ type: 'p', text: p.join('\n') });
    else i += 1;
  }
  return out;
}

// **qalin**, *kursiv*, `kod` → HTML (kirish allaqachon ekranlangan bo'lishi kerak)
export function inlineHTML(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/\n/g, '<br>');
}

// Word uchun: [{text, bold, italics}]
export function inlineRuns(s) {
  const runs = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\*([^*\n]+)\*/g;
  let last = 0;
  let m;
  const src = String(s ?? '');
  while ((m = re.exec(src))) {
    if (m.index > last) runs.push({ text: src.slice(last, m.index) });
    if (m[1]) runs.push({ text: m[1], bold: true });
    else if (m[2]) runs.push({ text: m[2] });
    else if (m[3]) runs.push({ text: m[3], italics: true });
    last = m.index + m[0].length;
  }
  if (last < src.length) runs.push({ text: src.slice(last) });
  return runs;
}

export function blocksToHTML(blocks) {
  return blocks
    .map((b) => {
      if (b.type === 'table') {
        return `<div class="table-wrap"><table><thead><tr>${b.head.map((x) => `<th>${inlineHTML(x)}</th>`).join('')}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((c) => `<td>${inlineHTML(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      }
      if (b.type === 'h') {
        const n = Math.min(b.level + 2, 5);
        return `<h${n}>${inlineHTML(b.text)}</h${n}>`;
      }
      if (b.type === 'hr') return '<hr>';
      if (b.type === 'ul') return `<ul>${b.items.map((x) => `<li>${inlineHTML(x)}</li>`).join('')}</ul>`;
      if (b.type === 'ol') return `<ol>${b.items.map((x) => `<li>${inlineHTML(x)}</li>`).join('')}</ol>`;
      return `<p>${inlineHTML(b.text)}</p>`;
    })
    .join('');
}

export const mdToHTML = (src) => blocksToHTML(mdBlocks(src));

export function stripMd(s) {
  return String(s ?? '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*•]\s+/gm, '• ');
}
