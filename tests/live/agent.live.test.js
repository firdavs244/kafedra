// Jonli integratsiya testi: brauzer mijozi → /api/chat → Groq → vositalar → javob.
// Kalit va limit sarflaydi, shuning uchun faqat so'ralganda ishlaydi:
//   GROQ_LIVE=1 npx vitest run tests/live
import { describe, expect, it } from 'vitest';
import { handleChat } from '../../api/chat.js';
import { buildSeed } from '../../src/data/seed.js';
import { makeCtx } from '../../src/lib/analytics.js';
import { runAgent } from '../../src/ai/agent.js';

const LIVE = !!process.env.GROQ_LIVE;
const realFetch = globalThis.fetch;

function routeFetch() {
  globalThis.fetch = async (url, init) => {
    if (typeof url === 'string' && url.startsWith('/api/chat')) {
      return handleChat(new Request('http://localhost/api/chat', { method: 'POST', headers: init.headers, body: init.body }), realFetch);
    }
    return realFetch(url, init);
  };
}

const QUESTIONS = (process.env.GROQ_Q || '').split('||').filter(Boolean);
const DEFAULT_Q = [
  "Bu oy kafedrada qaysi KPI bandlari bajarilmagan?",
  "Qaysi o'qituvchilarning ilmiy maqola rejasi ortda qolmoqda?",
  "Qaysi o'qituvchiga necha soat yuklama tushgan va qancha soat taqsimlanmagan?",
  "Bugun kim kechikdi yoki ishga kelmadi?",
];

describe.skipIf(!LIVE)('jonli agent (Groq)', () => {
  it('savollarga vositalar orqali javob beradi', async () => {
    routeFetch();
    const ctx = makeCtx({ ...buildSeed('2026-09-29', '10:30'), rev: 1 }, { today: '2026-09-29', now: '10:30' });
    const out = [];
    for (const q of QUESTIONS.length ? QUESTIONS : DEFAULT_Q) {
      const r = await runAgent({ question: q, ctx });
      out.push({ q, ms: r.ms, model: r.model, usage: r.usage, tools: r.trace.map((t) => `${t.name}(${t.args})`), text: r.text });
      expect(r.text.length).toBeGreaterThan(20);
      expect(r.trace.length).toBeGreaterThan(0);
    }
    if (process.env.GROQ_OUT) (await import("node:fs")).writeFileSync(process.env.GROQ_OUT, JSON.stringify(out, null, 1));
    console.log(JSON.stringify(out, null, 1));
  }, 240_000);
});

describe.skipIf(!LIVE)('jonli hujjat tahlili (Groq vision)', () => {
  it('namuna qaydnoma va ilmiy ishlar rasmidan jadvalni to\'g\'ri ajratadi', async () => {
    routeFetch();
    const fs = await import('node:fs');
    const { extractDocument } = await import('../../src/ai/vision.js');
    const { mapGrades, mapPubs, detectType } = await import('../../src/lib/docmap.js');
    const ctx = makeCtx({ ...buildSeed('2026-09-29', '10:30'), rev: 1 }, { today: '2026-09-29', now: '10:30' });
    const out = {};
    for (const f of ['qaydnoma-namuna.jpg', 'ilmiy-ishlar-namuna.jpg']) {
      const b64 = fs.readFileSync(`public/namuna/${f}`).toString('base64');
      const r = await extractDocument(`data:image/jpeg;base64,${b64}`, 'auto');
      const type = detectType(r.doc);
      out[f] = { ms: r.ms, model: r.model, type, doc: r.doc, mapped: type === 'qaydnoma' ? mapGrades(r.doc, ctx) : mapPubs(r.doc, ctx) };
      await new Promise((res) => setTimeout(res, 60_000)); // bepul tarif: daqiqasiga 1000 chiqish tokeni
    }
    if (process.env.GROQ_OUT) fs.writeFileSync(process.env.GROQ_OUT.replace('.json', '-vision.json'), JSON.stringify(out, null, 1));
    const g = out['qaydnoma-namuna.jpg'].mapped;
    expect(g.students).toBe(24);
    expect(g.counts).toEqual({ a: 6, b: 8, c: 6, f: 4 });
    expect(g.teacher?.id).toBe('t15');
    expect(g.existing).not.toBeNull();
    const p = out['ilmiy-ishlar-namuna.jpg'].mapped;
    expect(p.recs.length).toBe(5);
    expect(p.recs.filter((x) => x.ok).length).toBe(5);
  }, 400_000);
});
