import { describe, expect, it } from 'vitest';
import { inlineRuns, mdBlocks, mdToHTML } from '../src/lib/markdown.js';
import { reportHTML } from '../src/export/html.js';

describe('markdown va hisobot HTML xavfsizligi', () => {
  it('AI javobidagi HTML/skript bajarilmaydi (avval ekranlanadi)', () => {
    const html = mdToHTML('Salom <img src=x onerror=alert(1)> **qalin** <script>alert(1)</script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('<strong>qalin</strong>');
  });

  it('jadval, ro\'yxat va sarlavhalarni taniydi', () => {
    const b = mdBlocks('## Xulosa\nMatn\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n- bir\n- ikki\n\n1. birinchi\n2. ikkinchi');
    expect(b.map((x) => x.type)).toEqual(['h', 'p', 'table', 'ul', 'ol']);
    expect(b[2].rows).toEqual([['1', '2']]);
  });

  it("Word uchun qalin/kursiv bo'laklar", () => {
    expect(inlineRuns('a **b** *c*')).toEqual([{ text: 'a ' }, { text: 'b', bold: true }, { text: ' ' }, { text: 'c', italics: true }]);
  });

  it("hisobot HTMLidagi ma'lumot satrlari ham ekranlanadi", () => {
    const html = reportHTML({ title: '<b>x</b>', org: [], date: '2026-09-29', sections: [{ heading: 'H', table: { head: ['<i>'], rows: [['<script>']] } }] });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>x</b>');
  });
});
