// Talabalar kontingenti (ish rejalardagi guruhlar) va o'zlashtirish ko'rsatkichlari.
// O'zlashtirish = qoniqarli va undan yuqori baho olganlar ulushi;
// sifat = a'lo va yaxshi baho olganlar ulushi (o'zbek OTM hisobotlaridagi standart).
import { PASS_TARGET } from './constants.js';
import { daysBetween, fmtShort } from './dates.js';
import { num, pct } from './format.js';
import { activePlans, lcGroups, lcPlanLabel } from './workload.js';

export function gradeRow(g) {
  const n = Math.max(1, num(g.students));
  const a = num(g.a);
  const b = num(g.b);
  const c = num(g.c);
  const f = num(g.f);
  const graded = a + b + c + f || n;
  return {
    pass: pct(graded - f, graded),
    quality: pct(a + b, graded),
    avg: graded ? Math.round(((5 * a + 4 * b + 3 * c + 2 * f) / graded) * 100) / 100 : 0,
    debt: f,
    graded,
  };
}

// Ish rejalardan: har bir faol reja × guruhlar soni × guruhdagi talabalar
export function groupsFromPlans(ctx) {
  return ctx.memo('groups', () => {
    const out = [];
    for (const p of activePlans(ctx)) {
      for (const name of lcGroups(p)) {
        out.push({ key: `${p.id}|${name}`, name, planId: p.id, kurs: p.kurs, form: p.form, spec: p.specName, plan: lcPlanLabel(p), students: num(p.students) });
      }
    }
    return out;
  });
}

export function contingent(ctx) {
  const groups = groupsFromPlans(ctx);
  return { groups: groups.length, students: groups.reduce((a, g) => a + g.students, 0) };
}

function agg(list) {
  const t = list.reduce((s, g) => ({ a: s.a + num(g.a), b: s.b + num(g.b), c: s.c + num(g.c), f: s.f + num(g.f), students: s.students + num(g.students) }), { a: 0, b: 0, c: 0, f: 0, students: 0 });
  return { ...t, ...gradeRow(t) };
}

export function gradesBySubject(ctx) {
  const m = new Map();
  for (const g of ctx.grades) {
    const k = g.subject;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(g);
  }
  return [...m.entries()]
    .map(([subject, list]) => ({ subject, teacherIds: [...new Set(list.map((x) => x.teacherId).filter(Boolean))], groups: list.length, ...agg(list) }))
    .sort((a, b) => a.pass - b.pass);
}

export function gradesByGroup(ctx) {
  const m = new Map();
  for (const g of ctx.grades) {
    const k = `${g.kurs || ''}|${g.group}`;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(g);
  }
  return [...m.entries()]
    .map(([, list]) => ({ ...agg(list), group: list[0].group, kurs: list[0].kurs, subjects: list.length, students: Math.max(...list.map((x) => num(x.students))) }))
    .sort((a, b) => a.pass - b.pass);
}

export function gradesTotal(ctx) {
  return agg(ctx.grades);
}

export function debtors(ctx) {
  const out = [];
  for (const g of ctx.grades) {
    for (const name of g.debtors || []) {
      out.push({ name, group: g.group, kurs: g.kurs, subject: g.subject, teacherId: g.teacherId, deadline: g.retakeDeadline, gradeId: g.id });
    }
  }
  return out.sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)) || a.group.localeCompare(b.group));
}

export function gradeAlerts(ctx) {
  const out = [];
  if (!ctx.grades.length) return out;
  for (const s of gradesBySubject(ctx)) {
    if (s.pass < PASS_TARGET - 5) out.push({ sev: 'bad', area: 'Talabalar', view: 'students', text: `«${s.subject}» fanidan o'zlashtirish ${s.pass}% (me'yor ${PASS_TARGET}%) — ${s.f} nafar qarzdor` });
    else if (s.pass < PASS_TARGET) out.push({ sev: 'warn', area: 'Talabalar', view: 'students', text: `«${s.subject}» fanidan o'zlashtirish ${s.pass}% — me'yordan past` });
  }
  const list = debtors(ctx);
  if (list.length) {
    const next = list.map((d) => d.deadline).filter(Boolean).sort()[0];
    const left = next ? daysBetween(ctx.today, next) : null;
    const when = next ? `, qayta topshirish muddati ${fmtShort(next)}${left != null ? (left >= 0 ? ` (${left} kun qoldi)` : ` (${-left} kun o'tdi)`) : ''}` : '';
    out.push({ sev: left != null && left < 0 ? 'bad' : 'warn', area: 'Talabalar', view: 'students', text: `${list.length} nafar talaba akademik qarzdor${when}` });
  }
  return out;
}
