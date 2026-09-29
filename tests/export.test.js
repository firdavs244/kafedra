import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { buildSeed } from '../src/data/seed.js';
import { makeCtx } from '../src/lib/analytics.js';
import { buildReport, REPORT_KINDS, reportFromMarkdown } from '../src/lib/reports.js';
import { buildWorkbook, reportSheets, reportToDocxBlob } from '../src/export/files.js';

const ctx = makeCtx({ ...buildSeed('2026-09-29', '10:30'), rev: 1 }, { today: '2026-09-29', now: '10:30' });

describe('Word va Excel fayllar', () => {
  it('har bir hisobot turi haqiqiy .docx (zip) faylga aylanadi', async () => {
    for (const k of REPORT_KINDS) {
      const rep = buildReport(ctx, k.id, k.needs === 'teacher' ? 't01' : '2026-09');
      const blob = await reportToDocxBlob(rep);
      const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
      expect(String.fromCharCode(...head), k.id).toBe('PK');
      expect(blob.size, k.id).toBeGreaterThan(5000);
    }
  });

  it('AI javobi (markdown jadval va ro\'yxat bilan) Word hujjatga aylanadi', async () => {
    const rep = reportFromMarkdown(ctx, 'KPI tahlili', 'Xulosa **qalin**.\n\n| Band | Holat |\n|---|---|\n| 1.2 | Bajarilmadi |\n\n**Tavsiyalar**\n1. Birinchi\n2. Ikkinchi', 'savol');
    const blob = await reportToDocxBlob(rep);
    expect(blob.size).toBeGreaterThan(5000);
  });

  it("Excel: har bir jadval alohida varaq, o'zbekcha matn buzilmaydi", async () => {
    const rep = buildReport(ctx, 'monthly', '2026-09');
    const wb = await buildWorkbook(reportSheets(rep));
    expect(wb.SheetNames[0]).toBe('Umumiy');
    expect(wb.SheetNames.length).toBeGreaterThan(3);
    const back = XLSX.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
    const txt = JSON.stringify(XLSX.utils.sheet_to_json(back.Sheets[back.SheetNames[1]], { header: 1 }));
    expect(txt).toContain("Ko'rsatkich");
    for (const n of back.SheetNames) expect(n.length).toBeLessThanOrEqual(31);
  });
});
