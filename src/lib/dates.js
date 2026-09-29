// Sana bilan ishlash. Hamma sanalar "YYYY-MM-DD" satri; hisob mahalliy tush
// vaqtida (12:00) — yozgi vaqt o'tishi kun farqini buzmasin.
import { MONTHS, WEEKDAYS } from './constants.js';

export const pad = (n) => String(n).padStart(2, '0');
export const isISO = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

export function isoDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function todayISO(d = new Date()) {
  return isoDate(d);
}
export function nowHM(d = new Date()) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function parseISO(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12);
}
export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}
export function daysBetween(a, b) {
  return Math.round((parseISO(b) - parseISO(a)) / 864e5);
}
export const monthOf = (iso) => String(iso).slice(0, 7);
export function addMonths(ym, n) {
  let [y, m] = ym.split('-').map(Number);
  m += n;
  while (m > 12) { m -= 12; y += 1; }
  while (m < 1) { m += 12; y -= 1; }
  return `${y}-${pad(m)}`;
}
export const nextMonth = (ym) => addMonths(ym, 1);
export function lastDay(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}
export function monthDays(ym) {
  const n = lastDay(ym);
  return Array.from({ length: n }, (_, i) => `${ym}-${pad(i + 1)}`);
}
export const weekday = (iso) => parseISO(iso).getDay();
export const weekdayName = (iso) => WEEKDAYS[weekday(iso)];
export const toMin = (t) => {
  if (!t) return null;
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + (m || 0);
};
export const fromMin = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

export function fmtDate(s) {
  if (!isISO(s)) return '—';
  const [y, m, d] = s.split('-');
  return `${+d}-${MONTHS[+m - 1]}, ${y}`;
}
export function fmtShort(s) {
  if (!isISO(s)) return '—';
  const [y, m, d] = s.split('-');
  return `${d}.${m}.${y}`;
}
export function fmtMonth(p) {
  if (!p) return '—';
  const [y, m] = p.split('-');
  const n = MONTHS[+m - 1] || '';
  return `${n.charAt(0).toUpperCase()}${n.slice(1)} ${y}`;
}
export function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(+d)) return '—';
  return `${fmtShort(isoDate(d))} ${nowHM(d)}`;
}
export function fmtDur(min) {
  if (min == null || min < 0) return '—';
  return `${Math.floor(min / 60)} s ${pad(min % 60)} daq`;
}
export function relDays(n) {
  if (n === 0) return 'bugun';
  if (n === 1) return 'ertaga';
  if (n === -1) return 'kecha';
  return n > 0 ? `${n} kun qoldi` : `${-n} kun o'tdi`;
}
