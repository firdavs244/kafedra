import { describe, expect, it } from 'vitest';
import { buildSeed } from '../src/data/seed.js';
import { makeCtx, kpiOfMonth, kpiStatus, summary } from '../src/lib/analytics.js';
import { buildProposal, findTeachers, READ_TOOLS, runTool, TOOLS, toolDefs } from '../src/ai/tools.js';
import { selectTools, systemPrompt } from '../src/ai/agent.js';
import { buildCases, checkAnswer } from '../src/ai/benchmark.js';
import { buildReport, REPORT_KINDS, reportDigest } from '../src/lib/reports.js';

const ctx = makeCtx({ ...buildSeed('2026-09-29', '10:30'), rev: 1 }, { today: '2026-09-29', now: '10:30' });

describe('AI vositalari', () => {
  it('har bir o\'qish vositasi xatosiz ishlaydi va natija ixcham', () => {
    for (const name of READ_TOOLS) {
      const out = runTool(ctx, name, {});
      expect(out.xato, name).toBeUndefined();
      expect(JSON.stringify(out).length, name).toBeLessThan(9000);
    }
  });

  it('vosita raqamlari tahlil moduli bilan bir xil (bitta manba)', () => {
    const k = runTool(ctx, 'kpi', { holat: 'bajarilmadi' });
    const failed = kpiOfMonth(ctx).filter((x) => kpiStatus(ctx, x).key === 'failed');
    expect(k.qatorlar).toHaveLength(failed.length);
    expect(runTool(ctx, 'kafedra_holati').talabalar).toBe(summary(ctx).students);
  });

  it("ism bo'yicha o'qituvchini topadi (qo'shimchali shakl ham)", () => {
    expect(findTeachers(ctx, 'Rahimovning maqolalari')[0].id).toBe('t01');
    expect(findTeachers(ctx, 'Sobirova')[0].id).toBe('t08');
    expect(runTool(ctx, 'oqituvchilar', { ism: 'Yoqov' }).xato).toMatch(/topilmadi/);
  });

  it("noto'g'ri argumentga xato emas, tushuntirish qaytaradi", () => {
    expect(runTool(ctx, 'kpi', { oy: '2020-01' }).xato).toMatch(/kiritilmagan/);
    expect(runTool(ctx, 'yoq_vosita', {}).xato).toMatch(/Noma'lum/);
  });

  it("o'zgartirish taklifi faqat sxemadagi maydonlarni o'tkazadi", () => {
    const p = buildProposal(ctx, 'taklif_ozgartirish', { bolim: 'kpi', id: 'k03', ozgarishlar: { actual: 3, xavfli: 'x' }, izoh: 'fakt' });
    expect(p.changes).toEqual({ actual: 3 });
    expect(() => buildProposal(ctx, 'taklif_ozgartirish', { bolim: 'kpi', id: 'yoq', ozgarishlar: { actual: 1 } })).toThrow();
    const c = buildProposal(ctx, 'taklif_yangi', { bolim: 'pubs', malumot: { title: 'Yangi', teacherId: 'Rahimov', status: 'Reja' }, izoh: '' });
    expect(c.data.teacherId).toBe('t01');
  });

  it('savolga qarab kerakli vositalar tanlanadi (token tejash)', () => {
    expect(selectTools('Bu oy qaysi KPI bandlari bajarilmagan?')).toContain('kpi');
    expect(selectTools('Bugun kim kechikdi?')).toContain('davomat');
    expect(selectTools('Bugun kim kechikdi?')).not.toContain('loyihalar');
    expect(selectTools('KPI 1.3 faktini 3 ga o\'zgartir')).toContain('taklif_ozgartirish');
    expect(selectTools('Salom, nima qila olasan?').length).toBe(READ_TOOLS.length);
  });

  it("vosita ta'riflari va tizim ko'rsatmasi ixcham", () => {
    const all = JSON.stringify(toolDefs(Object.keys(TOOLS)));
    expect(all.length).toBeLessThan(7000);
    expect(systemPrompt(ctx, ['kpi']).length).toBeLessThan(2500);
  });
});

describe('agent sifati o\'lchovi', () => {
  const cases = buildCases(ctx);
  it("har bir nazorat savolining kutilgan javobi bor", () => {
    expect(cases.length).toBeGreaterThanOrEqual(15);
    for (const c of cases) expect(c.expect.length, c.id).toBeGreaterThan(0);
  });
  it("tekshiruvchi: raqam aniq so'z sifatida, familiya qo'shimchasi bilan ham", () => {
    const c = { expect: ['18', 'Ergashev'] };
    expect(checkAnswer('Kafedrada **18** nafar, Ergashevga eslatma', c)).toBe(true);
    expect(checkAnswer('Kafedrada 180 nafar, Ergashev', c)).toBe(false);
    expect(checkAnswer('jami 2 650 mln', { expect: ['2650'] })).toBe(true);
  });
  it("halollik: ma'lumot yo'qligini aytsa o'tadi, summa to'qisa o'tmaydi", () => {
    const c = { mode: 'refusal', expect: [] };
    expect(checkAnswer("Tizimda maosh haqida ma'lumot yo'q.", c)).toBe(true);
    expect(checkAnswer("O'rtacha maosh 5 400 000 so'm.", c)).toBe(false);
  });
});

describe('hisobotlar', () => {
  it("barcha turdagi hisobotlar quriladi va bo'sh emas", () => {
    for (const k of REPORT_KINDS) {
      const rep = buildReport(ctx, k.id, k.needs === 'teacher' ? 't01' : ctx.today.slice(0, 7));
      expect(rep, k.id).toBeTruthy();
      expect(rep.sections.length, k.id).toBeGreaterThan(1);
      expect(reportDigest(rep).length).toBeLessThanOrEqual(3502);
    }
  });
});
