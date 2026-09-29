// Ma'lumotlar ombori: brauzerning localStorage'ida saqlanadi (har bir foydalanuvchi
// o'z nusxasi bilan ishlaydi). Interfeys ataylab oddiy — keyinchalik Postgres/
// Supabase kabi server bazasiga shu API ortidan almashtirish mumkin.
import { buildSeed, genAttendance, SEED_VERSION } from '../data/seed.js';
import { nowHM, todayISO } from '../lib/dates.js';
import { uid } from '../lib/format.js';
import { TITLES } from '../lib/constants.js';

export const STORAGE_KEY = 'kafedraagent:db';
const COLLECTIONS = ['teachers', 'subjects', 'pubs', 'projects', 'stwork', 'kpi', 'plans', 'attendance', 'grades', 'history', 'activity', 'benchmarks'];
const LOGGED = new Set(['teachers', 'pubs', 'projects', 'stwork', 'kpi', 'grades', 'plans']);
// Bular kafedra ma'lumoti emas — ularni o'zgartirish demo'ni "iflos" qilmaydi
const SIDE = new Set(['history', 'benchmarks', 'activity']);

function safeStorage() {
  try {
    const k = '__ka_probe__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return window.localStorage;
  } catch {
    const mem = new Map();
    return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  }
}

const docTitle = (d) => d?.title || d?.name || d?.topic || d?.subject || d?.id || '';

function describe(coll, action, doc, prev) {
  const what = { teachers: "o'qituvchi", pubs: 'ilmiy ish', projects: 'loyiha', stwork: 'talabalar bilan ish', kpi: 'KPI bandi', grades: 'qaydnoma', plans: 'ish reja' }[coll] || TITLES[coll];
  if (action === 'insert') return `Yangi ${what} qo'shildi: «${docTitle(doc)}»`;
  if (action === 'remove') return `${what.charAt(0).toUpperCase()}${what.slice(1)} o'chirildi: «${docTitle(prev)}»`;
  if (coll === 'kpi' && prev && doc.actual !== undefined && doc.actual !== prev.actual) return `KPI ${prev.code || ''} fakti yangilandi: ${prev.actual} → ${doc.actual} («${prev.title}»)`;
  if (prev && doc.status && doc.status !== prev.status) return `«${docTitle(prev)}» holati: ${prev.status} → ${doc.status}`;
  return null;
}

const VIEW_OF = { teachers: 'teachers', pubs: 'pubs', projects: 'projects', stwork: 'stwork', kpi: 'kpi', grades: 'students', plans: 'workload' };
const AREA_OF = { teachers: "O'qituvchilar", pubs: 'Ilmiy', projects: 'Loyiha', stwork: 'Talabalar', kpi: 'KPI', grades: 'Talabalar', plans: 'Yuklama' };

export function createStore(opts = {}) {
  const storage = opts.storage || safeStorage();
  const clock = opts.clock || (() => ({ today: todayISO(), now: nowHM() }));
  const listeners = new Set();
  let state;

  function fresh() {
    const { today, now } = clock();
    return { ...buildSeed(today, now), rev: 1 };
  }

  function load() {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || s.meta?.version !== SEED_VERSION) return null;
      for (const c of COLLECTIONS) if (!Array.isArray(s[c])) s[c] = [];
      return s;
    } catch {
      return null;
    }
  }

  // Demo rejimi: foydalanuvchi hech narsa o'zgartirmagan bo'lsa — har yangi kunda
  // namuna to'liq yangilanadi; o'zgartirgan bo'lsa — faqat davomat bugungacha to'ldiriladi.
  function refreshDemo(s) {
    if (!s?.meta?.demo) return s;
    const { today, now } = clock();
    if (!s.meta.dirty && s.meta.seedToday !== today) return fresh();
    const gen = genAttendance(s.teachers, s.settings, today, now);
    const byId = new Map(s.attendance.map((d) => [d.id, d]));
    let changed = false;
    for (const g of gen) {
      const cur = byId.get(g.id);
      if (!cur) {
        if (g.id >= (s.meta.seedToday || '')) {
          byId.set(g.id, g);
          changed = true;
        }
        continue;
      }
      if (!cur.auto) continue;
      const records = { ...cur.records };
      for (const [tid, r] of Object.entries(g.records)) {
        const old = records[tid];
        if (!old) records[tid] = r;
        else if (old.in && !old.out && r.out && !old.manual) records[tid] = { ...old, out: r.out };
        else continue;
        changed = true;
      }
      byId.set(g.id, { ...cur, records });
    }
    if (!changed) return s;
    return { ...s, attendance: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)) };
  }

  function persist() {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.warn('saqlab bo\'lmadi', e);
      return false;
    }
  }

  function emit() {
    listeners.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        console.error(e);
      }
    });
  }

  function commit(next, { dirty = true, log } = {}) {
    let s = { ...next, rev: (state?.rev || 0) + 1 };
    if (dirty) s.meta = { ...s.meta, dirty: true };
    if (log) {
      const entry = { id: uid('a'), at: new Date().toISOString(), ...log };
      s = { ...s, activity: [entry, ...s.activity].slice(0, 200) };
    }
    state = s;
    persist();
    emit();
  }

  state = load();
  if (!state) state = fresh();
  else state = refreshDemo(state);
  persist();

  // Boshqa tabda (masalan, eshik oldidagi kiosk) o'zgarsa — shu yerda ham yangilansin
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try {
        state = JSON.parse(e.newValue);
        emit();
      } catch {
        /* e'tiborsiz */
      }
    });
  }

  const api = {
    getState: () => state,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    get(coll, id) {
      return state[coll].find((d) => d.id === id);
    },
    insert(coll, doc, { silent = false } = {}) {
      const id = doc.id || uid(coll.slice(0, 1));
      const d = { ...doc, id, createdAt: doc.createdAt || new Date().toISOString() };
      const text = !silent && LOGGED.has(coll) ? describe(coll, 'insert', d) : null;
      commit({ ...state, [coll]: [...state[coll], d] }, { dirty: !SIDE.has(coll), log: text ? { text, area: AREA_OF[coll], view: VIEW_OF[coll] } : null });
      return id;
    },
    insertMany(coll, docs, logText) {
      const list = docs.map((doc) => ({ ...doc, id: doc.id || uid(coll.slice(0, 1)), createdAt: new Date().toISOString() }));
      commit({ ...state, [coll]: [...state[coll], ...list] }, { log: logText ? { text: logText, area: AREA_OF[coll] || 'Tizim', view: VIEW_OF[coll] } : null });
      return list.map((d) => d.id);
    },
    update(coll, id, patch, { silent = false } = {}) {
      const prev = state[coll].find((d) => d.id === id);
      if (!prev) throw new Error('Yozuv topilmadi');
      const d = { ...prev, ...patch, updatedAt: new Date().toISOString() };
      const text = !silent && LOGGED.has(coll) ? describe(coll, 'update', patch, prev) : null;
      commit({ ...state, [coll]: state[coll].map((x) => (x.id === id ? d : x)) }, { dirty: !SIDE.has(coll), log: text ? { text, area: AREA_OF[coll], view: VIEW_OF[coll] } : null });
      return d;
    },
    remove(coll, id) {
      const prev = state[coll].find((d) => d.id === id);
      if (!prev) return;
      const text = LOGGED.has(coll) ? describe(coll, 'remove', null, prev) : null;
      commit({ ...state, [coll]: state[coll].filter((x) => x.id !== id) }, { dirty: !SIDE.has(coll), log: text ? { text, area: AREA_OF[coll], view: VIEW_OF[coll] } : null });
    },
    replaceAll(coll, docs, logText) {
      commit({ ...state, [coll]: docs }, { log: logText ? { text: logText, area: AREA_OF[coll] || 'Tizim', view: VIEW_OF[coll] } : null });
    },
    setMeta(key, value, logText) {
      commit({ ...state, [key]: value }, { log: logText ? { text: logText, area: 'Tizim', view: 'settings' } : null });
    },
    // Davomat: bitta kun hujjatiga bitta o'qituvchi yozuvini qo'shish/yangilash
    markAttendance(date, tid, patch) {
      const cur = state.attendance.find((d) => d.id === date);
      const rec = { ...(cur?.records?.[tid] || {}), ...patch, manual: true };
      for (const k of Object.keys(rec)) if (rec[k] == null || rec[k] === '') delete rec[k];
      const day = cur
        ? { ...cur, records: { ...cur.records, [tid]: rec } }
        : { id: date, date, month: date.slice(0, 7), records: { [tid]: rec } };
      const list = cur ? state.attendance.map((d) => (d.id === date ? day : d)) : [...state.attendance, day].sort((a, b) => a.id.localeCompare(b.id));
      commit({ ...state, attendance: list });
    },
    log(text, area = 'Tizim', view = 'home') {
      commit({ ...state }, { dirty: false, log: { text, area, view } });
    },
    reset() {
      state = fresh();
      persist();
      emit();
    },
    wipe() {
      const empty = { ...state, meta: { ...state.meta, demo: false, dirty: true } };
      for (const c of COLLECTIONS) empty[c] = [];
      empty.alloc = { items: [] };
      commit(empty, { log: { text: "Barcha ma'lumotlar tozalandi", area: 'Tizim', view: 'settings' } });
    },
    exportJSON() {
      return { app: 'KafedraAgent', version: SEED_VERSION, exported: new Date().toISOString(), ...state };
    },
    importJSON(obj) {
      if (!obj || obj.app !== 'KafedraAgent') throw new Error('Bu KafedraAgent zaxira fayli emas.');
      const next = { ...state, meta: { ...state.meta, ...(obj.meta || {}), version: SEED_VERSION, demo: false, dirty: true } };
      for (const c of COLLECTIONS) if (Array.isArray(obj[c])) next[c] = obj[c];
      for (const k of ['settings', 'loadcfg', 'alloc']) if (obj[k]) next[k] = obj[k];
      commit(next, { log: { text: 'Zaxira nusxadan tiklandi', area: 'Tizim', view: 'settings' } });
      return COLLECTIONS.reduce((a, c) => a + (next[c]?.length || 0), 0);
    },
    tick() {
      const next = refreshDemo(state);
      if (next !== state) {
        state = { ...next, rev: state.rev + 1 };
        persist();
        emit();
      }
    },
  };
  return api;
}
