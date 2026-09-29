// Rasmdan olingan jadvalni tizim yozuvlariga aylantirish. Hammasi deterministik
// va sinovdan o'tadigan kod: ustunni sarlavhasidan taniymiz, bahoni
// normallashtiramiz, o'qituvchi ismini bazadagi o'qituvchiga bog'laymiz.
import { PUB_STATUS, PUB_TYPES } from './constants.js';
import { isISO } from './dates.js';
import { norm } from './format.js';
import { groupsFromPlans } from './grades.js';

// Levenshtein asosida o'xshashlik (0..1): OCR bitta-ikkita harfni adashtirsa ham topish uchun
export function similar(a, b) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const m = x.length;
  const n = y.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i += 1) {
    const cur = [i];
    for (let j = 1; j <= n; j += 1) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

function col(headers, re) {
  return headers.findIndex((h) => re.test(norm(h)));
}

export function detectType(doc) {
  const t = norm(doc?.hujjat_turi);
  if (t.includes('qaydnoma')) return 'qaydnoma';
  if (t.includes('ilmiy')) return 'ilmiy_ishlar';
  const h = (doc?.ustunlar || []).map(norm).join(' | ');
  if (/baho|ball/.test(h) && /f\.?i\.?sh|talaba/.test(h)) return 'qaydnoma';
  if (/mavzu|maqola/.test(h) && /jurnal|nashr|muallif/.test(h)) return 'ilmiy_ishlar';
  return 'boshqa';
}

export function toGrade(v) {
  const s = norm(v);
  if (!s) return null;
  if (/qoniqarsiz|^2$|^2\s/.test(s)) return 2;
  if (/a.lo|^5$|^5\s|a'lo/.test(s)) return 5;
  if (/yaxshi|^4$|^4\s/.test(s)) return 4;
  if (/qoniqarli|^3$|^3\s/.test(s)) return 3;
  const n = parseFloat(s.replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  if (n <= 5) return Math.max(2, Math.round(n));
  if (n >= 86) return 5;
  if (n >= 71) return 4;
  if (n >= 55) return 3;
  return 2;
}

// "Ismoilov A.R." yoki "Ismoilov Azizbek" → o'qituvchi id
export function matchTeacher(teachers, name) {
  const n = norm(name).replace(/[.,]/g, ' ');
  const words = n.split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const sur = words[0];
  const cands = teachers.filter((t) => norm(t.name).split(' ')[0] === sur);
  if (cands.length === 1) return cands[0];
  if (cands.length > 1 && words[1]) {
    const ini = words[1][0];
    return cands.find((t) => norm(t.name).split(' ')[1]?.[0] === ini) || null;
  }
  return null;
}

export function parseDate(v) {
  const s = String(v || '').trim();
  let m = s.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m && isISO(m[0]) ? m[0] : '';
}

function pickOption(options, v) {
  const n = norm(v);
  if (!n) return '';
  return options.find((o) => norm(o) === n) || options.find((o) => n.includes(norm(o)) || norm(o).includes(n)) || '';
}

/** Qaydnoma → o'zlashtirish yozuvi (mavjud bo'lsa yangilash taklifi) */
export function mapGrades(doc, ctx) {
  const h = doc.ustunlar || [];
  const cName = col(h, /f\.?i\.?sh|talaba|ism/);
  const cGrade = col(h, /baho/);
  const cScore = col(h, /ball/);
  const rows = (doc.qatorlar || [])
    .map((r) => {
      const name = String(r[cName] ?? '').trim();
      const grade = toGrade(cGrade >= 0 ? r[cGrade] : null) ?? toGrade(cScore >= 0 ? r[cScore] : null);
      return { name, score: cScore >= 0 ? r[cScore] : '', gradeText: cGrade >= 0 ? r[cGrade] : '', grade };
    })
    .filter((r) => r.name && r.grade);
  const counts = { a: 0, b: 0, c: 0, f: 0 };
  rows.forEach((r) => {
    counts[{ 5: 'a', 4: 'b', 3: 'c', 2: 'f' }[r.grade]] += 1;
  });
  const meta = doc.meta || {};
  const group = String(meta.guruh || '').trim().toUpperCase();
  const subject = String(meta.fan || '').trim();
  const teacher = matchTeacher(ctx.teachers, meta.oqituvchi);
  const sameGroup = ctx.grades.filter((g) => norm(g.group) === norm(group));
  const best = sameGroup.map((g) => ({ g, s: similar(g.subject, subject) })).sort((a, b) => b.s - a.s)[0];
  const existing = best && best.s >= 0.85 ? best.g : null;
  const grp = groupsFromPlans(ctx).find((g) => norm(g.name) === norm(group));
  return {
    subjectFixed: existing && norm(existing.subject) !== norm(subject) ? existing.subject : null,
    rows,
    counts,
    students: rows.length,
    debtors: rows.filter((r) => r.grade === 2).map((r) => r.name),
    group,
    subject,
    teacher,
    teacherName: meta.oqituvchi || '',
    existing,
    kurs: existing?.kurs || grp?.kurs || null,
    planId: existing?.planId || grp?.planId || null,
    problems: [
      cName < 0 ? 'Talaba ismi ustuni topilmadi' : null,
      cGrade < 0 && cScore < 0 ? 'Baho/ball ustuni topilmadi' : null,
      !group ? 'Guruh nomi aniqlanmadi' : null,
      !subject ? 'Fan nomi aniqlanmadi' : null,
      meta.oqituvchi && !teacher ? `«${meta.oqituvchi}» bazadagi o'qituvchiga bog'lanmadi` : null,
    ].filter(Boolean),
  };
}

/** Ilmiy ishlar ro'yxati → yangi ilmiy ish yozuvlari */
export function mapPubs(doc, ctx) {
  const h = doc.ustunlar || [];
  const c = {
    author: col(h, /muallif|o.qituvchi|f\.?i\.?sh/),
    title: col(h, /mavzu|maqola|nomi|sarlavha/),
    journal: col(h, /jurnal|nashr/),
    type: col(h, /tur/),
    status: col(h, /holat/),
    date: col(h, /muddat|sana/),
  };
  const known = new Set(ctx.pubs.map((p) => norm(p.title)));
  const recs = (doc.qatorlar || [])
    .map((r) => {
      const teacher = matchTeacher(ctx.teachers, r[c.author]);
      const title = String(r[c.title] ?? '').trim();
      const rec = {
        title,
        teacherId: teacher?.id || '',
        journal: String(r[c.journal] ?? '').trim(),
        type: pickOption(PUB_TYPES, r[c.type]) || "O'quv qo'llanma",
        status: pickOption(PUB_STATUS, r[c.status]) || 'Reja',
        deadline: parseDate(r[c.date]),
        quartile: '—',
        coauthors: '',
        pubDate: '',
      };
      return { rec, authorText: r[c.author] || '', teacher, duplicate: known.has(norm(title)), ok: !!title && !!teacher };
    })
    .filter((x) => x.rec.title);
  return { recs, problems: c.title < 0 ? ['Mavzu ustuni topilmadi'] : [] };
}
