// Hisobotni rasmiy hujjat ko'rinishidagi HTMLga aylantirish. Oldindan ko'rish,
// PDF (chop etish) va .html yuklab olish — hammasi aynan shu natijadan.
// Barcha matn ekranlanadi (esc) — ma'lumotdan kelgan satr HTML sifatida ishlamaydi.
import { blocksToHTML, esc, inlineHTML } from '../lib/markdown.js';
import { fmtDate } from '../lib/dates.js';

function tableHTML(t) {
  if (!t) return '';
  return `<table><thead><tr>${t.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.rows
    .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;
}

export function reportHTML(rep) {
  const org = (rep.org || []).map((o) => `<div>${esc(o)}</div>`).join('');
  const sections = (rep.sections || [])
    .map((s) => {
      const body = [
        s.text ? `<p>${esc(s.text)}</p>` : '',
        s.bullets?.length ? `<ul>${s.bullets.map((b) => `<li>${inlineHTML(b)}</li>`).join('')}</ul>` : '',
        tableHTML(s.table),
        s.blocks ? blocksToHTML(s.blocks) : '',
      ].join('');
      if (s.ai) {
        return `<section class="ai-sec">${s.heading ? `<h2>${esc(s.heading)}</h2>` : ''}<div class="ai-tag">AI tahlili · ${esc(s.model || '')} · raqamlar yuqoridagi jadvallardan</div>${body}</section>`;
      }
      return `<section>${s.heading ? `<h2>${esc(s.heading)}</h2>` : ''}${body}</section>`;
    })
    .join('');
  const sign = rep.signature
    ? `<div class="sign"><span>${esc(rep.signature.role)}:</span><span>____________ ${esc(rep.signature.name || '')}</span></div>`
    : '';
  return `<div class="paper"><div class="org">${org}</div><h1>${esc(rep.title)}</h1>${rep.subtitle ? `<div class="psub">${esc(rep.subtitle)}</div>` : ''}<div class="pdate">${fmtDate(rep.date)}</div>${sections}${sign}</div>`;
}

const PAPER_CSS = `body{margin:0;background:#f3f3f3}.paper{background:#fff;color:#111;padding:44px 52px;font-family:"Times New Roman",Times,serif;font-size:15px;line-height:1.5;max-width:860px;margin:24px auto}.org{text-align:center;font-size:13.5px;text-transform:uppercase;color:#333}h1{text-align:center;font-size:20px;margin:18px 0 2px}.psub{text-align:center;color:#444;margin-bottom:18px}h2{font-size:16px;margin:18px 0 8px}table{border-collapse:collapse;width:100%;font-size:13px;margin:6px 0 10px}th,td{border:1px solid #555;padding:4px 7px;text-align:left;vertical-align:top}th{background:#f1f1f1}.ai-sec{border-left:3px solid #1d4fd8;padding-left:12px}.ai-tag{font-family:sans-serif;font-size:11px;color:#1d4fd8;font-weight:600}.sign{margin-top:34px;display:flex;justify-content:space-between}.pdate{text-align:right;color:#444;font-size:13px}@media print{body{background:#fff}.paper{margin:0;padding:0}}`;

export function reportDocumentHTML(rep) {
  return `<!doctype html><html lang="uz"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(rep.title)}</title><style>${PAPER_CSS}</style></head><body>${reportHTML(rep)}</body></html>`;
}
