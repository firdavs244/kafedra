import { describe, expect, it } from 'vitest';
import base from '../src/data/seed-base.json';
import designer from './fixtures/designer-alloc.json';
import { lcAllocate, lcBuildItems, lcGroups, lcSummary, LC_DEFAULT_CFG, normsOf, allocToSubjects } from '../src/lib/workload.js';

const cfg = { ...LC_DEFAULT_CFG, ...base.loadcfg };
const norms = normsOf(base.settings);

describe("yuklama: dizayner prototipiga to'liq moslik", () => {
  const items = lcBuildItems(base.plans, cfg);

  it('ish rejalardan aynan 277 ta mashg\'ulot birligi hosil bo\'ladi', () => {
    expect(items.length).toBe(277);
    expect(items.length).toBe(designer.items.length);
  });

  it("birliklar id va soatlari prototip bilan bir xil", () => {
    const want = new Map(designer.items.map((i) => [i.id, i.hours]));
    for (const it of items) expect(want.get(it.id)).toBe(it.hours);
  });

  it("avtomatik taqsimlash prototip bilan bir xil o'qituvchilarni tanlaydi", () => {
    const res = lcAllocate(items, base.teachers, norms, cfg, {});
    const want = new Map(designer.items.map((i) => [i.id, i.teacherId]));
    const diff = res.filter((r) => want.get(r.id) !== r.teacherId);
    expect(diff).toEqual([]);
    expect(res.filter((r) => !r.teacherId).length).toBe(5);
  });

  it("ma'ruzani faqat professor/dotsent/katta o'qituvchi o'qiydi", () => {
    const res = lcAllocate(items, base.teachers, norms, cfg, {});
    const pos = new Map(base.teachers.map((t) => [t.id, t.position]));
    for (const r of res.filter((x) => x.kind === 'M' && x.teacherId)) {
      expect(['Professor', 'Dotsent', "Katta o'qituvchi"]).toContain(pos.get(r.teacherId));
    }
  });

  it("qo'lda biriktirilgan (pinned) birlik qayta taqsimlashda saqlanadi", () => {
    const first = lcAllocate(items, base.teachers, norms, cfg, {});
    const target = first.find((i) => i.kind === 'A');
    const other = base.teachers.find((t) => t.id !== target.teacherId && t.position === 'Assistent');
    const prev = { [target.id]: { teacherId: other.id, pinned: true } };
    const again = lcAllocate(items, base.teachers, norms, cfg, prev);
    expect(again.find((i) => i.id === target.id).teacherId).toBe(other.id);
  });

  it("jami soat = biriktirilgan + taqsimlanmagan", () => {
    const res = lcAllocate(items, base.teachers, norms, cfg, {});
    const s = lcSummary(res, base.teachers, norms);
    const assigned = s.rows.reduce((a, r) => a + r.total, 0);
    expect(Math.round(assigned + s.unassigned)).toBe(Math.round(s.total));
    expect(Math.round(s.h1 + s.h2)).toBe(Math.round(s.total));
  });

  it("taqsimot O'quv yuklama yozuvlariga soat yo'qotmasdan o'tadi", () => {
    const res = lcAllocate(items, base.teachers, norms, cfg, {});
    const subs = allocToSubjects(res, []);
    const sum = subs.reduce((a, s) => a + s.planHours, 0);
    const assigned = res.filter((r) => r.teacherId).reduce((a, r) => a + r.hours, 0);
    expect(Math.abs(sum - assigned)).toBeLessThan(subs.length);
  });

  it("guruh nomlari reja varag'idan tuziladi", () => {
    const p = base.plans.find((x) => x.id === 'pl01');
    expect(lcGroups(p)).toEqual(['ATT-25-01', 'ATT-25-02', 'ATT-25-03', 'ATT-25-04']);
    const m = base.plans.find((x) => x.id === 'pl02');
    expect(lcGroups(m)[0]).toBe('ATT-25-M01');
  });
});
