// Ishchi o'quv reja (.xlsx) parseri, yuklamani hisoblash va avtomatik taqsimlash.
// Mantiq dizayner prototipidan o'zgartirmasdan ko'chirilgan; testlar prototip
// bergan natijani (277 birlik) aynan takrorlashini tekshiradi.
import { DEFAULT_NORMS } from './constants.js';
import { num } from './format.js';

export const LC_KIND = { M: "Ma'ruza", A: 'Amaliy', L: 'Laboratoriya', S: 'Seminar', KI: 'Kurs ishi' };
export const LC_LECTURERS = ['Professor', 'Dotsent', "Katta o'qituvchi"];
export const LC_DEFAULT_CFG = { streamSize: 3, labSplit: 2, kiNorm: 2, overPct: 0, oursOn: [], oursOff: [] };

// Kafedraga tegishli fanlarni nomidan taniymiz; qo'lda belgilash (oursOn/oursOff) ustun.
const LC_OURS_RE = /dastur|ma.lumot|axborot tizim|kiberxavf|axborot xavf|tarmoq|sun.iy|intel|dotnet|kodlash|grafik|bulut|veb|web|devops|arxitektur|tabiiy tilni|big data|multimedi|kompyuter|mobil|python|java|data|lms|muhandis|informatik|algoritm|dasturiy|loyiha/i;
const LC_NOT_RE = /tarix|falsafa|dinshunos|xorijiy til|o.zbek .?(rus)? ?tili|fizika|hisob|calculus|differensial|chiziqli algebra|ehtimol|statistika|pedagog|psixolog|konstitu|ma.naviyat|hayot faoliyati|jismoniy|mehnat muhofaza|elektronika|diskret|matematik analiz|akademik yozuv|ekologiya/i;

export function lcIsOurs(name, cfg = LC_DEFAULT_CFG) {
  if ((cfg.oursOn || []).includes(name)) return true;
  if ((cfg.oursOff || []).includes(name)) return false;
  return LC_OURS_RE.test(name) && !LC_NOT_RE.test(name);
}

export function lcPrefix(p) {
  const m = String(p.sheet || '').match(/^([A-Za-zА-Яа-я]+)/);
  return (m ? m[1] : p.specCode || 'GR').toUpperCase();
}
export function lcYY(p) {
  const m = String(p.sheet || '').match(/(\d{4})/);
  return m ? m[1].slice(2) : '';
}
export function lcGroups(p) {
  const n = Math.max(0, Math.round(+p.groups || 0));
  const masof = /masofa/i.test(p.form || '');
  const base = `${lcPrefix(p)}${p.extra ? '(2m)' : ''}-${lcYY(p)}`;
  return Array.from({ length: n }, (_, i) => `${base}-${masof ? 'M' : ''}${String(i + 1).padStart(2, '0')}`);
}
export function lcPlanLabel(p) {
  return `${p.kurs}-kurs ${lcPrefix(p)}${p.extra ? ' (2-mutax.)' : ''} · ${p.form}`;
}
export function lcHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function lcBuildItems(plans, cfg = LC_DEFAULT_CFG) {
  const items = [];
  const streamSize = Math.max(1, +cfg.streamSize || 3);
  const split = Math.max(1, +cfg.labSplit || 1);
  const kiNorm = +cfg.kiNorm || 0;
  for (const p of plans) {
    if (!p.active) continue;
    const groups = lcGroups(p);
    if (!groups.length) continue;
    const streams = [];
    for (let i = 0; i < groups.length; i += streamSize) streams.push(groups.slice(i, i + streamSize));
    const label = lcPlanLabel(p);
    for (const s of p.subjects || []) {
      if (!lcIsOurs(s.name, cfg)) continue;
      const semKeys = Object.keys(s.sem || {}).sort();
      for (const sem of semKeys) {
        const [M, A, L, S] = s.sem[sem];
        const add = (kind, hours, group) => {
          if (!hours) return;
          const id = lcHash([p.id, s.code, s.name, kind, sem, group].join('|'));
          items.push({ id, planId: p.id, plan: label, kurs: p.kurs, form: p.form, code: s.code, name: s.name, kind, sem: +sem, half: +sem % 2 ? 1 : 2, group, hours: Math.round(hours * 10) / 10 });
        };
        streams.forEach((st, i) => add('M', M, streams.length > 1 ? `${st[0]}…${st[st.length - 1]} (${i + 1}-potok)` : st.length > 1 ? `${st[0]}…${st[st.length - 1]}` : st[0]));
        groups.forEach((g) => {
          add('A', A, g);
          add('S', S, g);
          for (let k = 1; k <= split; k += 1) add('L', L, split > 1 ? `${g}/${k}` : g);
        });
      }
      if (s.ki && kiNorm && semKeys.length) {
        const sem = semKeys[semKeys.length - 1];
        groups.forEach((g) => {
          const id = lcHash([p.id, s.code, s.name, 'KI', sem, g].join('|'));
          items.push({ id, planId: p.id, plan: label, kurs: p.kurs, form: p.form, code: s.code, name: s.name, kind: 'KI', sem: +sem, half: +sem % 2 ? 1 : 2, group: g, hours: Math.round((+p.students || 25) * kiNorm) });
        });
      }
    }
  }
  return items;
}

/**
 * Ochko'z (greedy) muvozanatli taqsimlash. `prev` — {itemId: {teacherId, pinned}}:
 * qo'lda biriktirilganlar (pinned) qayta taqsimlashda saqlanadi.
 * Qoidalar: ma'ruzani faqat professor/dotsent/katta o'qituvchi o'qiydi; me'yordan
 * oshirmaslik; bir fanni bir o'qituvchida jamlash; professorni amaliyotga kamroq.
 */
export function lcAllocate(items, teachers, norms, cfg = LC_DEFAULT_CFG, prev = {}) {
  const over = 1 + (+cfg.overPct || 0) / 100;
  const T = teachers.map((t) => ({ id: t.id, pos: t.position, cap: Math.round((norms[t.position] || 600) * (+t.rate || 1)), load: 0, subs: new Set() }));
  const byId = Object.fromEntries(T.map((t) => [t.id, t]));
  const out = items.map((it) => ({ ...it, teacherId: null, pinned: false }));
  for (const it of out) {
    const p = prev[it.id];
    if (p && p.pinned && byId[p.teacherId]) {
      it.teacherId = p.teacherId;
      it.pinned = true;
      byId[p.teacherId].load += it.hours;
      byId[p.teacherId].subs.add(it.name);
    }
  }
  const order = { M: 0, KI: 1, L: 2, A: 3, S: 4 };
  const todo = out
    .filter((it) => !it.pinned)
    .sort((a, b) => order[a.kind] - order[b.kind] || b.hours - a.hours || a.name.localeCompare(b.name) || a.group.localeCompare(b.group));
  for (const it of todo) {
    let best = null;
    let bs = Infinity;
    for (const t of T) {
      if (it.kind === 'M' && !LC_LECTURERS.includes(t.pos)) continue;
      if (t.load + it.hours > t.cap * over) continue;
      const same = t.subs.has(it.name);
      let sc = (t.load + it.hours) / t.cap;
      if (same) sc -= 0.3;
      else if (t.subs.size >= 6) sc += 0.25;
      if (it.kind !== 'M' && t.pos === 'Professor') sc += 0.2;
      if (it.kind === 'M' && t.pos === "Katta o'qituvchi") sc += 0.08;
      if (sc < bs) {
        bs = sc;
        best = t;
      }
    }
    if (best) {
      it.teacherId = best.id;
      best.load += it.hours;
      best.subs.add(it.name);
    }
  }
  return out;
}

export function lcSummary(items, teachers, norms) {
  const rows = teachers.map((t) => ({ t, norm: Math.round((norms[t.position] || 600) * (+t.rate || 1)), M: 0, A: 0, L: 0, S: 0, KI: 0, h1: 0, h2: 0, total: 0, subs: new Set() }));
  const by = Object.fromEntries(rows.map((r) => [r.t.id, r]));
  let un = 0;
  let unN = 0;
  let total = 0;
  let h1 = 0;
  let h2 = 0;
  for (const it of items) {
    total += it.hours;
    if (it.half === 1) h1 += it.hours;
    else h2 += it.hours;
    const r = by[it.teacherId];
    if (!r) {
      un += it.hours;
      unN += 1;
      continue;
    }
    r[it.kind] += it.hours;
    r.total += it.hours;
    r[`h${it.half}`] += it.hours;
    r.subs.add(it.name);
  }
  return { rows, total, h1, h2, unassigned: un, unassignedN: unN };
}

/* ---------- ctx asosidagi yordamchilar ---------- */

export const normsOf = (settings) => ({ ...DEFAULT_NORMS, ...(settings?.norms || {}) });
export const activePlans = (ctx) => ctx.plans.filter((p) => p.active);
export const allocItems = (ctx) => ctx.alloc?.items || [];

export function allocStale(ctx) {
  const items = allocItems(ctx);
  if (!items.length) return activePlans(ctx).length > 0;
  const fresh = lcBuildItems(ctx.plans, ctx.loadcfg);
  if (fresh.length !== items.length) return true;
  const m = new Map(items.map((i) => [i.id, i.hours]));
  return fresh.some((i) => m.get(i.id) !== i.hours);
}

export function wlSummary(ctx) {
  return ctx.memo('wlSummary', () => lcSummary(allocItems(ctx), ctx.teachers, normsOf(ctx.settings)));
}

export function avgNorm(ctx) {
  const n = normsOf(ctx.settings);
  const ts = ctx.teachers;
  if (!ts.length) return 600;
  const w = ts.reduce((a, t) => a + (n[t.position] || 600) * num(t.rate || 1), 0);
  return w / ts.reduce((a, t) => a + num(t.rate || 1), 0);
}

// Joriy o'quv reja bo'yicha yangi taqsimot (qo'lda biriktirilganlar saqlanadi)
export function runAllocation(ctx) {
  const items = lcBuildItems(ctx.plans, ctx.loadcfg);
  const prev = Object.fromEntries(allocItems(ctx).map((i) => [i.id, { teacherId: i.teacherId, pinned: i.pinned }]));
  return lcAllocate(items, ctx.teachers, normsOf(ctx.settings), ctx.loadcfg, prev);
}

// Taqsimotni "O'quv yuklama" bo'limi yozuvlariga aylantirish (o'qituvchi+fan+tur+semestr bo'yicha jamlab)
export function allocToSubjects(items, oldSubjects) {
  const agg = new Map();
  for (const it of items.filter((i) => i.teacherId)) {
    const kind = LC_KIND[it.kind];
    const sem = String(it.half);
    const key = [it.teacherId, it.name, kind, sem].join('|');
    const a = agg.get(key) || { name: it.name, teacherId: it.teacherId, kind, semester: sem, groups: [], planHours: 0 };
    a.groups.push(it.group);
    a.planHours += it.hours;
    agg.set(key, a);
  }
  const old = new Map(oldSubjects.map((s) => [[s.teacherId, s.name, s.kind, String(s.semester)].join('|'), num(s.doneHours)]));
  return [...agg.entries()].map(([key, a]) => {
    const g = [...new Set(a.groups)];
    return {
      name: a.name,
      teacherId: a.teacherId,
      kind: a.kind,
      semester: a.semester,
      group: g.length > 4 ? `${g.slice(0, 4).join(', ')} va yana ${g.length - 4}` : g.join(', '),
      planHours: Math.round(a.planHours),
      doneHours: Math.min(old.get(key) || 0, Math.round(a.planHours)),
      source: 'ish-reja',
    };
  });
}

/* ---------- Ishchi o'quv reja (.xlsx) parseri ---------- */

export function parsePlanWorkbook(XLSX, wb, fileName, targetYear) {
  const results = [];
  const skipped = [];
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const txt = (v) => (v == null ? '' : String(v));
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws || !ws['!ref']) continue;
    const R = XLSX.utils.decode_range(ws['!ref']);
    const rows = [];
    for (let r = 0; r <= R.e.r; r += 1) {
      const row = [];
      for (let c = 0; c <= Math.min(R.e.c, 90); c += 1) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        row.push(cell ? cell.v : null);
      }
      rows.push(row);
    }
    // Semestrlar sarlavhasi: 1..8 raqamlari 4 ustun oralig'ida
    let hdr = -1;
    const semCol = {};
    for (let i = 0; i < Math.min(rows.length, 80); i += 1) {
      const ints = [];
      rows[i].forEach((v, j) => {
        if (isNum(v) && Number.isInteger(v)) ints.push([j, v]);
      });
      for (let s = 0; s + 7 < ints.length; s += 1) {
        const seq = ints.slice(s, s + 8);
        if (seq.every((x, k) => x[1] === k + 1) && seq[1][0] - seq[0][0] === 4) {
          hdr = i;
          seq.forEach(([j, v]) => { semCol[v] = j; });
          break;
        }
      }
      if (hdr >= 0) break;
    }
    if (hdr < 0) continue;
    let cCode = 2;
    let cName = 5;
    let cTotal = 10;
    let cKI = 17;
    for (let i = 0; i < hdr; i += 1) {
      rows[i].forEach((v, j) => {
        const t = txt(v).toLowerCase();
        if (/malakaviy kodi|fan kodi/.test(t)) cCode = j;
        else if (/fanlari|nomlari/.test(t) && !/soat/.test(t)) cName = j;
        else if (/umumiy yuklama/.test(t)) cTotal = j;
        else if (/^kurs ishi$/.test(t.trim())) cKI = j;
      });
    }
    const title = rows.slice(0, 14).map((r) => r.filter((v) => v != null && v !== '').join(' ')).join(' ');
    const mk = title.match(/(\d)\s*-\s*kurs([^()]*?)uchun\s+(\d{4})\s*-\s*(\d{4})/i);
    const kurs = mk ? +mk[1] : null;
    const year = mk ? `${mk[3]}-${mk[4]}` : null;
    const extra = mk && /mutaxassis/i.test(mk[2]) ? '2-mutaxassislik' : '';
    const ms = title.match(/(\d{8})\s*[-–—]\s*(.+?)(?:\s+O.QISH MUDDATI|\(|$)/i);
    const specCode = ms ? ms[1] : (fileName.match(/\d{8}/) || [''])[0];
    const specName = ms ? ms[2].replace(/\s+/g, ' ').trim() : '';
    const mf = title.match(/TA.LIM SHAKLI\s*-?\s*([A-Za-zʻ'’]+)/i);
    let form = mf ? mf[1] : /masofa/i.test(sheetName) ? 'Masofaviy' : 'Kunduzgi';
    form = form.charAt(0).toUpperCase() + form.slice(1).toLowerCase();
    if (!kurs) {
      skipped.push({ sheet: sheetName, reason: "Kurs va o'quv yili aniqlanmadi" });
      continue;
    }
    if (targetYear && year && year !== targetYear) {
      skipped.push({ sheet: sheetName, reason: `${year} o'quv yili uchun (joriy: ${targetYear})` });
      continue;
    }
    const sems = [2 * kurs - 1, 2 * kurs];
    const subjects = [];
    const seen = new Set();
    let block = '';
    let cur = null;
    for (let i = hdr + 1; i < rows.length; i += 1) {
      const r = rows[i];
      const no = txt(r[0]).trim();
      const code = txt(r[cCode]).trim();
      const name = txt(r[cName]).replace(/\s+/g, ' ').trim();
      if (/^\d\.00$/.test(no) && name) {
        block = name;
        cur = null;
        continue;
      }
      if (!name) continue;
      const hours = {};
      let any = false;
      for (const s of sems) {
        const c = semCol[s];
        if (c == null) continue;
        const h = [0, 1, 2, 3].map((k) => (isNum(r[c + k]) ? r[c + k] : 0));
        if (h.some((x) => x)) {
          hours[s] = h;
          any = true;
        }
      }
      const hasTotal = isNum(r[cTotal]);
      if (!no && code && !hasTotal && cur) {
        cur.alts.push(name);
        continue;
      }
      if (!code) {
        cur = null;
        continue;
      }
      const key = `${code}|${name}`;
      if (seen.has(key)) {
        cur = null;
        continue;
      }
      seen.add(key);
      const s = { code, name, block: /tanlov/i.test(block) ? 'Tanlov' : 'Majburiy', ki: !!txt(r[cKI]).trim() && /ki/i.test(txt(r[cKI])), total: hasTotal ? r[cTotal] : 0, sem: hours, alts: [] };
      cur = s;
      if (any) subjects.push(s);
    }
    results.push({ file: fileName, sheet: sheetName, kurs, year, extra, specCode, specName, form, subjects });
  }
  return { plans: results, skipped };
}
