// Davomat: kelib-ketishni qayd etish va hisoblash.
// Yozuv: attendance[] — {id: sana, date, month, records: {teacherId: {in, out, reason}}}
import { ATT_CODE } from './constants.js';
import { fmtMonth, monthDays, toMin, weekday } from './dates.js';
import { shortName } from './format.js';

export function attCfg(settings = {}) {
  return {
    start: settings.workStart || '08:30',
    end: settings.workEnd || '17:00',
    grace: settings.graceMin != null && settings.graceMin !== '' ? +settings.graceMin : 10,
    days: String(settings.workWeek || '6') === '5' ? [1, 2, 3, 4, 5] : [1, 2, 3, 4, 5, 6],
    holidays: String(settings.holidays || '')
      .split(/[,;\s]+/)
      .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)),
  };
}

export function isWorkday(settings, date) {
  const c = attCfg(settings);
  return c.days.includes(weekday(date)) && !c.holidays.includes(date);
}

export const attDay = (ctx, date) => ctx.memo(`attDayMap`, () => new Map(ctx.attendance.map((d) => [d.id, d]))).get(date);
export const attRec = (ctx, date, tid) => (attDay(ctx, date)?.records || {})[tid] || {};

export function attStatus(ctx, date, tid) {
  const c = attCfg(ctx.settings);
  const r = attRec(ctx, date, tid);
  if (!isWorkday(ctx.settings, date)) return { key: 'off', label: c.holidays.includes(date) ? 'Bayram' : 'Dam olish', cls: '', r };
  if (r.reason) return { key: 'excused', label: r.reason, cls: 'info', r };
  if (r.in) {
    const late = toMin(r.in) - toMin(c.start);
    if (late > c.grace) return { key: 'late', label: `Kechikdi · ${late} daq`, cls: 'warn', late, r };
    return { key: 'present', label: 'Keldi', cls: 'good', r };
  }
  if (date < ctx.today) return { key: 'absent', label: 'Kelmadi', cls: 'bad', r };
  if (date > ctx.today) return { key: 'future', label: '—', cls: '', r };
  if (toMin(ctx.now) > toMin(c.start) + c.grace) return { key: 'absent', label: 'Hali kelmagan', cls: 'bad', r };
  return { key: 'waiting', label: 'Kutilmoqda', cls: '', r };
}

export function worked(r) {
  if (!r.in || !r.out) return null;
  const d = toMin(r.out) - toMin(r.in);
  return d > 0 ? d : null;
}

export function attMonthStats(ctx, ym, tid) {
  const s = { work: 0, present: 0, late: 0, lateMin: 0, excused: 0, absent: 0, min: 0, byReason: {} };
  for (const d of monthDays(ym)) {
    if (d > ctx.today) break;
    const st = attStatus(ctx, d, tid);
    if (st.key === 'off' || st.key === 'future' || st.key === 'waiting') continue;
    s.work += 1;
    if (st.key === 'present' || st.key === 'late') {
      s.present += 1;
      const w = worked(st.r);
      if (w) s.min += w;
    }
    if (st.key === 'late') {
      s.late += 1;
      s.lateMin += st.late;
    }
    if (st.key === 'excused') {
      s.excused += 1;
      s.byReason[st.r.reason] = (s.byReason[st.r.reason] || 0) + 1;
    }
    if (st.key === 'absent' && d < ctx.today) s.absent += 1;
  }
  return s;
}

export function attTodaySummary(ctx) {
  const c = { present: 0, late: 0, excused: 0, absent: 0, waiting: 0, off: 0, future: 0 };
  const lists = { late: [], absent: [], excused: [], present: [] };
  for (const t of ctx.teachers) {
    const s = attStatus(ctx, ctx.today, t.id);
    c[s.key] = (c[s.key] || 0) + 1;
    if (lists[s.key]) lists[s.key].push({ t, s });
  }
  return { c, lists };
}

export function attCode(ctx, d, tid) {
  const s = attStatus(ctx, d, tid);
  return { present: '+', late: 'K', excused: ATT_CODE[s.r.reason] || 'S', absent: d < ctx.today ? '×' : '', off: '·', future: '', waiting: '' }[s.key];
}

export function attAlerts(ctx) {
  const out = [];
  if (!ctx.teachers.length || !isWorkday(ctx.settings, ctx.today)) return out;
  const { lists } = attTodaySummary(ctx);
  if (lists.late.length) {
    out.push({ sev: 'warn', area: 'Davomat', view: 'attendance', text: `Bugun kechikkanlar: ${lists.late.map((x) => `${shortName(x.t.name)} (${x.s.r.in})`).join(', ')}` });
  }
  if (lists.absent.length && ctx.attendance.length) {
    out.push({ sev: 'bad', area: 'Davomat', view: 'attendance', text: `Bugun ish joyida emas (sababsiz): ${lists.absent.map((x) => shortName(x.t.name)).join(', ')}` });
  }
  const ym = ctx.today.slice(0, 7);
  ctx.teachers.forEach((t) => {
    const s = attMonthStats(ctx, ym, t.id);
    if (s.late >= 3) out.push({ sev: 'warn', area: 'Davomat', view: 'attendance', text: `${shortName(t.name)} ${fmtMonth(ym)}da ${s.late} marta kechikdi (jami ${s.lateMin} daqiqa)` });
    if (s.absent >= 1) out.push({ sev: 'bad', area: 'Davomat', view: 'attendance', text: `${shortName(t.name)} ${fmtMonth(ym)}da ${s.absent} kun sababsiz kelmagan` });
  });
  return out;
}
