// AI agent vositalari (function calling). Har bir raqam shu yerda KOD bilan
// hisoblanadi — model faqat qaysi vositani chaqirishni tanlaydi va natijani
// o'zbekcha tushuntiradi. Shuning uchun agent "to'qib chiqargan" raqam bermaydi,
// va har bir javob ostida qaysi manbadan olingani ko'rsatiladi.
//
// Natijalar ixcham jadval ko'rinishida ({ustunlar, qatorlar}) — Groq bepul
// tarifida daqiqasiga 8000 token limiti bor, har bir kalit nomini har qatorda
// takrorlash shu limitni tez yeb qo'yardi.
import { PROJ_STATUS, PUB_STATUS, SCHEMA, TITLES } from '../lib/constants.js';
import { addDays, daysBetween, fmtMonth, fmtShort, isISO, monthDays, weekdayName } from '../lib/dates.js';
import { norm, num, shortName } from '../lib/format.js';
import { computeAlerts, currentSemester, deadlines, kpiByCategory, kpiOfMonth, kpiScore, kpiStatus, pubLate, pubSoon, stLate, subjState, summary, teacherStats, tshort } from '../lib/analytics.js';
import { attCode, attMonthStats, attStatus, isWorkday } from '../lib/attendance.js';
import { contingent, debtors, gradeRow, gradesByGroup, gradesBySubject, gradesTotal } from '../lib/grades.js';
import { activePlans, allocItems, allocStale, avgNorm, lcGroups, lcIsOurs, lcPlanLabel, LC_KIND, wlSummary } from '../lib/workload.js';

const R = Math.round;

// Sanani o'quvchiga tanish ko'rinishda (dd.mm.yyyy) — model uni shunday ko'chiradi
const D = (iso) => (iso ? fmtShort(iso) : '');

function table(ustunlar, qatorlar, limit = 40) {
  const out = { jami_qatorlar: qatorlar.length, ustunlar, qatorlar: qatorlar.slice(0, limit) };
  if (qatorlar.length > limit) out.izoh = `Faqat birinchi ${limit} ta qator ko'rsatildi; jami son — jami_qatorlar (${qatorlar.length}).`;
  return out;
}

export function findTeachers(ctx, q) {
  const words = norm(q).replace(/[.,]/g, ' ').split(/\s+/).filter((w) => w.length >= 3);
  if (!words.length) return [];
  const scored = ctx.teachers.map((t) => {
    const parts = norm(t.name).split(' ');
    let score = 0;
    for (const w of words) {
      parts.forEach((p, i) => {
        if (p.length >= 4 && w.startsWith(p)) score += i === 0 ? 3 : 1;
        else if (w.length >= 4 && p.startsWith(w)) score += i === 0 ? 3 : 1;
      });
    }
    return { t, score };
  });
  const max = Math.max(0, ...scored.map((x) => x.score));
  return max ? scored.filter((x) => x.score === max).map((x) => x.t) : [];
}

function teacherIdsOf(ctx, name) {
  if (!name) return null;
  const list = findTeachers(ctx, name);
  return list.length ? new Set(list.map((t) => t.id)) : new Set();
}

const noTeacher = (ctx, name) => ({ xato: `«${name}» nomli o'qituvchi topilmadi`, mavjud_oqituvchilar: ctx.teachers.map((t) => shortName(t.name)) });

/* ---------------- vositalar ---------------- */

function kafedra_holati(ctx) {
  const s = summary(ctx);
  const alerts = computeAlerts(ctx);
  const byArea = {};
  alerts.forEach((a) => { byArea[a.area] = (byArea[a.area] || 0) + 1; });
  return {
    kafedra: ctx.settings.name,
    bugun: `${ctx.today} (${weekdayName(ctx.today)})`,
    oquv_yili: ctx.settings.year,
    semestr: currentSemester(ctx),
    oqituvchilar: s.teachers,
    stavkalar: s.rates,
    talabalar: s.students,
    guruhlar: s.groups,
    kafedra_fanlari: s.subjects,
    kpi_joriy_oy: { oy: fmtMonth(s.month), ball_foiz: s.kpi.score, bandlar: s.kpi.total, bajarildi: s.kpi.done, bajarilmadi: s.kpi.failed, xavf_ostida: s.kpi.risk },
    dars_bajarilishi: { otilgan: s.load.done, bugungacha_kutilgan: s.load.expected, foiz: s.load.pct },
    maqolalar: { yillik_reja: s.pubs.plan, bajarilgan: s.pubs.ok, ortda_qolgan_oqituvchilar: s.pubs.behind, muddati_otgan_ishlar: s.pubs.overdue },
    loyihalar: { faol: s.projects.active, mablag_mln_som: s.projects.funding },
    yuklama: { jami_soat: s.workload.total, taqsimlanmagan_soat: s.workload.unassigned, kerakli_stavka: s.workload.needRates },
    ozlashtirish: { foiz: s.grades.pass, sifat: s.grades.quality, qarzdorlar: s.grades.debtors },
    bugungi_davomat: s.attendance ? { keldi: s.attendance.present, kechikdi: s.attendance.late, kelmagan: s.attendance.absent, sababli: s.attendance.excused, jami: s.attendance.total } : 'bugun ish kuni emas',
    muammolar: { jami: alerts.length, jiddiy: alerts.filter((a) => a.sev === 'bad').length, sohalar: byArea },
  };
}

function oqituvchilar(ctx, { ism, saralash } = {}) {
  if (ism) {
    const list = findTeachers(ctx, ism);
    if (!list.length) return noTeacher(ctx, ism);
    const ym = ctx.today.slice(0, 7);
    return {
      profillar: list.slice(0, 3).map((t) => {
        const s = teacherStats(ctx, t);
        const a = attMonthStats(ctx, ym, t.id);
        const today = attStatus(ctx, ctx.today, t.id);
        return {
          id: t.id,
          ism: t.name,
          lavozim: t.position,
          daraja: t.degree,
          stavka: num(t.rate),
          yuklama: { yillik_soat: s.plan, meyor: s.norm, holat: s.loadState === 'over' ? "me'yordan ortiq" : s.loadState === 'under' ? "me'yordan kam" : "me'yorda", otilgan: s.done, bugungacha_kutilgan: s.expected },
          maqola: { yillik_reja: s.pubPlan, chop_etilgan: s.published, qabul_qilingan: s.accepted, yuborilgan: s.submitted, bugungacha_kutilgan: s.expectedPubs, ortda: s.pubBehind },
          fanlar: table(['fan', 'turi', 'semestr', 'reja', 'otilgan', 'holat'], ctx.subjects.filter((x) => x.teacherId === t.id).map((x) => [x.name, x.kind, x.semester, num(x.planHours), num(x.doneHours), subjState(ctx, x).label]), 15),
          ilmiy_ishlar: table(['mavzu', 'turi', 'holat', 'muddat', 'ichki_id'], ctx.pubs.filter((p) => p.teacherId === t.id).map((p) => [p.title, p.type, pubLate(ctx, p) ? `${p.status} (muddati o'tgan)` : p.status, D(p.deadline), p.id])),
          loyihalar: ctx.projects.filter((p) => p.leaderId === t.id || (p.members || []).includes(t.id)).map((p) => `${p.title} — ${p.leaderId === t.id ? 'rahbar' : 'ijrochi'}, ${num(p.progress)}%`),
          talabalar_bilan_ish: ctx.stwork.filter((x) => x.teacherId === t.id).map((x) => `${x.kind}: ${x.topic} (${stLate(ctx, x) ? 'kechikkan' : x.status})`),
          kpi_masul: kpiOfMonth(ctx).filter((k) => k.responsibleId === t.id).map((k) => `${k.code} ${k.title}: ${num(k.actual)}/${num(k.target)} — ${kpiStatus(ctx, k).label}`),
          davomat_joriy_oy: { ish_kunlari: a.work, kelgan: a.present, kechikishlar: a.late, kechikish_daqiqa: a.lateMin, sababli: a.excused, sababsiz: a.absent },
          bugun: `${today.label}${today.r.in ? ` (${today.r.in})` : ''}`,
          reyting_bali: s.score,
        };
      }),
    };
  }
  const rows = ctx.teachers.map((t) => ({ t, s: teacherStats(ctx, t) }));
  const sorters = {
    reyting: (a, b) => b.s.score - a.s.score,
    yuklama: (a, b) => b.s.plan - a.s.plan,
    ortda: (a, b) => b.s.overdue.length - a.s.overdue.length || a.s.loadPace - b.s.loadPace,
  };
  rows.sort(sorters[saralash] || ((a, b) => a.t.name.localeCompare(b.t.name)));
  return {
    reyting_formulasi: "chop etilgan maqolalar (Scopus/WoS 10, OAK 5, konferensiya 2-3) + loyihalar + talabalar bilan ish + dars intizomi − muddati o'tgan ishlar",
    ...table(
      ['ism', 'lavozim', 'stavka', 'yuklama/meyor', 'yuklama_holati', 'dars_otilgan/kutilgan', 'maqola_bajarilgan/reja', 'muddati_otgan_maqola', 'loyiha(rahbar/ijrochi)', 'reyting', 'ichki_id'],
      rows.map(({ t, s }) => [shortName(t.name), t.position, num(t.rate), `${s.plan}/${s.norm}`, s.loadState === 'over' ? 'ortiq' : s.loadState === 'under' ? 'kam' : "me'yorda", `${s.done}/${s.expected}`, `${s.published + s.accepted}/${s.pubPlan}`, s.overdue.length, `${s.lead}/${s.member}`, s.score, t.id]),
    ),
  };
}

function yuklama_taqsimoti(ctx, { oqituvchi } = {}) {
  if (!ctx.plans.length || !allocItems(ctx).length) return { xato: "Ish rejalar yuklanmagan yoki yuklama hali taqsimlanmagan" };
  const s = wlSummary(ctx);
  const head = { jami_soat: R(s.total), kuzgi_semestr: R(s.h1), bahorgi_semestr: R(s.h2), taqsimlanmagan_soat: R(s.unassigned), kerakli_stavka: +(s.total / avgNorm(ctx)).toFixed(2), mavjud_stavka: ctx.teachers.reduce((a, t) => a + num(t.rate || 1), 0), qayta_hisoblash_kerak: allocStale(ctx) || undefined };
  if (oqituvchi) {
    const ids = teacherIdsOf(ctx, oqituvchi);
    if (!ids.size) return noTeacher(ctx, oqituvchi);
    return {
      ...head,
      oqituvchilar: s.rows.filter((r) => ids.has(r.t.id)).map((r) => ({
        ism: r.t.name, lavozim: r.t.position, meyor: r.norm, jami: R(r.total), foiz: r.norm ? R((r.total / r.norm) * 100) : 0, maruza: R(r.M), amaliy: R(r.A), laboratoriya: R(r.L), seminar: R(r.S), kurs_ishi: R(r.KI), kuzgi: R(r.h1), bahorgi: R(r.h2),
        mashgulotlar: table(['fan', 'turi', 'guruh', 'semestr', 'soat'], allocItems(ctx).filter((i) => i.teacherId === r.t.id).map((i) => [i.name, LC_KIND[i.kind], i.group, i.sem, i.hours]), 30),
      })),
    };
  }
  const un = new Map();
  allocItems(ctx).filter((i) => !i.teacherId).forEach((i) => {
    const k = `${i.name}|${i.kind}`;
    const e = un.get(k) || { fan: i.name, turi: LC_KIND[i.kind], soat: 0, n: 0 };
    e.soat += i.hours;
    e.n += 1;
    un.set(k, e);
  });
  return {
    ...head,
    oqituvchilar: table(['ism', 'lavozim', 'stavka', 'meyor', 'maruza', 'amaliy', 'lab', 'seminar', 'kurs_ishi', 'kuzgi', 'bahorgi', 'jami', 'foiz'], s.rows.map((r) => [shortName(r.t.name), r.t.position, num(r.t.rate), r.norm, R(r.M), R(r.A), R(r.L), R(r.S), R(r.KI), R(r.h1), R(r.h2), R(r.total), r.norm ? R((r.total / r.norm) * 100) : 0])),
    taqsimlanmagan: table(['fan', 'turi', 'soat', 'birliklar'], [...un.values()].map((e) => [e.fan, e.turi, R(e.soat), e.n])),
  };
}

function semMatch(sem, filter) {
  if (!filter) return true;
  const f = String(filter).toLowerCase();
  if (/kuz/.test(f)) return +sem % 2 === 1;
  if (/bahor/.test(f)) return +sem % 2 === 0;
  return String(sem) === f.replace(/\D/g, '');
}

function oquv_reja(ctx, { kurs, semestr, fan } = {}) {
  const plans = activePlans(ctx).filter((p) => !kurs || +p.kurs === +kurs);
  if (!plans.length) return { xato: kurs ? `${kurs}-kurs uchun faol ish reja yo'q` : "Faol ish reja yo'q", mavjud_kurslar: [...new Set(activePlans(ctx).map((p) => p.kurs))].sort() };
  const teachersOf = new Map();
  allocItems(ctx).forEach((i) => {
    if (!i.teacherId) return;
    const k = `${i.planId}|${i.name}`;
    if (!teachersOf.has(k)) teachersOf.set(k, new Set());
    teachersOf.get(k).add(tshort(ctx, i.teacherId));
  });
  if (fan) {
    const n = norm(fan);
    const rows = [];
    for (const p of plans) {
      for (const s of p.subjects || []) {
        if (!norm(s.name).includes(n)) continue;
        for (const [sem, h] of Object.entries(s.sem)) {
          if (!semMatch(sem, semestr)) continue;
          rows.push([s.name, lcPlanLabel(p), `${sem}-sem`, `M${h[0]}/A${h[1]}/L${h[2]}/S${h[3]}`, lcIsOurs(s.name, ctx.loadcfg) ? 'ha' : "yo'q", [...(teachersOf.get(`${p.id}|${s.name}`) || [])].join(', ') || '—']);
        }
      }
    }
    const un = allocItems(ctx).filter((i) => !i.teacherId && norm(i.name).includes(n)).reduce((a, i) => a + i.hours, 0);
    return { ...table(['fan', 'ish_reja', 'semestr', 'soatlar_maruza/amaliy/lab/seminar', 'kafedra_fani', 'oqituvchilar'], rows), taqsimlanmagan_soat: R(un) };
  }
  return {
    izoh: "1,3,5,7-semestrlar kuzgi; 2,4,6,8 bahorgi. Soatlar bitta guruh uchun (M/A/L/S).",
    rejalar: plans.map((p) => ({
      reja: lcPlanLabel(p),
      yonalish: `${p.specCode} ${p.specName}`,
      guruhlar: lcGroups(p).join(', '),
      talaba_guruhda: num(p.students),
      fanlar: table(['fan', 'semestr', 'soatlar', 'kafedra_fani', 'oqituvchilar'], (p.subjects || []).flatMap((s) => Object.entries(s.sem).filter(([sem]) => semMatch(sem, semestr)).map(([sem, h]) => [s.name, sem, `M${h[0]}/A${h[1]}/L${h[2]}/S${h[3]}`, lcIsOurs(s.name, ctx.loadcfg) ? 'ha' : "yo'q", [...(teachersOf.get(`${p.id}|${s.name}`) || [])].join(', ') || '—'])), 25),
    })).slice(0, 6),
  };
}

function dars_bajarilishi(ctx, { oqituvchi, faqat_ortda, semestr } = {}) {
  const sem = semestr ? String(semestr).replace(/\D/g, '') || currentSemester(ctx) : currentSemester(ctx);
  let list = ctx.subjects.filter((s) => String(s.semester || '1') === sem);
  if (oqituvchi) {
    const ids = teacherIdsOf(ctx, oqituvchi);
    if (!ids.size) return noTeacher(ctx, oqituvchi);
    list = list.filter((s) => ids.has(s.teacherId));
  }
  const rows = list.map((s) => ({ s, st: subjState(ctx, s) }));
  const filtered = faqat_ortda ? rows.filter((x) => x.st.cls === 'bad' || x.st.cls === 'warn') : rows;
  filtered.sort((a, b) => num(a.s.doneHours) / Math.max(1, a.st.exp) - num(b.s.doneHours) / Math.max(1, b.st.exp));
  return {
    semestr: sem,
    jami: { reja: list.reduce((a, s) => a + num(s.planHours), 0), otilgan: list.reduce((a, s) => a + num(s.doneHours), 0), kutilgan: R(rows.reduce((a, x) => a + x.st.exp, 0)) },
    ...table(['fan', 'oqituvchi', 'turi', 'reja', 'otilgan', 'kutilgan', 'holat'], filtered.map(({ s, st }) => [s.name, tshort(ctx, s.teacherId), s.kind, num(s.planHours), num(s.doneHours), R(st.exp), st.label]), 35),
  };
}

const KPI_FILTER = { bajarilmadi: 'failed', xavf: 'risk', bajarildi: 'done', jarayonda: 'progress' };

function kpi(ctx, { oy, holat } = {}) {
  const ym = /^\d{4}-\d{2}$/.test(oy || '') ? oy : ctx.today.slice(0, 7);
  const list = kpiOfMonth(ctx, ym).sort((a, b) => String(a.code).localeCompare(String(b.code), undefined, { numeric: true }));
  if (!list.length) return { oy: ym, xato: `${fmtMonth(ym)} uchun KPI bandlari kiritilmagan`, mavjud_oylar: [...new Set(ctx.kpi.map((k) => k.period))].sort() };
  const want = KPI_FILTER[holat];
  const rows = list.filter((k) => !want || kpiStatus(ctx, k).key === want);
  return {
    oy: fmtMonth(ym),
    umumiy_bajarilish_foiz: kpiScore(list),
    holatlar: { jami: list.length, bajarildi: list.filter((k) => kpiStatus(ctx, k).key === 'done').length, bajarilmadi: list.filter((k) => kpiStatus(ctx, k).key === 'failed').length, xavf_ostida: list.filter((k) => kpiStatus(ctx, k).key === 'risk').length, jarayonda: list.filter((k) => kpiStatus(ctx, k).key === 'progress').length },
    yonalishlar: kpiByCategory(ctx, list).map((c) => `${c.c}: ${c.score}%`),
    ...table(['band', 'korsatkich', 'masul', 'reja', 'fakt', 'birlik', 'muddat', 'vazn', 'holat', 'ichki_id'], rows.map((k) => [k.code, k.title, tshort(ctx, k.responsibleId), num(k.target), num(k.actual), k.unit, D(k.deadline), num(k.weight), kpiStatus(ctx, k).label, k.id])),
  };
}

function ilmiy_ishlar(ctx, { oqituvchi, holat, turi, faqat_muammoli } = {}) {
  let list = ctx.pubs.slice();
  if (oqituvchi) {
    const ids = teacherIdsOf(ctx, oqituvchi);
    if (!ids.size) return noTeacher(ctx, oqituvchi);
    list = list.filter((p) => ids.has(p.teacherId));
  }
  if (holat) list = list.filter((p) => norm(p.status) === norm(holat));
  if (turi) list = list.filter((p) => norm(p.type).includes(norm(turi)));
  if (faqat_muammoli) list = list.filter((p) => pubLate(ctx, p) || pubSoon(ctx, p));
  const plan = ctx.teachers.map((t) => ({ t, s: teacherStats(ctx, t) })).filter((x) => !faqat_muammoli || x.s.pubBehind);
  // Tayyor sanoq: "Scopus'da nechta CHOP ETILGAN" kabi savolga model o'zi sanamasin
  const byType = {};
  ctx.pubs.forEach((p) => {
    byType[p.type] = byType[p.type] || {};
    byType[p.type][p.status] = (byType[p.type][p.status] || 0) + 1;
  });
  return {
    holatlar: Object.fromEntries(PUB_STATUS.map((s) => [s, ctx.pubs.filter((p) => p.status === s).length])),
    tur_va_holat_boyicha_soni: byType,
    ...(!list.length && (holat || turi) ? { izoh: `Filtr bo'yicha ish topilmadi. Mavjud holatlar: ${PUB_STATUS.join(', ')}; turlar: ${Object.keys(byType).join(', ')}` } : {}),
    ishlar: table(['mavzu', 'muallif', 'turi', 'jurnal', 'kvartil', 'holat', 'muddat', 'chop_sanasi', 'muammo', 'ichki_id'], list.map((p) => [p.title, tshort(ctx, p.teacherId), p.type, p.journal || '', p.quartile && p.quartile !== '—' ? p.quartile : '', p.status, D(p.deadline), D(p.pubDate), pubLate(ctx, p) ? `muddati ${daysBetween(p.deadline, ctx.today)} kun o'tgan` : pubSoon(ctx, p) ? `${daysBetween(ctx.today, p.deadline)} kun qoldi` : '', p.id])),
    yillik_reja_bajarilishi: table(['oqituvchi', 'reja', 'bajarilgan', 'bugungacha_kutilgan', 'muddati_otgan', 'ortda'], plan.map(({ t, s }) => [shortName(t.name), s.pubPlan, s.published + s.accepted, s.expectedPubs, s.overdue.length, s.pubBehind ? 'ha' : "yo'q"])),
  };
}

function loyihalar(ctx, { holat, turi } = {}) {
  let list = ctx.projects.filter((p) => (!holat || norm(p.status) === norm(holat)) && (!turi || norm(p.type).includes(norm(turi))));
  let izoh;
  if (!list.length && (holat || turi)) {
    izoh = `Filtr bo'yicha loyiha topilmadi — barcha loyihalar ko'rsatildi. Holatlar: ${PROJ_STATUS.join(', ')}; turlar: ${[...new Set(ctx.projects.map((p) => p.type))].join(', ')}`;
    list = ctx.projects;
  }
  return {
    ...(izoh ? { izoh } : {}),
    faol_mablag_mln_som: ctx.projects.filter((p) => p.status === 'Jarayonda').reduce((a, p) => a + num(p.funding), 0),
    ...table(['nomi', 'turi', 'rahbar', 'ijrochilar', 'mablag_mln', 'holat', 'boshlanish', 'tugash', 'qolgan_kun', 'bajarilish_foiz', 'xavf', 'ichki_id'], list.map((p) => {
      const d = p.end ? daysBetween(ctx.today, p.end) : null;
      const risk = p.status === 'Jarayonda' && d != null && (d < 0 || (d <= 60 && num(p.progress) < 80));
      return [p.title, p.type, tshort(ctx, p.leaderId), (p.members || []).map((id) => tshort(ctx, id)).join(', '), num(p.funding), p.status, D(p.start), D(p.end), d, num(p.progress), risk ? 'ha' : "yo'q", p.id];
    })),
  };
}

function talabalar_bilan_ish(ctx, { turi, faqat_kechikkan } = {}) {
  let list = ctx.stwork.slice();
  if (turi) list = list.filter((s) => norm(s.kind).includes(norm(turi)));
  if (faqat_kechikkan) list = list.filter((s) => stLate(ctx, s));
  if (!list.length && turi) return { izoh: `«${turi}» turida ish topilmadi. Mavjud turlar: ${[...new Set(ctx.stwork.map((s) => s.kind))].join(', ')}` };
  return table(['turi', 'mavzu', 'talaba', 'rahbar', 'muddat', 'holat', 'ichki_id'], list.map((s) => [s.kind, s.topic, s.student, tshort(ctx, s.teacherId), D(s.deadline), stLate(ctx, s) ? 'kechikkan' : s.status, s.id]));
}

function davomat(ctx, { sana, oy, oqituvchi } = {}) {
  let ids = null;
  if (oqituvchi) {
    ids = teacherIdsOf(ctx, oqituvchi);
    if (!ids.size) return noTeacher(ctx, oqituvchi);
  }
  const teachers = ctx.teachers.filter((t) => !ids || ids.has(t.id));
  let day = sana;
  if (day && /bugun/i.test(day)) day = ctx.today;
  if (day && /kecha/i.test(day)) day = addDays(ctx.today, -1);
  if (day && isISO(day)) {
    if (!isWorkday(ctx.settings, day)) return { sana: day, izoh: `${weekdayName(day)} — ish kuni emas` };
    const rows = teachers.map((t) => ({ t, s: attStatus(ctx, day, t.id) }));
    const cnt = (k) => rows.filter((x) => x.s.key === k).length;
    return {
      sana: `${day} (${weekdayName(day)})`,
      ish_vaqti: `${ctx.settings.workStart || '08:30'}–${ctx.settings.workEnd || '17:00'}, kechikish chegarasi ${ctx.settings.graceMin ?? 10} daqiqa`,
      hozirgi_vaqt: day === ctx.today ? ctx.now : undefined,
      jami: { keldi: cnt('present') + cnt('late'), kechikdi: cnt('late'), kelmagan: cnt('absent'), sababli: cnt('excused'), kutilmoqda: cnt('waiting') },
      ...table(['ism', 'holat', 'keldi', 'ketdi', 'sabab'], rows.map(({ t, s }) => [shortName(t.name), s.label, s.r.in || '', s.r.out || '', s.r.reason || ''])),
    };
  }
  const ym = /^\d{4}-\d{2}$/.test(oy || '') ? oy : ctx.today.slice(0, 7);
  return {
    oy: fmtMonth(ym),
    belgilar: ids ? '+ keldi, K kechikdi, × kelmadi, B kasallik, X safar, T ta\'til, M malaka oshirish, · dam olish' : undefined,
    ...table(['ism', 'ish_kunlari', 'kelgan', 'kechikish', 'kechikish_daq', 'sababli', 'sababsiz', 'ishlagan_soat', ...(ids ? ['kunlar'] : [])], teachers.map((t) => {
      const s = attMonthStats(ctx, ym, t.id);
      const row = [shortName(t.name), s.work, s.present, s.late, s.lateMin, s.excused, s.absent, R(s.min / 60)];
      if (ids) row.push(monthDays(ym).filter((d) => d <= ctx.today).map((d) => attCode(ctx, d, t.id) || '·').join(''));
      return row;
    })),
  };
}

function ozlashtirish(ctx, { guruh, fan, kurs, qarzdorlar } = {}) {
  if (!ctx.grades.length) return { xato: "O'zlashtirish ma'lumotlari kiritilmagan" };
  const t = gradesTotal(ctx);
  const g = norm(guruh);
  const f = norm(fan);
  const bySubj = gradesBySubject(ctx).filter((x) => !f || norm(x.subject).includes(f));
  const byGroup = gradesByGroup(ctx).filter((x) => (!g || norm(x.group).includes(g)) && (!kurs || +x.kurs === +kurs));
  const cont = contingent(ctx);
  const out = {
    kafedra_kontingenti: { jami_talabalar: cont.students, jami_guruhlar: cont.groups },
    sessiya: ctx.grades[0]?.session,
    izoh: "o'zlashtirish = 3 va undan yuqori baho olganlar ulushi; sifat = 4 va 5 olganlar ulushi; me'yor 80%",
    umumiy: { ozlashtirish_foiz: t.pass, sifat_foiz: t.quality, ortacha_baho: t.avg, qarzdorlar: t.f },
    fanlar: table(['fan', 'oqituvchi', 'guruhlar', 'ozlashtirish_foiz', 'sifat_foiz', 'qarzdorlar'], bySubj.map((x) => [x.subject, x.teacherIds.map((id) => tshort(ctx, id)).join(', '), x.groups, x.pass, x.quality, x.f])),
    guruhlar: table(['guruh', 'kurs', 'talabalar', 'ozlashtirish_foiz', 'sifat_foiz', 'qarzdorlar'], byGroup.map((x) => [x.group, x.kurs, x.students, x.pass, x.quality, x.f]), 30),
  };
  if (g && f) {
    out.qaydnomalar = ctx.grades.filter((x) => norm(x.group).includes(g) && norm(x.subject).includes(f)).map((x) => ({ guruh: x.group, fan: x.subject, ...gradeRow(x), baholar: { alo: x.a, yaxshi: x.b, qoniqarli: x.c, qoniqarsiz: x.f } }));
  }
  if (qarzdorlar || g || f) {
    const list = debtors(ctx).filter((d) => (!g || norm(d.group).includes(g)) && (!f || norm(d.subject).includes(f)) && (!kurs || +d.kurs === +kurs));
    out.qarzdorlar = table(['talaba', 'guruh', 'fan', 'qayta_topshirish'], list.map((d) => [d.name, d.group, d.subject, D(d.deadline)]), 40);
  }
  return out;
}

function muddatlar(ctx, { kun = 30 } = {}) {
  const list = deadlines(ctx, Math.min(120, Math.max(1, +kun || 30)));
  return table(['sana', 'qolgan_kun', 'soha', 'nomi', 'masul', 'holat'], list.map((d) => [D(d.date), d.left, d.area, d.title, d.who ? tshort(ctx, d.who) : '', d.overdue ? "o'tib ketgan" : 'yaqin']), 40);
}

function ogohlantirishlar(ctx) {
  const a = computeAlerts(ctx);
  return table(['daraja', 'soha', 'matn'], a.map((x) => [x.sev === 'bad' ? 'jiddiy' : 'diqqat', x.area, x.text]), 25);
}

/* ---------------- ta'riflar ---------------- */

// Ixtiyoriy parametr null ham bo'lishi mumkin: model ba'zan {"oqituvchi": null} yuboradi va
// Groq sxemani qat'iy tekshirib, butun so'rovni rad etardi (2026-09-30 o'lchovida topilgan).
const nullable = (prop) => (typeof prop.type === 'string' && prop.type !== 'object' ? { ...prop, type: [prop.type, 'null'] } : prop);
const P = (props = {}, required) => ({
  type: 'object',
  properties: Object.fromEntries(Object.entries(props).map(([k, v]) => [k, (required || []).includes(k) ? v : nullable(v)])),
  ...(required ? { required } : {}),
});
const S = (description, extra = {}) => ({ type: 'string', description, ...extra });
const EDITABLE = ['teachers', 'subjects', 'pubs', 'projects', 'stwork', 'kpi'];

export const TOOLS = {
  kafedra_holati: { run: kafedra_holati, label: 'Kafedra holati', def: { description: "Kafedraning umumiy holati: o'qituvchilar, talabalar, KPI, dars, maqola, loyiha, yuklama, o'zlashtirish, bugungi davomat va muammolar soni.", parameters: P() } },
  oqituvchilar: { run: oqituvchilar, label: "O'qituvchilar", def: { description: "O'qituvchilar ro'yxati va ko'rsatkichlari (yuklama, dars, maqola, reyting). ism berilsa — o'sha o'qituvchining to'liq profili.", parameters: P({ ism: S('Familiya yoki ism'), saralash: S('Tartib', { enum: ['reyting', 'yuklama', 'ortda'] }) }) } },
  yuklama_taqsimoti: { run: yuklama_taqsimoti, label: 'Yuklama taqsimoti', def: { description: "Ish rejalardan hisoblangan yillik o'quv yuklama taqsimoti: har o'qituvchiga necha soat (ma'ruza/amaliy/lab/kurs ishi, kuzgi/bahorgi), me'yor va taqsimlanmagan soatlar.", parameters: P({ oqituvchi: S("O'qituvchi familiyasi (ixtiyoriy)") }) } },
  oquv_reja: { run: oquv_reja, label: "O'quv reja", def: { description: "Ishchi o'quv rejalar: kurs va semestr bo'yicha fanlar, soatlar, kafedra fanlari va ularni kim o'qiydi.", parameters: P({ kurs: { type: 'integer', description: '1-4' }, semestr: S("1-8 yoki 'kuzgi'/'bahorgi'"), fan: S('Fan nomi (qismi)') }) } },
  dars_bajarilishi: { run: dars_bajarilishi, label: 'Dars bajarilishi', def: { description: "Fanlar bo'yicha o'tilgan va bugungacha kutilgan dars soatlari (joriy semestr).", parameters: P({ oqituvchi: S('Familiya'), faqat_ortda: { type: 'boolean' }, semestr: S("'1' yoki '2'") }) } },
  kpi: { run: kpi, label: 'KPI', def: { description: "KPI bandlari: reja, fakt, holat, mas'ul, yo'nalishlar va vaznli umumiy bajarilish.", parameters: P({ oy: S('YYYY-MM (sukut: joriy oy)'), holat: S('Filtr', { enum: ['hammasi', 'bajarilmadi', 'xavf', 'jarayonda', 'bajarildi'] }) }) } },
  ilmiy_ishlar: { run: ilmiy_ishlar, label: 'Ilmiy ishlar', def: { description: "Maqolalar va ilmiy ishlar ro'yxati hamda har o'qituvchining yillik maqola rejasi bajarilishi.", parameters: P({ oqituvchi: S('Familiya'), holat: S('Holat', { enum: PUB_STATUS }), turi: S('Masalan Scopus, OAK'), faqat_muammoli: { type: 'boolean', description: 'faqat muddati o\'tgan/yaqin va ortda qolganlar' } }) } },
  loyihalar: { run: loyihalar, label: 'Loyihalar', def: { description: "Loyihalar va grantlar: turi, rahbar, mablag', muddat, bajarilish, xavf.", parameters: P({ holat: S('Holat', { enum: PROJ_STATUS }), turi: S("Masalan 'Xalqaro grant', 'Davlat granti', 'Startap'") }) } },
  talabalar_bilan_ish: { run: talabalar_bilan_ish, label: 'Talabalar bilan ish', def: { description: "BMI, magistrlik, kurs ishi, olimpiada, to'garak, talaba maqolalari.", parameters: P({ turi: S('Ish turi'), faqat_kechikkan: { type: 'boolean' } }) } },
  davomat: { run: davomat, label: 'Davomat', def: { description: "O'qituvchilar davomati. sana berilsa — o'sha kun (keldi/kechikdi/kelmadi), aks holda oylik statistika.", parameters: P({ sana: S("YYYY-MM-DD, 'bugun' yoki 'kecha'"), oy: S('YYYY-MM'), oqituvchi: S('Familiya') }) } },
  ozlashtirish: { run: ozlashtirish, label: "O'zlashtirish", def: { description: "Talabalar o'zlashtirishi (oxirgi sessiya): fan va guruh kesimida o'zlashtirish, sifat, akademik qarzdorlar.", parameters: P({ guruh: S('Guruh nomi'), fan: S('Fan nomi'), kurs: { type: 'integer' }, qarzdorlar: { type: 'boolean', description: "qarzdorlar ro'yxati kerakmi" } }) } },
  muddatlar: { run: muddatlar, label: 'Muddatlar', def: { description: "Yaqinlashayotgan va o'tib ketgan muddatlar: maqola, loyiha, KPI, talabalar ishi, qayta topshirish.", parameters: P({ kun: { type: 'integer', description: 'necha kun oldinga (sukut 30)' } }) } },
  ogohlantirishlar: { run: ogohlantirishlar, label: 'Ogohlantirishlar', def: { description: "Tizim avtomatik aniqlagan barcha muammolar (jiddiy/diqqat).", parameters: P() } },
  taklif_ozgartirish: {
    label: "O'zgartirish taklifi",
    proposal: 'update',
    def: { description: "Mavjud yozuvni o'zgartirishni TAKLIF qiladi (foydalanuvchi tasdiqlaydi). id — boshqa vosita natijasidagi 'ichki_id' qiymati.", parameters: P({ bolim: S("Bo'lim", { enum: EDITABLE }), id: S('Yozuv id'), ozgarishlar: { type: 'object', description: 'maydon: yangi qiymat' }, izoh: S('Qisqa tavsif') }, ['bolim', 'id', 'ozgarishlar', 'izoh']) },
  },
  taklif_yangi: {
    label: 'Yangi yozuv taklifi',
    proposal: 'create',
    def: { description: "Yangi yozuv qo'shishni TAKLIF qiladi (foydalanuvchi tasdiqlaydi).", parameters: P({ bolim: S("Bo'lim", { enum: EDITABLE }), malumot: { type: 'object', description: 'maydonlar' }, izoh: S('Qisqa tavsif') }, ['bolim', 'malumot', 'izoh']) },
  },
};

export const READ_TOOLS = Object.keys(TOOLS).filter((k) => !TOOLS[k].proposal);

export function toolDefs(names) {
  return names.map((name) => ({ type: 'function', function: { name, ...TOOLS[name].def } }));
}

// Taklif: faqat sxemadagi maydonlar, o'qituvchi ismi bo'lsa id ga aylantiriladi
export function buildProposal(ctx, name, args) {
  const kind = TOOLS[name]?.proposal;
  const coll = String(args.bolim || '');
  if (!SCHEMA[coll] || !EDITABLE.includes(coll)) throw new Error("Noma'lum bo'lim");
  const fields = SCHEMA[coll].fields;
  const clean = {};
  for (const [k, v] of Object.entries((kind === 'update' ? args.ozgarishlar : args.malumot) || {})) {
    const f = fields.find((x) => x.k === k);
    if (!f) continue;
    if (f.t === 'teacher' && v && !ctx.tById.has(v)) {
      const m = findTeachers(ctx, String(v));
      if (m.length === 1) clean[k] = m[0].id;
      continue;
    }
    if (f.t === 'number') clean[k] = num(v);
    else if (f.t === 'select' && f.o && !f.o.includes(v)) continue;
    else clean[k] = v;
  }
  if (!Object.keys(clean).length) throw new Error("To'g'ri maydon topilmadi. Maydonlar: " + fields.map((f) => f.k).join(', '));
  if (kind === 'update') {
    const doc = ctx[coll].find((d) => d.id === String(args.id));
    if (!doc) throw new Error(`${TITLES[coll]} bo'limida «${args.id}» id li yozuv yo'q`);
    return { kind, coll, id: doc.id, target: doc.title || doc.name || doc.topic || doc.id, changes: clean, summary: String(args.izoh || '') };
  }
  const miss = fields.find((f) => f.req && !clean[f.k]);
  if (miss) throw new Error(`Majburiy maydon yo'q: ${miss.k}`);
  return { kind, coll, data: clean, summary: String(args.izoh || '') };
}

export function runTool(ctx, name, args, hooks = {}) {
  const tool = TOOLS[name];
  if (!tool) return { xato: `Noma'lum vosita: ${name}` };
  try {
    if (tool.proposal) {
      const p = buildProposal(ctx, name, args || {});
      hooks.onProposal?.(p);
      return { natija: 'Taklif foydalanuvchiga tasdiqlash uchun ko\'rsatildi. U hali SAQLANMAGAN.' };
    }
    return tool.run(ctx, args || {});
  } catch (e) {
    return { xato: String(e?.message || e) };
  }
}

export function summarizeArgs(args) {
  const parts = Object.entries(args || {}).filter(([, v]) => v !== undefined && v !== '' && v !== false).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
  return parts.join(', ');
}
