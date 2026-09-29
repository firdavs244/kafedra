// Kichik formatlash va matn yordamchilari.

export const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
export const round1 = (v) => Math.round(v * 10) / 10;

export function fmtNum(v) {
  const n = Math.round(num(v));
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

// "Rahimov Baxtiyor Oybekovich" → "Rahimov B.O."
export function shortName(n) {
  if (!n) return '—';
  const p = String(n).trim().split(/\s+/);
  if (p.length < 2) return n;
  return `${p[0]} ${p.slice(1, 3).map((x) => `${x[0]}.`).join('')}`;
}

// Qidiruv uchun: kichik harf, barcha apostrof turlari bitta, ortiqcha bo'shliqsiz.
export function norm(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[ʻʼ’‘`´]/g, "'")
    .replace(/o'|oʻ/g, "o'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchText(hay, needle) {
  const n = norm(needle);
  if (!n) return true;
  return norm(hay).includes(n);
}

export function uid(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function clampText(s, n) {
  const t = String(s ?? '');
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}
