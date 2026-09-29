// Namuna ishchi o'quv reja (.xlsx): 1-kurs "Dasturiy injiniring", 2026-2027.
// Tuzilishi haqiqiy OTM ish rejalariga o'xshaydi: sarlavha qatorlari, semestrlar
// 1..8 ustunlari (har biri ma'ruza/amaliy/lab/seminar), "1.00" blok qatorlari.
// Ishga tushirish: npm run namuna  →  public/namuna/ish-reja-namuna.xlsx
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';

XLSX.set_fs(fs);

const SEM0 = 18; // 1-semestr ustuni; har semestr 4 ustun (M, A, L, S)
const row = () => Array(SEM0 + 32).fill(null);

function subject(no, code, name, total, sems, ki = false) {
  const r = row();
  r[0] = no;
  r[2] = code;
  r[5] = name;
  r[10] = total;
  if (ki) r[17] = 'KI';
  for (const [sem, h] of Object.entries(sems)) h.forEach((v, k) => { r[SEM0 + (sem - 1) * 4 + k] = v || null; });
  return r;
}

const rows = [];
const text = (t, c = 0) => {
  const r = row();
  r[c] = t;
  rows.push(r);
};
text("O'ZBEKISTON RESPUBLIKASI OLIY TA'LIM, FAN VA INNOVATSIYALAR VAZIRLIGI");
text('BUXORO DAVLAT UNIVERSITETI');
text("ISHCHI O'QUV REJA (namuna)");
text("1-kurs talabalari uchun 2026-2027 o'quv yili");
text("Ta'lim yo'nalishi: 60610300 - Dasturiy injiniring O'QISH MUDDATI 4 yil");
text("TA'LIM SHAKLI - kunduzgi");
rows.push(row());
const head = row();
head[0] = '№';
head[2] = 'Fan kodi';
head[5] = 'Fanlari nomlari';
head[10] = 'Umumiy yuklama';
head[17] = 'Kurs ishi';
for (let s = 1; s <= 8; s += 1) head[SEM0 + (s - 1) * 4] = `${s}-semestr`;
rows.push(head);
const sub = row();
for (let s = 1; s <= 8; s += 1) ["Ma'ruza", 'Amaliy', 'Laboratoriya', 'Seminar'].forEach((l, k) => { sub[SEM0 + (s - 1) * 4 + k] = l; });
rows.push(sub);
const nums = row();
for (let s = 1; s <= 8; s += 1) nums[SEM0 + (s - 1) * 4] = s;
rows.push(nums);

const block = (no, name) => {
  const r = row();
  r[0] = no;
  r[5] = name;
  rows.push(r);
};
block('1.00', 'Majburiy fanlar');
rows.push(subject('1.01', 'DAS1101', 'Dasturlash asoslari', 300, { 1: [30, 0, 46, 0], 2: [30, 0, 46, 0] }, true));
rows.push(subject('1.02', 'KTA1101', 'Kompyuter tizimlari arxitekturasi', 150, { 1: [30, 30, 0, 0] }));
rows.push(subject('1.03', 'AMT1102', "Algoritmlar va ma'lumotlar tuzilmasi", 180, { 2: [30, 16, 30, 0] }));
rows.push(subject('1.04', 'WDA1102', 'Web dasturlash asoslari', 120, { 2: [16, 0, 30, 0] }));
rows.push(subject('1.05', 'IAT1101', 'Informatika va axborot texnologiyalari', 120, { 1: [16, 30, 0, 0] }));
rows.push(subject('1.06', 'OMT1101', 'Oliy matematika', 240, { 1: [30, 46, 0, 0], 2: [30, 46, 0, 0] }));
rows.push(subject('1.07', 'OZT1101', "O'zbekiston tarixi", 120, { 1: [30, 0, 0, 30] }));
rows.push(subject('1.08', 'XT1101', 'Xorijiy til', 180, { 1: [0, 60, 0, 0], 2: [0, 60, 0, 0] }));
block('2.00', 'Tanlov fanlari');
rows.push(subject('2.01', 'PDT1102', 'Python dasturlash tili', 90, { 2: [0, 30, 0, 0] }));
const alt = row();
alt[2] = 'JDT1102';
alt[5] = 'Java dasturlash tili';
rows.push(alt);

const ws = XLSX.utils.aoa_to_sheet(rows);
ws['!cols'] = rows[0].map((_, i) => ({ wch: i === 5 ? 42 : i === 0 ? 6 : 5 }));
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'DI-2026 -kunduzgi');
const out = path.resolve('public/namuna/ish-reja-namuna.xlsx');
XLSX.writeFile(wb, out);
console.log('saved', out, fs.statSync(out).size, 'bytes');
