import { describe, expect, it } from 'vitest';
import { buildSeed } from '../src/data/seed.js';
import { makeCtx, computeAlerts, kpiOfMonth, kpiStatus, summary, teacherStats } from '../src/lib/analytics.js';
import { attMonthStats, attTodaySummary } from '../src/lib/attendance.js';
import { addDays } from '../src/lib/dates.js';

const ctxFor = (today, now = '11:00') => makeCtx(buildSeed(today, now), { today, now });

describe('demo ma\'lumotlar har qanday kunda "tirik" ko\'rinadi', () => {
  // Taqdimot boshqa kunda bo'ladi — shu kunlarning har birida hikoya saqlanishi kerak
  const days = ['2026-09-29', '2026-10-02', '2026-10-13', '2026-10-21', '2026-11-05', '2026-12-01'];

  for (const today of days) {
    it(`${today}: KPI joriy oyda bor va hikoya saqlanadi`, () => {
      const ctx = ctxFor(today);
      const list = kpiOfMonth(ctx);
      expect(list.length).toBe(12);
      const st = list.map((k) => kpiStatus(ctx, k).key);
      expect(st.filter((s) => s === 'done').length).toBeGreaterThanOrEqual(3);
      expect(st.filter((s) => s === 'failed').length).toBeGreaterThanOrEqual(1);
      for (const k of list) expect(k.deadline.slice(0, 7) <= k.period).toBe(true);
    });

    it(`${today}: bugun ko'pchilik ishga kelgan, hamma "kelmagan" emas`, () => {
      const ctx = ctxFor(today);
      const { c } = attTodaySummary(ctx);
      if (c.off) return; // dam olish kuni
      expect(c.present + c.late).toBeGreaterThanOrEqual(12);
      expect(c.absent).toBeLessThanOrEqual(3);
    });

    it(`${today}: o'qituvchilar darsda umuman "ortda" emas (semestr ham surilgan)`, () => {
      const ctx = ctxFor(today);
      const behind = ctx.teachers.filter((t) => {
        const s = teacherStats(ctx, t);
        return s.expected >= 10 && s.loadPace < 0.65;
      });
      expect(behind.length).toBeLessThanOrEqual(4);
    });

    it(`${today}: ogohlantirishlar bor, lekin toshqin emas`, () => {
      const a = computeAlerts(ctxFor(today));
      expect(a.length).toBeGreaterThan(5);
      expect(a.length).toBeLessThan(45);
    });
  }

  it('bir kun uchun natija deterministik (qayta tiklash raqamlarni o\'zgartirmaydi)', () => {
    const a = buildSeed('2026-10-13', '11:00');
    const b = buildSeed('2026-10-13', '11:00');
    expect(JSON.stringify(a.attendance)).toBe(JSON.stringify(b.attendance));
    expect(JSON.stringify(a.grades)).toBe(JSON.stringify(b.grades));
  });

  it("kechikuvchi profil ishlaydi: Ergashev oyda bir necha marta kechikadi", () => {
    const ctx = ctxFor('2026-10-27');
    const s = attMonthStats(ctx, '2026-10', 't05');
    expect(s.late).toBeGreaterThanOrEqual(2);
  });

  it("kontingent: guruhlar va talabalar ish rejalardan hisoblanadi", () => {
    const s = summary(ctxFor('2026-10-13'));
    expect(s.groups).toBe(25);
    expect(s.students).toBe(670);
    expect(s.teachers).toBe(18);
  });

  it("o'zlashtirish ma'lumoti va qarzdorlar bor", () => {
    const st = buildSeed('2026-10-13');
    expect(st.grades.length).toBeGreaterThan(40);
    const debt = st.grades.reduce((a, g) => a + g.f, 0);
    expect(debt).toBeGreaterThan(20);
    for (const g of st.grades) expect(g.a + g.b + g.c + g.f).toBe(g.students);
    expect(st.grades[0].retakeDeadline).toBe(addDays('2026-10-13', 12));
  });
});
