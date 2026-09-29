// Namuna (demo) ma'lumotlar generatori.
//
// Nega statik JSON emas: taqdimot boshqa kunda bo'ladi. Statik sanalar bilan
// o'sha kuni hamma o'qituvchi "kelmagan", joriy oyda KPI bo'sh, hamma dars
// "ortda" bo'lib chiqardi. Shuning uchun bazaviy ma'lumotlar (2026-09-29 holati)
// bugungi sanaga SURILADI: hikoya (kim kechikadi, qaysi maqola muddati o'tgan,
// qaysi KPI xavf ostida) har qanday kunda bir xil ko'rinadi.
import base from './seed-base.json';
import { DEFAULT_SETTINGS } from '../lib/constants.js';
import { addDays, addMonths, daysBetween, fromMin, isISO, lastDay, monthOf, toMin } from '../lib/dates.js';
import { lcAllocate, lcBuildItems, lcGroups, LC_DEFAULT_CFG, normsOf } from '../lib/workload.js';
import { isWorkday } from '../lib/attendance.js';
import { hashStr, rngFor } from '../lib/rng.js';

export const SEED_VERSION = 5;

const shiftIso = (s, n) => (isISO(s) ? addDays(s, n) : s);

// Davomat profillari — dizayner prototipidagi 2026-yil sentyabr ma'lumotidan olingan naqsh
const LATE = { t05: [0.28, 68], t13: [0.2, 74], t17: [0.1, 79], t11: [0.05, 47] };
const HALF_DAY = new Set(['t07']); // 0.5 stavka — tushgacha
// Sababli kunlar: bugundan necha kun oldin boshlanadi, necha ish kuni davom etadi
const EVENTS = [
  { tid: 't16', reason: 'Kasallik varaqasi', from: -12, len: 3 },
  { tid: 't03', reason: 'Xizmat safari', from: -8, len: 2 },
  { tid: 't09', reason: 'Malaka oshirish', from: -19, len: 2 },
];
const ABSENT = [
  { tid: 't15', at: -6 },
  { tid: 't14', at: -15 },
];

function eventDays(settings, today) {
  const map = new Map();
  for (const e of EVENTS) {
    let d = addDays(today, e.from);
    let n = 0;
    let guard = 0;
    while (n < e.len && guard < 20) {
      if (isWorkday(settings, d) && d < today) {
        map.set(`${e.tid}|${d}`, e.reason);
        n += 1;
      }
      d = addDays(d, 1);
      guard += 1;
    }
  }
  for (const a of ABSENT) {
    let d = addDays(today, a.at);
    while (!isWorkday(settings, d)) d = addDays(d, -1);
    map.set(`${a.tid}|${d}`, 'ABSENT');
  }
  return map;
}

export function genAttendance(teachers, settings, today, now) {
  const start = `${addMonths(monthOf(today), -1)}-01`;
  const nowMin = toMin(now);
  const special = eventDays(settings, today);
  const days = [];
  for (let d = start; d <= today; d = addDays(d, 1)) {
    if (!isWorkday(settings, d)) continue;
    const records = {};
    for (const t of teachers) {
      const sp = special.get(`${t.id}|${d}`);
      if (sp === 'ABSENT') continue;
      if (sp) {
        records[t.id] = { reason: sp };
        continue;
      }
      const r = rngFor(`${t.id}|${d}`);
      let inMin = 8 * 60 + 2 + Math.floor(r() * 27);
      const late = LATE[t.id];
      if (late && r() < late[0]) inMin = 8 * 60 + 41 + Math.floor(r() * (late[1] - 40));
      let outMin = HALF_DAY.has(t.id) ? 12 * 60 + 52 + Math.floor(r() * 35) : 16 * 60 + 45 + Math.floor(r() * 80);
      if (d === today) {
        // Bugun: Ergashev kechikadi, Sharipova hali kelmagan — "tirik" holat
        if (t.id === 't14') continue;
        if (t.id === 't05') inMin = 9 * 60 + 8;
        if (inMin > nowMin) continue;
        records[t.id] = outMin <= nowMin ? { in: fromMin(inMin), out: fromMin(outMin) } : { in: fromMin(inMin) };
        continue;
      }
      records[t.id] = { in: fromMin(inMin), out: fromMin(outMin) };
    }
    days.push({ id: d, date: d, month: d.slice(0, 7), records, auto: true });
  }
  return days;
}

// O'tgan semestr yakuniy nazorat natijalari. Fan va o'qituvchi juftliklari
// kafedra profiliga mos: MB — Karimova, tarmoqlar — Toshmatov va h.k.
const PREV_SUBJECTS = {
  2: [
    ['Dasturlash asoslari', 't04', 0.97],
    ["Algoritmlar va ma'lumotlar tuzilmasi", 't15', 0.78],
    ['Kompyuter arxitekturasi', 't13', 0.97],
  ],
  3: [
    ["Ma'lumotlar bazasi", 't02', 0.95],
    ['Web texnologiyalar', 't06', 0.98],
    ['Kompyuter tarmoqlari', 't03', 0.96],
  ],
  4: [
    ['Axborot xavfsizligi asoslari', 't11', 0.96],
    ['Mobil ilovalar yaratish', 't05', 0.97],
    ["Sun'iy intellekt asoslari", 't01', 0.9],
  ],
};
const MALE = ['Aziz', 'Bekzod', 'Doniyor', 'Jasur', 'Sardor', 'Otabek', 'Shoxrux', 'Javohir', 'Umid', 'Sherzod', 'Asliddin', 'Farrux', 'Islom', 'Temur'];
const FEMALE = ['Madina', 'Zarina', 'Sevara', 'Dilnoza', 'Nilufar', 'Kamola', 'Feruza', 'Gulnoza', 'Shahzoda', 'Mohinur', 'Malika', 'Nodira'];
const SURN = ['Aliyev', 'Karimov', 'Rahimov', 'Tursunov', 'Sodiqov', 'Nazarov', 'Qodirov', 'Ergashev', 'Yusupov', 'Hamroyev', 'Ismoilov', 'Rashidov', "To'rayev", 'Xolov', 'Jumayev', 'Sharipov'];

function studentName(r) {
  const female = r() < 0.45;
  const s = SURN[Math.floor(r() * SURN.length)];
  const f = female ? FEMALE[Math.floor(r() * FEMALE.length)] : MALE[Math.floor(r() * MALE.length)];
  return `${female ? `${s}a` : s} ${f}`;
}

export function prevSessionLabel(settings, today) {
  const y = parseInt(String(settings.year).slice(0, 4), 10) || 2026;
  if (today >= (settings.sem2Start || '9999')) return `${y}-${y + 1} o'quv yili, kuzgi semestr`;
  return `${y - 1}-${y} o'quv yili, bahorgi semestr`;
}

export function genGrades(plans, settings, today) {
  const out = [];
  const session = prevSessionLabel(settings, today);
  const retake = addDays(today, 12);
  for (const p of plans.filter((x) => x.active)) {
    const subs = PREV_SUBJECTS[p.kurs];
    if (!subs) continue;
    for (const g of lcGroups(p)) {
      const gr = rngFor(`grp|${p.id}|${g}`);
      const strength = (gr() - 0.5) * 0.06 - (/masofa/i.test(p.form) ? 0.03 : 0);
      for (const [subject, teacherId, base0] of subs) {
        const r = rngFor(`grd|${p.id}|${g}|${subject}`);
        const n = Math.max(8, Math.round(+p.students || 25));
        const pass = Math.min(1, Math.max(0.6, base0 + strength + (r() - 0.5) * 0.04));
        const f = Math.max(0, Math.round(n * (1 - pass)));
        const rest = n - f;
        const qa = 0.18 + r() * 0.14;
        const a = Math.round(rest * qa);
        const b = Math.round(rest * (0.42 + r() * 0.1));
        const c = Math.max(0, rest - a - b);
        const debtors = Array.from({ length: f }, () => studentName(r));
        out.push({
          id: `g${hashStr(`${p.id}|${g}|${subject}`).toString(36)}`,
          session,
          planId: p.id,
          kurs: p.kurs,
          group: g,
          subject,
          teacherId,
          students: n,
          a,
          b,
          c,
          f,
          debtors,
          retakeDeadline: retake,
        });
      }
    }
  }
  return out;
}

function genActivity(s, today) {
  const at = (iso, hm = '10:00') => `${iso}T${hm}:00`;
  const pub = (id) => s.pubs.find((p) => p.id === id);
  const list = [
    [pub('p11')?.pubDate, 'pubs', 'Ilmiy', `«${pub('p11')?.title}» maqolasi chop etildi (Respublika konferensiyasi)`],
    [pub('p04')?.pubDate, 'pubs', 'Ilmiy', `«${pub('p04')?.title}» OAK jurnalida chop etildi`],
    [addDays(today, -27), 'workload', 'Yuklama', `${s.plans.length} ta ishchi o'quv reja yuklandi, yuklama avtomatik taqsimlandi`],
    [addDays(today, -17), 'projects', 'Loyiha', "Yangi loyiha rejalashtirildi: «EduBot — talabalar uchun Telegram yordamchi»"],
    [addDays(today, -14), 'stwork', 'Talabalar', "Talaba maqolasi yakunlandi: «O'zbekistonda IT-parklar rezidentlari tahlili»"],
    [addDays(today, -9), 'students', 'Talabalar', "Yakuniy nazorat qaydnomalari kiritildi, qarzdorlar ro'yxati shakllandi"],
    [addDays(today, -3), 'kpi', 'KPI', "KPI 3.1 bajarildi: talabalar turar joyiga tashrif (4/4)"],
    [addDays(today, -1), 'pubs', 'Ilmiy', "«IT-startaplarda agile boshqaruv samaradorligi» WoS jurnaliga qabul qilindi"],
  ];
  return list
    .filter(([d]) => isISO(d) && d <= today)
    .map(([d, view, area, text], i) => ({ id: `a0${i}`, at: at(d, `${String(9 + (i % 7)).padStart(2, '0')}:${10 + i * 5}`), view, area, text, seed: true }))
    .sort((a, b) => b.at.localeCompare(a.at));
}

/**
 * @param {string} today  YYYY-MM-DD
 * @param {string} now    HH:MM — bugungi davomatga kim "kelgan"ini aniqlaydi
 */
export function buildSeed(today, now = '12:00') {
  const b = JSON.parse(JSON.stringify(base));
  const shift = daysBetween(b.anchor, today);
  const settings = { ...DEFAULT_SETTINGS, ...b.settings };
  for (const k of ['sem1Start', 'sem1End', 'sem2Start', 'sem2End']) settings[k] = shiftIso(settings[k], shift);

  const pubs = b.pubs.map((p) => ({ ...p, deadline: shiftIso(p.deadline, shift), pubDate: shiftIso(p.pubDate, shift) }));
  const projects = b.projects.map((p) => ({ ...p, start: shiftIso(p.start, shift), end: shiftIso(p.end, shift) }));
  const stwork = b.stwork.map((s) => ({ ...s, deadline: shiftIso(s.deadline, shift) }));

  // KPI: davr oyi bugungi oyga nisbatan saqlanadi. Muddat bugundan aynan shuncha
  // kun oldin/keyin qoladi (oy boshida ham "bajarilmagan" band bo'lishi uchun
  // pastki chegara qo'yilmaydi), faqat oy oxiridan oshmaydi.
  const anchorMonth = monthOf(b.anchor);
  const curMonth = monthOf(today);
  const kpi = b.kpi.map((k) => {
    const [ay, am] = anchorMonth.split('-').map(Number);
    const [py, pm] = k.period.split('-').map(Number);
    const period = addMonths(curMonth, (py - ay) * 12 + (pm - am));
    let deadline = shiftIso(k.deadline, shift);
    const end = `${period}-${String(lastDay(period)).padStart(2, '0')}`;
    if (deadline > end) deadline = end;
    return { ...k, period, deadline };
  });

  const loadcfg = { ...LC_DEFAULT_CFG, ...b.loadcfg };
  const items = lcBuildItems(b.plans, loadcfg);
  const alloc = { items: lcAllocate(items, b.teachers, normsOf(settings), loadcfg, {}), generatedAt: `${addDays(today, -27)}T09:47:00` };

  const state = {
    meta: { version: SEED_VERSION, demo: true, anchor: b.anchor, shift, seededAt: new Date().toISOString(), seedToday: today },
    settings,
    loadcfg,
    alloc,
    teachers: b.teachers,
    subjects: b.subjects,
    pubs,
    projects,
    stwork,
    kpi,
    plans: b.plans,
    attendance: genAttendance(b.teachers, settings, today, now),
    grades: genGrades(b.plans, settings, today),
    history: [],
    activity: [],
    benchmarks: [],
  };
  state.activity = genActivity(state, today);
  return state;
}

export const seedAnchor = () => base.anchor;
