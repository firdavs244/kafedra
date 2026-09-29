// Rasmiy hisobotlar. Barcha raqamlar kod bilan hisoblanadi (deterministik) —
// AI faqat ixtiyoriy "xulosa" bo'limini qo'shadi va u alohida belgilanadi.
// Hisobot = { kind, title, subtitle, sections: [{heading, text, bullets, table:{head, rows}}] }
import { ATT_REASONS, KPI_CATS, PUB_STATUS } from './constants.js';
import { fmtDate, fmtMonth, fmtShort, daysBetween } from './dates.js';
import { num, pct, shortName } from './format.js';
import { computeAlerts, kpiOfMonth, kpiScore, kpiStatus, pubLate, stLate, subjState, summary, teacherStats, tshort } from './analytics.js';
import { attMonthStats } from './attendance.js';
import { debtors, gradesByGroup, gradesBySubject, gradesTotal } from './grades.js';
import { allocItems, LC_KIND, wlSummary } from './workload.js';
import { mdBlocks } from './markdown.js';

export const REPORT_KINDS = [
  { id: 'monthly', title: 'Oylik faoliyat hisoboti', needs: 'month', desc: "KPI, o'quv ishi, ilmiy faoliyat, loyihalar, davomat va muammolar — bitta hujjatda" },
  { id: 'workload', title: "Yuklama taqsimoti hisoboti", needs: null, desc: "O'qituvchilar kesimida ma'ruza, amaliy, laboratoriya soatlari va taqsimlanmagan yuklama" },
  { id: 'kpi', title: 'KPI bajarilishi', needs: 'month', desc: "Yo'nalishlar bo'yicha reja/fakt, vaznli ball va mas'ullar" },
  { id: 'grades', title: "O'zlashtirish va akademik qarzdorlar", needs: null, desc: "Guruh va fanlar kesimida o'zlashtirish, sifat, qarzdorlar ro'yxati" },
  { id: 'attendance', title: 'Davomat tabeli (oylik)', needs: 'month', desc: "Kelgan kunlar, kechikishlar, sababli va sababsiz kunlar" },
  { id: 'teacher', title: "O'qituvchi shaxsiy hisoboti", needs: 'teacher', desc: "Bitta o'qituvchining yuklama, ilmiy ish, loyiha, KPI va davomat ko'rsatkichlari" },
];

function head(ctx, title, subtitle) {
  return {
    title,
    subtitle,
    org: [ctx.settings.university, ctx.settings.faculty, ctx.settings.name].filter(Boolean),
    date: ctx.today,
    signature: { role: 'Kafedra mudiri', name: ctx.settings.head || '' },
  };
}

function monthly(ctx, ym) {
  const s = summary(ctx);
  const kpi = kpiOfMonth(ctx, ym);
  const alerts = computeAlerts(ctx);
  const stats = ctx.teachers.map((t) => ({ t, s: teacherStats(ctx, t) }));
  const behind = stats.filter((x) => x.s.expected >= 10 && x.s.loadPace < 0.9).sort((a, b) => a.s.loadPace - b.s.loadPace);
  const pubsMonth = ctx.pubs.filter((p) => p.pubDate && p.pubDate.startsWith(ym));
  const late = ctx.pubs.filter((p) => pubLate(ctx, p));
  const active = ctx.projects.filter((p) => p.status === 'Jarayonda');
  const att = ctx.teachers.map((t) => ({ t, a: attMonthStats(ctx, ym, t.id) }));
  const failed = kpi.filter((k) => kpiStatus(ctx, k).key === 'failed');
  const risk = kpi.filter((k) => kpiStatus(ctx, k).key === 'risk');
  const measures = [
    ...failed.map((k) => `KPI ${k.code} «${k.title}» bo'yicha qolgan ${num(k.target) - num(k.actual)} ${k.unit || ''}ni yopish rejasini tuzish — mas'ul ${tshort(ctx, k.responsibleId)}.`),
    ...late.slice(0, 3).map((p) => `«${p.title}» maqolasi uchun yangi muddat belgilash va kafedra majlisida hisobot olish — ${tshort(ctx, p.teacherId)}.`),
    ...(s.workload.unassigned ? [`${s.workload.unassigned} soat taqsimlanmagan yuklama uchun o'rindosh o'qituvchi jalb qilish yoki stavkalarni qayta ko'rib chiqish.`] : []),
    ...(s.grades.debtors ? [`${s.grades.debtors} nafar akademik qarzdor talaba bilan qayta topshirish jadvalini tasdiqlash.`] : []),
  ].slice(0, 6);
  return {
    ...head(ctx, `${fmtMonth(ym)} oyi faoliyat hisoboti`, `${ctx.settings.year} o'quv yili`),
    kind: 'monthly',
    period: ym,
    sections: [
      {
        heading: '1. Asosiy ko\'rsatkichlar',
        table: {
          head: ["Ko'rsatkich", 'Qiymat', 'Izoh'],
          rows: [
            ["O'qituvchilar", `${s.teachers} nafar`, `${s.rates} stavka`],
            ['Talabalar kontingenti', `${s.students} nafar`, `${s.groups} ta guruh`],
            ['KPI bajarilishi (vaznli)', `${kpiScore(kpi)}%`, `${kpi.filter((k) => kpiStatus(ctx, k).key === 'done').length}/${kpi.length} band bajarildi`],
            ["O'quv yuklama bajarilishi", `${s.load.pct}%`, `${s.load.done} / ${s.load.expected} kutilgan soat`],
            ['Ilmiy maqolalar (yillik reja)', `${s.pubs.ok} / ${s.pubs.plan}`, `${s.pubs.behind} o'qituvchi ortda`],
            ['Faol loyihalar', `${s.projects.active} ta`, `${s.projects.funding} mln so'm`],
            ["Talabalar o'zlashtirishi", `${s.grades.pass}%`, `sifat ${s.grades.quality}%, qarzdorlar ${s.grades.debtors}`],
          ],
        },
      },
      {
        heading: "2. O'quv ishi",
        text: behind.length ? `Dars soatlari bajarilishi me'yordan past bo'lgan o'qituvchilar: ${behind.length} nafar.` : "Barcha o'qituvchilar dars jadvali bo'yicha me'yorda.",
        table: behind.length ? { head: ["O'qituvchi", "O'tilgan", 'Kutilgan', 'Bajarilish'], rows: behind.map(({ t, s: x }) => [shortName(t.name), x.done, x.expected, `${Math.round(x.loadPace * 100)}%`]) } : null,
      },
      {
        heading: '3. Ilmiy faoliyat',
        bullets: [
          `Holatlar bo'yicha: ${PUB_STATUS.map((st) => `${st.toLowerCase()} — ${ctx.pubs.filter((p) => p.status === st).length}`).join(', ')}.`,
          pubsMonth.length ? `Shu oyda chop etilgan: ${pubsMonth.map((p) => `«${p.title}» (${p.journal || p.type}, ${tshort(ctx, p.teacherId)})`).join('; ')}.` : 'Shu oyda chop etilgan ish yo\'q.',
          late.length ? `Muddati o'tgan ishlar: ${late.map((p) => `«${p.title}» — ${tshort(ctx, p.teacherId)}, ${daysBetween(p.deadline, ctx.today)} kun`).join('; ')}.` : "Muddati o'tgan ilmiy ish yo'q.",
        ],
      },
      {
        heading: '4. Loyihalar va grantlar',
        table: active.length ? { head: ['Loyiha', 'Turi', 'Rahbar', "Mablag' (mln)", 'Bajarilish', 'Tugash'], rows: active.map((p) => [p.title, p.type, tshort(ctx, p.leaderId), num(p.funding), `${num(p.progress)}%`, fmtShort(p.end)]) } : null,
        text: active.length ? '' : "Faol loyiha yo'q.",
      },
      {
        heading: `5. KPI bajarilishi (${fmtMonth(ym)})`,
        table: kpi.length ? { head: ['Band', "Ko'rsatkich", "Mas'ul", 'Reja', 'Fakt', 'Holat'], rows: kpi.slice().sort((a, b) => String(a.code).localeCompare(String(b.code), undefined, { numeric: true })).map((k) => [k.code, k.title, tshort(ctx, k.responsibleId), num(k.target), num(k.actual), kpiStatus(ctx, k).label]) } : null,
        text: kpi.length ? '' : 'Bu oy uchun KPI bandlari kiritilmagan.',
      },
      {
        heading: '6. Mehnat intizomi (davomat)',
        table: { head: ["O'qituvchi", 'Kelgan kunlar', 'Kechikish', 'Sababli', 'Sababsiz'], rows: att.map(({ t, a }) => [shortName(t.name), `${a.present}/${a.work}`, a.late ? `${a.late} (${a.lateMin} daq)` : '—', a.excused || '—', a.absent || '—']) },
      },
      { heading: '7. Aniqlangan muammolar', bullets: alerts.filter((a) => a.sev === 'bad').slice(0, 10).map((a) => a.text) },
      { heading: '8. Tavsiya etiladigan choralar', bullets: measures.length ? measures : ["Jiddiy muammo aniqlanmadi — joriy rejani davom ettirish."] },
    ],
  };
}

function workloadReport(ctx) {
  const s = wlSummary(ctx);
  const un = allocItems(ctx).filter((i) => !i.teacherId);
  const R = (v) => Math.round(v);
  return {
    ...head(ctx, "O'quv yuklamasi taqsimoti", `${ctx.settings.year} o'quv yili`),
    kind: 'workload',
    sections: [
      { heading: 'Umumiy', bullets: [`Kafedra yuklamasi: ${R(s.total)} soat (kuzgi ${R(s.h1)}, bahorgi ${R(s.h2)}).`, `Taqsimlangan: ${pct(s.total - s.unassigned, s.total)}%, taqsimlanmagan: ${R(s.unassigned)} soat.`] },
      {
        heading: "O'qituvchilar kesimida",
        table: {
          head: ["O'qituvchi", 'Lavozim', 'Stavka', "Me'yor", "Ma'ruza", 'Amaliy', 'Lab.', 'Kurs ishi', 'Jami', '%'],
          rows: s.rows.map((r) => [r.t.name, r.t.position, num(r.t.rate), r.norm, R(r.M), R(r.A), R(r.L), R(r.KI), R(r.total), `${r.norm ? Math.round((r.total / r.norm) * 100) : 0}%`]),
        },
      },
      un.length ? { heading: 'Taqsimlanmagan yuklama', table: { head: ['Fan', 'Turi', 'Guruh', 'Semestr', 'Soat'], rows: un.map((i) => [i.name, LC_KIND[i.kind], i.group, i.sem, i.hours]) } } : { heading: 'Taqsimlanmagan yuklama', text: "Barcha yuklama taqsimlangan." },
    ],
  };
}

function kpiReport(ctx, ym) {
  const list = kpiOfMonth(ctx, ym);
  return {
    ...head(ctx, `KPI bajarilishi — ${fmtMonth(ym)}`, `Umumiy vaznli bajarilish: ${kpiScore(list)}%`),
    kind: 'kpi',
    period: ym,
    sections: KPI_CATS.map((c) => {
      const items = list.filter((k) => k.category === c);
      if (!items.length) return null;
      return {
        heading: `${c} — ${kpiScore(items)}%`,
        table: { head: ['Band', "Ko'rsatkich", "Mas'ul", 'Reja', 'Fakt', 'Muddat', 'Holat'], rows: items.map((k) => [k.code, k.title, tshort(ctx, k.responsibleId), num(k.target), num(k.actual), fmtShort(k.deadline), kpiStatus(ctx, k).label]) },
      };
    }).filter(Boolean),
  };
}

function gradesReport(ctx) {
  const t = gradesTotal(ctx);
  const subj = gradesBySubject(ctx);
  const groups = gradesByGroup(ctx);
  const list = debtors(ctx);
  const session = ctx.grades[0]?.session || '';
  return {
    ...head(ctx, "Talabalar o'zlashtirishi", session),
    kind: 'grades',
    sections: [
      { heading: 'Umumiy', bullets: [`O'zlashtirish: ${t.pass}%, sifat ko'rsatkichi: ${t.quality}%, o'rtacha baho: ${t.avg}.`, `Akademik qarzdorlar: ${t.f} nafar.`] },
      { heading: 'Fanlar kesimida', table: { head: ['Fan', "O'qituvchi", 'Guruhlar', "O'zlashtirish", 'Sifat', 'Qarzdorlar'], rows: subj.map((x) => [x.subject, x.teacherIds.map((id) => tshort(ctx, id)).join(', '), x.groups, `${x.pass}%`, `${x.quality}%`, x.f]) } },
      { heading: 'Guruhlar kesimida', table: { head: ['Guruh', 'Kurs', 'Talabalar', "O'zlashtirish", 'Sifat', 'Qarzdorlar'], rows: groups.map((g) => [g.group, g.kurs, g.students, `${g.pass}%`, `${g.quality}%`, g.f]) } },
      { heading: "Akademik qarzdorlar ro'yxati", table: list.length ? { head: ['№', 'Talaba', 'Guruh', 'Fan', 'Qayta topshirish'], rows: list.map((d, i) => [i + 1, d.name, d.group, d.subject, fmtShort(d.deadline)]) } : null, text: list.length ? '' : "Qarzdor talaba yo'q." },
    ],
  };
}

function attendanceReport(ctx, ym) {
  const rows = ctx.teachers.map((t) => {
    const a = attMonthStats(ctx, ym, t.id);
    return [t.name, t.position, `${a.present}/${a.work}`, a.late, a.lateMin, a.excused, a.absent, Math.round(a.min / 60)];
  });
  return {
    ...head(ctx, `Davomat tabeli — ${fmtMonth(ym)}`, `Ish vaqti ${ctx.settings.workStart || '08:30'}–${ctx.settings.workEnd || '17:00'}`),
    kind: 'attendance',
    period: ym,
    sections: [
      { heading: 'Umumiy jadval', table: { head: ["O'qituvchi", 'Lavozim', 'Kelgan kunlar', 'Kechikishlar', 'Kechikish (daq)', 'Sababli', 'Sababsiz', 'Ishlagan soat'], rows } },
      { heading: 'Izoh', text: `Sababli kunlar: ${ATT_REASONS.join(', ').toLowerCase()}. Hisob ${fmtDate(ctx.today)} holatiga.` },
    ],
  };
}

function teacherReport(ctx, tid) {
  const t = ctx.tById.get(tid);
  if (!t) return null;
  const s = teacherStats(ctx, t);
  const ym = ctx.today.slice(0, 7);
  const a = attMonthStats(ctx, ym, tid);
  const subs = ctx.subjects.filter((x) => x.teacherId === tid);
  const pubs = ctx.pubs.filter((x) => x.teacherId === tid);
  const prj = ctx.projects.filter((p) => p.leaderId === tid || (p.members || []).includes(tid));
  const kpi = kpiOfMonth(ctx).filter((k) => k.responsibleId === tid);
  const st = ctx.stwork.filter((x) => x.teacherId === tid);
  return {
    ...head(ctx, `${t.name} — shaxsiy hisobot`, `${t.position}${t.degree && t.degree !== '—' ? `, ${t.degree}` : ''} · ${num(t.rate)} stavka`),
    kind: 'teacher',
    sections: [
      { heading: 'Asosiy ko\'rsatkichlar', table: { head: ["Ko'rsatkich", 'Qiymat'], rows: [['Yillik yuklama / me\'yor', `${s.plan} / ${s.norm} soat`], ["O'tilgan / kutilgan soat", `${s.done} / ${s.expected}`], ['Maqolalar (yillik reja)', `${s.published + s.accepted} / ${s.pubPlan}`], ['Loyihalar', `${s.lead} rahbar, ${s.member} ijrochi`], ['Reyting bali', s.score], [`Davomat (${fmtMonth(ym)})`, `${a.present}/${a.work} kun, ${a.late} kechikish`]] } },
      { heading: 'Fanlar', table: subs.length ? { head: ['Fan', 'Turi', 'Semestr', 'Reja', "O'tildi", 'Holat'], rows: subs.map((x) => [x.name, x.kind, x.semester, num(x.planHours), num(x.doneHours), subjState(ctx, x).label]) } : null, text: subs.length ? '' : "Fan biriktirilmagan." },
      { heading: 'Ilmiy ishlar', table: pubs.length ? { head: ['Mavzu', 'Turi', 'Holat', 'Muddat'], rows: pubs.map((p) => [p.title, p.type, pubLate(ctx, p) ? `${p.status} (kechikkan)` : p.status, fmtShort(p.deadline)]) } : null, text: pubs.length ? '' : "Ilmiy ish kiritilmagan." },
      { heading: 'Loyihalar', bullets: prj.length ? prj.map((p) => `${p.title} — ${p.leaderId === tid ? 'rahbar' : 'ijrochi'}, ${num(p.progress)}%`) : ["Loyiha yo'q."] },
      { heading: 'Talabalar bilan ish', bullets: st.length ? st.map((x) => `${x.kind}: ${x.topic} (${stLate(ctx, x) ? 'kechikkan' : x.status})`) : ["Yozuv yo'q."] },
      { heading: `Mas'ul KPI bandlari (${fmtMonth(ym)})`, bullets: kpi.length ? kpi.map((k) => `${k.code} ${k.title}: ${num(k.actual)}/${num(k.target)} — ${kpiStatus(ctx, k).label}`) : ["Mas'ul band yo'q."] },
    ],
  };
}

export function buildReport(ctx, kind, arg) {
  const ym = arg || ctx.today.slice(0, 7);
  if (kind === 'monthly') return monthly(ctx, ym);
  if (kind === 'workload') return workloadReport(ctx);
  if (kind === 'kpi') return kpiReport(ctx, ym);
  if (kind === 'grades') return gradesReport(ctx);
  if (kind === 'attendance') return attendanceReport(ctx, ym);
  if (kind === 'teacher') return teacherReport(ctx, arg);
  return null;
}

// AI javobidan hisobot: markdown bloklari → bo'limlar
export function reportFromMarkdown(ctx, title, md, question) {
  const sections = [];
  let cur = { heading: '', paras: [] };
  const flush = () => {
    if (cur.heading || cur.paras.length) sections.push({ heading: cur.heading, blocks: cur.paras });
  };
  for (const b of mdBlocks(md)) {
    if (b.type === 'h') {
      flush();
      cur = { heading: b.text, paras: [] };
    } else cur.paras.push(b);
  }
  flush();
  return {
    ...head(ctx, title, question ? `So'rov: ${question}` : ''),
    kind: 'ai',
    sections: sections.map((s) => ({ heading: s.heading, blocks: s.blocks })),
  };
}

// AI xulosasi uchun ixcham kirish: hisobotning jadvallarini qisqa matnga aylantiradi
export function reportDigest(rep, maxChars = 3500) {
  const lines = [rep.title, rep.subtitle].filter(Boolean);
  for (const s of rep.sections || []) {
    if (s.heading) lines.push(`## ${s.heading}`);
    if (s.text) lines.push(s.text);
    for (const b of s.bullets || []) lines.push(`- ${b}`);
    if (s.table) {
      lines.push(s.table.head.join(' | '));
      for (const r of s.table.rows.slice(0, 25)) lines.push(r.join(' | '));
    }
  }
  const t = lines.join('\n');
  return t.length > maxChars ? `${t.slice(0, maxChars)}\n…` : t;
}

export function reportToMarkdown(rep) {
  const out = [`# ${rep.title}`];
  if (rep.subtitle) out.push(`*${rep.subtitle}*`);
  for (const s of rep.sections || []) {
    if (s.heading) out.push(`\n## ${s.heading}`);
    if (s.text) out.push(s.text);
    for (const b of s.bullets || []) out.push(`- ${b}`);
    if (s.table) {
      out.push(`| ${s.table.head.join(' | ')} |`, `| ${s.table.head.map(() => '---').join(' | ')} |`);
      for (const r of s.table.rows) out.push(`| ${r.join(' | ')} |`);
    }
    if (s.blocks) {
      for (const b of s.blocks) {
        if (b.type === 'p') out.push(b.text);
        else if (b.type === 'ul') b.items.forEach((x) => out.push(`- ${x}`));
        else if (b.type === 'ol') b.items.forEach((x, i) => out.push(`${i + 1}. ${x}`));
        else if (b.type === 'table') {
          out.push(`| ${b.head.join(' | ')} |`, `| ${b.head.map(() => '---').join(' | ')} |`);
          b.rows.forEach((r) => out.push(`| ${r.join(' | ')} |`));
        }
      }
    }
  }
  return out.join('\n');
}

