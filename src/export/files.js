// Fayl yaratish: Word (.docx), Excel (.xlsx), PDF (chop etish oynasi orqali), HTML.
// docx va xlsx kutubxonalari faqat kerak bo'lganda yuklanadi (bosh sahifa yengil qoladi).
import { reportDocumentHTML, reportHTML } from './html.js';
import { inlineRuns } from '../lib/markdown.js';
import { fmtDate } from '../lib/dates.js';

export function slug(s) {
  return (
    String(s || 'hisobot')
      .toLowerCase()
      .replace(/[ʻʼ’‘'`]/g, '')
      .replace(/[^a-z0-9а-яё]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'hisobot'
  );
}

export function saveBlob(filename, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1500);
}

export function saveText(filename, text, type = 'text/plain;charset=utf-8') {
  saveBlob(filename, new Blob([text], { type }));
}

/* ---------------- PDF: chop etish ---------------- */
export function printReport(rep) {
  let root = document.getElementById('print-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'print-root';
    document.body.appendChild(root);
  }
  root.innerHTML = reportHTML(rep);
  const prevTitle = document.title;
  document.title = rep.title;
  document.body.classList.add('printing');
  const done = () => {
    document.body.classList.remove('printing');
    document.title = prevTitle;
    root.innerHTML = '';
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  setTimeout(() => {
    window.print();
    // ba'zi brauzerlar afterprint yubormaydi
    setTimeout(() => document.body.classList.contains('printing') && done(), 2000);
  }, 60);
}

export function downloadHTML(rep) {
  saveText(`${slug(rep.title)}.html`, reportDocumentHTML(rep), 'text/html;charset=utf-8');
}

/* ---------------- Word ---------------- */
export async function downloadDocx(rep) {
  saveBlob(`${slug(rep.title)}.docx`, await reportToDocxBlob(rep));
}

export async function reportToDocxBlob(rep) {
  const d = await import('docx');
  const { AlignmentType, BorderStyle, Document, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } = d;
  const FONT = 'Times New Roman';
  const run = (text, o = {}) => new TextRun({ text: String(text ?? ''), font: FONT, size: o.size || 28, bold: o.bold, italics: o.italics, color: o.color });
  const para = (children, o = {}) => new Paragraph({ children, alignment: o.align, spacing: { after: o.after ?? 120 }, bullet: o.bullet ? { level: 0 } : undefined, indent: o.indent });
  const runsOf = (s, size) => inlineRuns(s).map((r) => run(r.text, { bold: r.bold, italics: r.italics, size }));
  const table = (head, rows) =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ tableHeader: true, children: head.map((h) => new TableCell({ shading: { type: ShadingType.CLEAR, fill: 'EEEEEE', color: 'auto' }, children: [para([run(h, { bold: true, size: 22 })], { after: 0 })] })) }),
        ...rows.map((r) => new TableRow({ children: r.map((c) => new TableCell({ children: [para(runsOf(String(c ?? ''), 22), { after: 0 })] })) })),
      ],
    });
  const children = [];
  for (const o of rep.org || []) children.push(para([run(String(o).toUpperCase(), { size: 24 })], { align: AlignmentType.CENTER, after: 0 }));
  children.push(para([run(rep.title, { bold: true, size: 32 })], { align: AlignmentType.CENTER, after: 60 }));
  if (rep.subtitle) children.push(para([run(rep.subtitle, { italics: true, size: 24 })], { align: AlignmentType.CENTER, after: 60 }));
  children.push(para([run(fmtDate(rep.date), { size: 24 })], { align: AlignmentType.RIGHT, after: 240 }));
  for (const s of rep.sections || []) {
    if (s.heading) children.push(para([run(s.heading + (s.ai ? ' (AI tahlili)' : ''), { bold: true })], { after: 100 }));
    if (s.text) children.push(para(runsOf(s.text)));
    for (const b of s.bullets || []) children.push(para(runsOf(b), { bullet: true, after: 60 }));
    if (s.table) {
      children.push(table(s.table.head, s.table.rows));
      children.push(para([run('')], { after: 120 }));
    }
    for (const b of s.blocks || []) {
      if (b.type === 'p') children.push(para(runsOf(b.text)));
      else if (b.type === 'h') children.push(para([run(b.text, { bold: true })]));
      else if (b.type === 'ul') b.items.forEach((x) => children.push(para(runsOf(x), { bullet: true, after: 60 })));
      else if (b.type === 'ol') b.items.forEach((x, i) => children.push(para([run(`${i + 1}. `), ...runsOf(x)], { after: 60, indent: { left: 360 } })));
      else if (b.type === 'table') {
        children.push(table(b.head, b.rows));
        children.push(para([run('')], { after: 120 }));
      }
    }
  }
  if (rep.signature) {
    children.push(para([run('')], { after: 480 }));
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } },
        rows: [new TableRow({ children: [new TableCell({ children: [para([run(`${rep.signature.role}:`)])] }), new TableCell({ children: [para([run(`____________ ${rep.signature.name || ''}`)], { align: AlignmentType.RIGHT })] })] })],
      }),
    );
  }
  const doc = new Document({
    creator: 'KafedraAgent',
    title: rep.title,
    styles: { default: { document: { run: { font: FONT, size: 28 } } } },
    // O'zbekiston rasmiy hujjat maydonlari: chap 3 sm, o'ng 1.5 sm, yuqori/past 2 sm
    sections: [{ properties: { page: { margin: { top: 1134, bottom: 1134, left: 1701, right: 850 } } }, children }],
  });
  return Packer.toBlob(doc);
}

/* ---------------- Excel ---------------- */
function sheetName(name, used) {
  let n = String(name || 'Varaq').replace(/[[\]:*?/\\]/g, ' ').replace(/^\d+\.\s*/, '').trim().slice(0, 28) || 'Varaq';
  let k = n;
  let i = 2;
  while (used.has(k)) {
    k = `${n.slice(0, 25)} ${i}`;
    i += 1;
  }
  used.add(k);
  return k;
}

export async function downloadXlsx(filename, sheets) {
  const XLSX = await import('xlsx');
  XLSX.writeFile(await buildWorkbook(sheets), filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

export async function buildWorkbook(sheets) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const used = new Set();
  for (const s of sheets) {
    const aoa = [...(s.pre || []).map((x) => [x]), ...(s.pre?.length ? [[]] : []), s.head, ...s.rows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = s.head.map((h, i) => ({ wch: Math.min(60, Math.max(8, String(h).length + 2, ...s.rows.slice(0, 200).map((r) => String(r[i] ?? '').length + 1))) }));
    XLSX.utils.book_append_sheet(wb, ws, sheetName(s.name, used));
  }
  return wb;
}

export function reportSheets(rep) {
  const sheets = [];
  const lines = [];
  for (const s of rep.sections || []) {
    if (s.table) sheets.push({ name: s.heading, head: s.table.head, rows: s.table.rows });
    for (const b of s.blocks || []) if (b.type === 'table') sheets.push({ name: s.heading || 'Jadval', head: b.head, rows: b.rows });
    if (s.text) lines.push([s.heading || '', s.text]);
    for (const b of s.bullets || []) lines.push([s.heading || '', b]);
    for (const b of s.blocks || []) {
      if (b.type === 'p') lines.push([s.heading || '', b.text]);
      if (b.type === 'ul' || b.type === 'ol') b.items.forEach((x) => lines.push([s.heading || '', x]));
    }
  }
  sheets.unshift({ name: 'Umumiy', pre: [...(rep.org || []), rep.title, rep.subtitle || '', fmtDate(rep.date)], head: ["Bo'lim", 'Mazmun'], rows: lines });
  return sheets;
}

export async function reportToXlsx(rep) {
  await downloadXlsx(slug(rep.title), reportSheets(rep));
}
