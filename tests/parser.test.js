import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { lcBuildItems, lcIsOurs, parsePlanWorkbook, LC_DEFAULT_CFG } from '../src/lib/workload.js';

describe("ishchi o'quv reja parseri (namuna .xlsx)", () => {
  const wb = XLSX.read(fs.readFileSync('public/namuna/ish-reja-namuna.xlsx'), { type: 'buffer' });
  const { plans, skipped } = parsePlanWorkbook(XLSX, wb, 'ish-reja-namuna.xlsx', '2026-2027');

  it('kurs, yil, yo\'nalish va ta\'lim shaklini sarlavhadan oladi', () => {
    expect(skipped).toEqual([]);
    expect(plans).toHaveLength(1);
    const p = plans[0];
    expect(p.kurs).toBe(1);
    expect(p.year).toBe('2026-2027');
    expect(p.specCode).toBe('60610300');
    expect(p.specName).toBe('Dasturiy injiniring');
    expect(p.form).toBe('Kunduzgi');
  });

  it('fanlar, semestr soatlari, kurs ishi va muqobil tanlov fanini ajratadi', () => {
    const p = plans[0];
    const das = p.subjects.find((s) => s.name === 'Dasturlash asoslari');
    expect(das.sem).toEqual({ 1: [30, 0, 46, 0], 2: [30, 0, 46, 0] });
    expect(das.ki).toBe(true);
    const py = p.subjects.find((s) => s.name === 'Python dasturlash tili');
    expect(py.block).toBe('Tanlov');
    expect(py.alts).toEqual(['Java dasturlash tili']);
    expect(p.subjects).toHaveLength(9);
  });

  it("kafedra fanlarini boshqa kafedra fanlaridan ajratadi", () => {
    const ours = plans[0].subjects.filter((s) => lcIsOurs(s.name)).map((s) => s.name);
    expect(ours).toContain('Dasturlash asoslari');
    expect(ours).toContain("Algoritmlar va ma'lumotlar tuzilmasi");
    expect(ours).not.toContain('Oliy matematika');
    expect(ours).not.toContain("O'zbekiston tarixi");
    expect(ours).not.toContain('Xorijiy til');
  });

  it("boshqa o'quv yili uchun reja o'tkazib yuboriladi", () => {
    const r = parsePlanWorkbook(XLSX, wb, 'x.xlsx', '2027-2028');
    expect(r.plans).toHaveLength(0);
    expect(r.skipped[0].reason).toMatch(/2026-2027/);
  });

  it("yuklangan reja yuklama birliklariga aylanadi", () => {
    const items = lcBuildItems([{ ...plans[0], id: 'plX', active: true, groups: 2, students: 25 }], LC_DEFAULT_CFG);
    const total = items.reduce((a, i) => a + i.hours, 0);
    expect(items.some((i) => i.group === 'DI-26-01')).toBe(true);
    expect(items.some((i) => i.kind === 'KI')).toBe(true);
    expect(total).toBeGreaterThan(900);
  });
});
