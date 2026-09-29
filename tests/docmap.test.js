import { describe, expect, it } from 'vitest';
import { buildSeed } from '../src/data/seed.js';
import { makeCtx } from '../src/lib/analytics.js';
import { detectType, mapGrades, mapPubs, matchTeacher, parseDate, similar, toGrade } from '../src/lib/docmap.js';

const ctx = makeCtx({ ...buildSeed('2026-09-29', '10:00'), rev: 1 }, { today: '2026-09-29', now: '10:00' });

describe('rasmdan olingan jadvalni tizimga bog\'lash', () => {
  it('baholarni normallashtiradi (so\'z, 5 balli, 100 balli)', () => {
    expect(toGrade("a'lo")).toBe(5);
    expect(toGrade('yaxshi')).toBe(4);
    expect(toGrade('qoniqarli')).toBe(3);
    expect(toGrade('qoniqarsiz')).toBe(2);
    expect(toGrade('4')).toBe(4);
    expect(toGrade('91')).toBe(5);
    expect(toGrade('71')).toBe(4);
    expect(toGrade('55')).toBe(3);
    expect(toGrade('38')).toBe(2);
    expect(toGrade('')).toBe(null);
  });

  it("o'qituvchini familiya va ism bosh harfi bo'yicha topadi", () => {
    expect(matchTeacher(ctx.teachers, 'Ismoilov A.R.')?.id).toBe('t15');
    expect(matchTeacher(ctx.teachers, "Jo'rayev B.N.")?.id).toBe('t11');
    expect(matchTeacher(ctx.teachers, 'Nomalum X.')).toBe(null);
  });

  it("OCR xatosiga chidamli: 'Algoritmalar' ≈ 'Algoritmlar'", () => {
    expect(similar("Algoritmalar va ma'lumotlar tuzilmasi", "Algoritmlar va ma'lumotlar tuzilmasi")).toBeGreaterThan(0.9);
    expect(similar('Web texnologiyalar', "Ma'lumotlar bazasi")).toBeLessThan(0.5);
  });

  it('sanani dd.mm.yyyy dan ISO ga o\'giradi', () => {
    expect(parseDate('05.11.2026')).toBe('2026-11-05');
    expect(parseDate('2027-02-28')).toBe('2027-02-28');
    expect(parseDate('—')).toBe('');
  });

  it('qaydnoma: baholarni sanaydi va mavjud yozuvni topadi', () => {
    const doc = {
      hujjat_turi: 'Yakuniy nazorat qaydnomasi',
      meta: { fan: "Algoritmalar va ma'lumotlar tuzilmasi", guruh: 'ATT-25-02', oqituvchi: 'Ismoilov A.R.' },
      ustunlar: ['No', 'Talabaning F.I.Sh.', 'Ball', 'Baho'],
      qatorlar: [
        ['1', 'Aliyev Aziz', '91', "a'lo"],
        ['2', 'Karimova Madina', '78', 'yaxshi'],
        ['3', 'Rashidov Bekzod', '45', 'qoniqarsiz'],
        ['4', 'Sodiqov Jasur', '67', 'qoniqarli'],
      ],
    };
    expect(detectType(doc)).toBe('qaydnoma');
    const m = mapGrades(doc, ctx);
    expect(m.counts).toEqual({ a: 1, b: 1, c: 1, f: 1 });
    expect(m.debtors).toEqual(['Rashidov Bekzod']);
    expect(m.teacher.id).toBe('t15');
    expect(m.existing).not.toBeNull();
    expect(m.subjectFixed).toBe("Algoritmlar va ma'lumotlar tuzilmasi");
    expect(m.problems).toEqual([]);
  });

  it("ilmiy ishlar ro'yxati: tur, holat va muallifni bog'laydi", () => {
    const doc = {
      hujjat_turi: 'ilmiy_ishlar',
      ustunlar: ['No', 'Muallif', 'Maqola mavzusi', 'Jurnal / nashr', 'Turi', 'Holati', 'Muddat'],
      qatorlar: [
        ['1', 'Hamroyeva Sh.I.', 'Yangi maqola', 'Applied Sciences', 'Scopus', 'Yozilmoqda', '15.12.2026'],
        ['2', "Noma'lum A.", 'Boshqa maqola', 'TATU', 'OAK jurnali', 'Reja', '20.11.2026'],
      ],
    };
    const { recs } = mapPubs(doc, ctx);
    expect(recs[0].ok).toBe(true);
    expect(recs[0].rec).toMatchObject({ teacherId: 't10', type: 'Scopus', status: 'Yozilmoqda', deadline: '2026-12-15' });
    expect(recs[1].ok).toBe(false);
  });
});
