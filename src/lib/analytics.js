// Kafedra tahlili: o'qituvchi ko'rsatkichlari, KPI holati, ogohlantirishlar,
// muddatlar. Hammasi sof funksiya — UI ham, AI vositalari ham, testlar ham
// aynan shu hisobdan foydalanadi (raqam bitta joyda tug'iladi).
import { KPI_CATS, PUB_W } from './constants.js';
import { addDays, daysBetween, fmtMonth, fmtShort } from './dates.js';
import { clamp, num, pct, shortName } from './format.js';
import { attAlerts, attTodaySummary, isWorkday } from './attendance.js';
import { contingent, gradeAlerts, gradesTotal } from './grades.js';
import { allocItems, allocStale, avgNorm, normsOf, wlSummary } from './workload.js';

export function makeCtx(state, clock) {
  const cache = new Map();
  const ctx = {
    ...state,
    today: clock.today,
    now: clock.now,
    memo(key, fn) {
      if (!cache.has(key)) cache.set(key, fn());
      return cache.get(key);
    },
  };
  ctx.tById = new Map(state.teachers.map((t) => [t.id, t]));
  return ctx;
}

export const tname = (ctx, id) => ctx.tById.get(id)?.name || '—';
export const tshort = (ctx, id) => shortName(tname(ctx, id));

export function yearRange(ctx) {
  const y = parseInt(String(ctx.settings.year || '').slice(0, 4), 10) || new Date().getFullYear();
  return [`${y}-09-01`, `${y + 1}-06-30`];
}

export function semFrac(ctx, sem) {
  const s = ctx.settings;
  const [a, b] = String(sem) === '2' ? [s.sem2Start, s.sem2End] : [s.sem1Start, s.sem1End];
  if (!a || !b) return 0;
  return clamp(daysBetween(a, ctx.today) / Math.max(1, daysBetween(a, b)), 0, 1);
}

export function yearFrac(ctx) {
  const [a, b] = yearRange(ctx);
  return clamp(daysBetween(a, ctx.today) / Math.max(1, daysBetween(a, b)), 0, 1);
}

export function currentSemester(ctx) {
  return ctx.today >= (ctx.settings.sem2Start || '9999') ? '2' : '1';
}

export const pubLate = (ctx, p) => (p.status === 'Reja' || p.status === 'Yozilmoqda') && !!p.deadline && p.deadline < ctx.today;
export const pubSoon = (ctx, p) => (p.status === 'Reja' || p.status === 'Yozilmoqda') && !!p.deadline && p.deadline >= ctx.today && daysBetween(ctx.today, p.deadline) <= 21;
export const stLate = (ctx, s) => s.status !== 'Yakunlandi' && !!s.deadline && s.deadline < ctx.today;

export function teacherStats(ctx, t) {
  return ctx.memo(`ts:${t.id}`, () => {
    const subs = ctx.subjects.filter((s) => s.teacherId === t.id);
    const plan = subs.reduce((a, s) => a + num(s.planHours), 0);
    const done = subs.reduce((a, s) => a + num(s.doneHours), 0);
    const expected = Math.round(subs.reduce((a, s) => a + num(s.planHours) * semFrac(ctx, s.semester), 0));
    const norm = Math.round((normsOf(ctx.settings)[t.position] || 600) * (num(t.rate) || 1));
    const [ys] = yearRange(ctx);
    const pubs = ctx.pubs.filter((p) => p.teacherId === t.id);
    const published = pubs.filter((p) => p.status === 'Chop etilgan' && (!p.pubDate || p.pubDate >= ys)).length;
    const accepted = pubs.filter((p) => p.status === 'Qabul qilingan').length;
    const submitted = pubs.filter((p) => p.status === 'Yuborilgan').length;
    const overdue = pubs.filter((p) => pubLate(ctx, p));
    const pubPlan = num(t.pubPlan);
    const expectedPubs = Math.floor(pubPlan * yearFrac(ctx));
    const pubBehind = overdue.length > 0 || published + accepted < expectedPubs;
    const lead = ctx.projects.filter((p) => p.leaderId === t.id && p.status !== "To'xtatilgan").length;
    const member = ctx.projects.filter((p) => (p.members || []).includes(t.id) && p.leaderId !== t.id).length;
    const st = ctx.stwork.filter((s) => s.teacherId === t.id);
    const stDone = st.filter((s) => s.status === 'Yakunlandi').length;
    const stLateN = st.filter((s) => stLate(ctx, s)).length;
    let score = 0;
    pubs.forEach((p) => {
      const w = PUB_W[p.type] || 2;
      if (p.status === 'Chop etilgan') score += w;
      else if (p.status === 'Qabul qilingan') score += w * 0.7;
      else if (p.status === 'Yuborilgan') score += w * 0.3;
    });
    score += lead * 6 + member * 3 + stDone * 2 + st.length * 0.5;
    const loadPace = expected > 0 ? done / expected : 1;
    score += loadPace >= 0.95 ? 5 : loadPace >= 0.8 ? 2 : 0;
    score -= overdue.length * 2 + stLateN;
    const loadState = plan > norm * 1.05 ? 'over' : plan < norm * 0.9 ? 'under' : 'ok';
    return { plan, done, expected, norm, loadPace, loadState, published, accepted, submitted, overdue, pubPlan, expectedPubs, pubBehind, lead, member, stDone, stAll: st.length, stLate: stLateN, score: Math.max(0, Math.round(score * 10) / 10) };
  });
}

export function kpiStatus(ctx, k) {
  const t = num(k.target);
  const a = num(k.actual);
  const p = t > 0 ? a / t : 0;
  if (t > 0 && a >= t) return { key: 'done', label: 'Bajarildi', cls: 'good', p };
  if (k.deadline && k.deadline < ctx.today) return { key: 'failed', label: 'Bajarilmadi', cls: 'bad', p };
  const left = k.deadline ? daysBetween(ctx.today, k.deadline) : 99;
  if (left <= 7 && p < 0.7) return { key: 'risk', label: 'Xavf ostida', cls: 'warn', p };
  return { key: 'progress', label: 'Jarayonda', cls: 'info', p };
}

export function kpiScore(list) {
  const W = list.reduce((a, k) => a + (num(k.weight) || 1), 0);
  if (!W) return 0;
  return Math.round((list.reduce((a, k) => a + (num(k.weight) || 1) * Math.min(1, num(k.target) > 0 ? num(k.actual) / num(k.target) : 0), 0) / W) * 100);
}

export const kpiOfMonth = (ctx, ym = ctx.today.slice(0, 7)) => ctx.kpi.filter((k) => k.period === ym);

export function kpiByCategory(ctx, list) {
  return KPI_CATS.map((c) => {
    const l = list.filter((k) => k.category === c);
    return { c, list: l, score: kpiScore(l) };
  }).filter((x) => x.list.length);
}

export function subjState(ctx, s) {
  const exp = num(s.planHours) * semFrac(ctx, s.semester);
  if (exp < 1) return { key: 'notstarted', label: 'Boshlanmagan', cls: '', exp: 0 };
  const r = num(s.doneHours) / exp;
  if (r >= 0.9) return { key: 'ok', label: "Me'yorda", cls: 'good', exp };
  if (r >= 0.75) return { key: 'slow', label: 'Biroz ortda', cls: 'warn', exp };
  return { key: 'behind', label: 'Ortda', cls: 'bad', exp };
}

function workloadAlerts(ctx) {
  const out = [];
  if (!ctx.plans.length || !allocItems(ctx).length) return out;
  const s = wlSummary(ctx);
  if (s.unassigned > 0) {
    out.push({ sev: 'bad', area: 'Yuklama', view: 'workload', text: `${Math.round(s.unassigned)} soat o'quv yuklama taqsimlanmagan (≈ ${(s.unassigned / avgNorm(ctx)).toFixed(1)} stavka yetishmaydi)` });
  }
  s.rows.filter((r) => r.norm && r.total > r.norm * 1.05).forEach((r) => {
    out.push({ sev: 'warn', area: 'Yuklama', view: 'workload', text: `${shortName(r.t.name)}ga taqsimlangan yuklama me'yordan oshgan: ${Math.round(r.total)}/${r.norm} soat` });
  });
  if (allocStale(ctx)) out.push({ sev: 'warn', area: 'Yuklama', view: 'workload', text: "Ish rejalar o'zgargan — yuklamani qayta taqsimlash kerak" });
  return out;
}

export function computeAlerts(ctx) {
  return ctx.memo('alerts', () => {
    const out = [];
    const m = ctx.today.slice(0, 7);
    ctx.kpi
      .filter((k) => k.period === m || (k.period < m && k.period >= `${m.slice(0, 4)}-01` && kpiStatus(ctx, k).key === 'failed'))
      .forEach((k) => {
        const s = kpiStatus(ctx, k);
        const when = k.period !== m ? ` (${fmtMonth(k.period)})` : '';
        if (s.key === 'failed') out.push({ sev: 'bad', area: 'KPI', view: 'kpi', ref: { coll: 'kpi', id: k.id }, who: k.responsibleId, text: `KPI ${k.code || ''}${when} «${k.title}» bajarilmadi: ${num(k.actual)}/${num(k.target)} ${k.unit || ''} (mas'ul: ${tshort(ctx, k.responsibleId)})` });
        else if (s.key === 'risk') out.push({ sev: 'warn', area: 'KPI', view: 'kpi', ref: { coll: 'kpi', id: k.id }, who: k.responsibleId, text: `KPI ${k.code || ''} «${k.title}» xavf ostida: ${num(k.actual)}/${num(k.target)}, muddat ${fmtShort(k.deadline)}` });
      });
    ctx.pubs.filter((p) => pubLate(ctx, p)).forEach((p) => out.push({ sev: 'bad', area: 'Ilmiy', view: 'pubs', ref: { coll: 'pubs', id: p.id }, who: p.teacherId, text: `${tshort(ctx, p.teacherId)}: «${p.title}» (${p.type}) muddati ${daysBetween(p.deadline, ctx.today)} kun o'tgan, holati «${p.status}»` }));
    ctx.pubs.filter((p) => pubSoon(ctx, p)).forEach((p) => out.push({ sev: 'warn', area: 'Ilmiy', view: 'pubs', ref: { coll: 'pubs', id: p.id }, who: p.teacherId, text: `${tshort(ctx, p.teacherId)}: «${p.title}» muddatiga ${daysBetween(ctx.today, p.deadline)} kun qoldi, hali «${p.status}»` }));
    ctx.teachers.forEach((t) => {
      const s = teacherStats(ctx, t);
      if (s.loadState === 'over') out.push({ sev: 'warn', area: 'Yuklama', view: 'teachers', who: t.id, text: `${shortName(t.name)} yuklamasi me'yordan ${s.plan - s.norm} soat ortiq (${s.plan}/${s.norm})` });
      if (s.loadState === 'under' && s.plan > 0) out.push({ sev: 'warn', area: 'Yuklama', view: 'teachers', who: t.id, text: `${shortName(t.name)} yuklamasi me'yordan kam: ${s.plan}/${s.norm} soat` });
      if (s.expected >= 10 && s.loadPace < 0.8) out.push({ sev: s.loadPace < 0.65 ? 'bad' : 'warn', area: 'Yuklama', view: 'subjects', who: t.id, text: `${shortName(t.name)} dars soatlari ortda: ${s.done} o'tilgan, kutilgan ${s.expected}` });
    });
    ctx.projects
      .filter((p) => p.status === 'Jarayonda' && p.end)
      .forEach((p) => {
        const d = daysBetween(ctx.today, p.end);
        if (d < 0) out.push({ sev: 'bad', area: 'Loyiha', view: 'projects', who: p.leaderId, text: `«${p.title}» muddati tugagan, bajarilish ${num(p.progress)}%` });
        else if (d <= 60 && num(p.progress) < 80) out.push({ sev: 'warn', area: 'Loyiha', view: 'projects', who: p.leaderId, text: `«${p.title}» tugashiga ${d} kun, bajarilish ${num(p.progress)}%` });
      });
    ctx.stwork.filter((s) => stLate(ctx, s)).forEach((s) => out.push({ sev: 'warn', area: 'Talabalar', view: 'stwork', who: s.teacherId, text: `${s.kind}: «${s.topic}» (${s.student || 'talaba'}) muddati o'tgan — rahbar ${tshort(ctx, s.teacherId)}` }));
    out.push(...workloadAlerts(ctx));
    out.push(...gradeAlerts(ctx));
    out.push(...attAlerts(ctx));
    return out.sort((a, b) => (a.sev === 'bad' ? 0 : 1) - (b.sev === 'bad' ? 0 : 1));
  });
}

// Barcha bo'limlardan yaqinlashayotgan va o'tib ketgan muddatlar
export function deadlines(ctx, days = 30) {
  const until = addDays(ctx.today, days);
  const out = [];
  const push = (date, title, area, view, who, done) => {
    if (!date || done) return;
    if (date > until) return;
    const left = daysBetween(ctx.today, date);
    if (left < -30) return;
    out.push({ date, title, area, view, who, left, overdue: left < 0 });
  };
  ctx.pubs.forEach((p) => push(p.deadline, `${p.title} (${p.type})`, 'Ilmiy ish', 'pubs', p.teacherId, !(p.status === 'Reja' || p.status === 'Yozilmoqda')));
  ctx.projects.forEach((p) => push(p.end, `Loyiha yakuni: ${p.title}`, 'Loyiha', 'projects', p.leaderId, p.status !== 'Jarayonda'));
  ctx.stwork.forEach((s) => push(s.deadline, `${s.kind}: ${s.topic}`, 'Talabalar', 'stwork', s.teacherId, s.status === 'Yakunlandi'));
  kpiOfMonth(ctx).forEach((k) => push(k.deadline, `KPI ${k.code}: ${k.title}`, 'KPI', 'kpi', k.responsibleId, kpiStatus(ctx, k).key === 'done'));
  const retake = [...new Set(ctx.grades.filter((g) => num(g.f) > 0).map((g) => g.retakeDeadline).filter(Boolean))];
  retake.forEach((d) => push(d, 'Akademik qarzdorlarning qayta topshirishi', 'Talabalar', 'students', null, false));
  ['sem1End', 'sem2End'].forEach((k) => push(ctx.settings[k], k === 'sem1End' ? '1-semestr yakuni' : '2-semestr yakuni', "O'quv jarayoni", 'subjects', null, false));
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// Bosh sahifa va AI uchun umumiy raqamlar
export function summary(ctx) {
  return ctx.memo('summary', () => {
    const m = ctx.today.slice(0, 7);
    const kpiM = kpiOfMonth(ctx, m);
    const stats = ctx.teachers.map((t) => ({ t, s: teacherStats(ctx, t) }));
    const plan = stats.reduce((a, x) => a + x.s.plan, 0);
    const done = stats.reduce((a, x) => a + x.s.done, 0);
    const expected = stats.reduce((a, x) => a + x.s.expected, 0);
    const pubPlan = stats.reduce((a, x) => a + x.s.pubPlan, 0);
    const pubOk = stats.reduce((a, x) => a + x.s.published + x.s.accepted, 0);
    const active = ctx.projects.filter((p) => p.status === 'Jarayonda');
    const cont = contingent(ctx);
    const ours = new Set(allocItems(ctx).map((i) => i.name));
    const alerts = computeAlerts(ctx);
    const wl = wlSummary(ctx);
    const gt = gradesTotal(ctx);
    const att = isWorkday(ctx.settings, ctx.today) ? attTodaySummary(ctx).c : null;
    return {
      month: m,
      teachers: ctx.teachers.length,
      rates: ctx.teachers.reduce((a, t) => a + num(t.rate), 0),
      students: cont.students,
      groups: cont.groups,
      subjects: ours.size || new Set(ctx.subjects.map((s) => s.name)).size,
      kpi: { score: kpiScore(kpiM), total: kpiM.length, done: kpiM.filter((k) => kpiStatus(ctx, k).key === 'done').length, failed: kpiM.filter((k) => kpiStatus(ctx, k).key === 'failed').length, risk: kpiM.filter((k) => kpiStatus(ctx, k).key === 'risk').length },
      load: { plan, done, expected, pct: expected ? Math.round((done / expected) * 100) : 0 },
      pubs: { plan: pubPlan, ok: pubOk, behind: stats.filter((x) => x.s.pubBehind).length, overdue: ctx.pubs.filter((p) => pubLate(ctx, p)).length, yearPct: Math.round(yearFrac(ctx) * 100) },
      projects: { active: active.length, funding: active.reduce((a, p) => a + num(p.funding), 0) },
      workload: { total: Math.round(wl.total), unassigned: Math.round(wl.unassigned), needRates: +(wl.total / avgNorm(ctx)).toFixed(1) },
      grades: { pass: gt.pass, quality: gt.quality, debtors: gt.f },
      attendance: att ? { present: att.present + att.late, late: att.late, absent: att.absent, excused: att.excused, total: ctx.teachers.length } : null,
      alerts: { total: alerts.length, bad: alerts.filter((a) => a.sev === 'bad').length },
      pubPct: pct(pubOk, pubPlan),
    };
  });
}
