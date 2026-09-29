// Jonli sifat o'lchovi: /sifat sahifasidagi to'liq to'plamni Node'da ishga tushiradi
// (brauzer mijozi → /api/chat → Groq). Limit sarflaydi — faqat so'ralganda:
//   GROQ_LIVE=1 BENCH_OUT=natija.json npx vitest run tests/live/bench.live.test.js
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { handleChat } from '../../api/chat.js';
import { buildSeed } from '../../src/data/seed.js';
import { makeCtx } from '../../src/lib/analytics.js';
import { runAgent } from '../../src/ai/agent.js';
import { buildCases, checkAnswer } from '../../src/ai/benchmark.js';

const LIVE = !!process.env.GROQ_LIVE;
const realFetch = globalThis.fetch;

describe.skipIf(!LIVE)('agent sifati — to\'liq to\'plam', () => {
  it('17 nazorat savoli', async () => {
    globalThis.fetch = async (url, init) =>
      typeof url === 'string' && url.startsWith('/api/chat')
        ? handleChat(new Request('http://localhost/api/chat', { method: 'POST', headers: init.headers, body: init.body }), realFetch)
        : realFetch(url, init);
    const today = process.env.BENCH_DAY || new Date().toISOString().slice(0, 10);
    const ctx = makeCtx({ ...buildSeed(today, '11:00'), rev: 1 }, { today, now: '11:00' });
    const out = [];
    for (const c of buildCases(ctx)) {
      try {
        const r = await runAgent({ question: c.q, ctx, model: process.env.BENCH_MODEL || undefined });
        out.push({ id: c.id, area: c.area, q: c.q, expect: c.expect, ok: checkAnswer(r.text, c), ms: r.ms, model: r.model, tools: r.trace.map((t) => t.name), text: r.text });
      } catch (e) {
        out.push({ id: c.id, q: c.q, expect: c.expect, ok: false, error: String(e.message || e) });
      }
      await new Promise((res) => setTimeout(res, Number(process.env.BENCH_GAP || 4000)));
    }
    const done = out.filter((r) => !r.error);
    const res = { at: new Date().toISOString(), today, total: out.length, ok: out.filter((r) => r.ok).length, errors: out.length - done.length, avgMs: Math.round(done.reduce((a, r) => a + r.ms, 0) / Math.max(1, done.length)), maxMs: Math.max(0, ...done.map((r) => r.ms)), models: [...new Set(done.map((r) => r.model))], results: out };
    if (process.env.BENCH_OUT) fs.writeFileSync(process.env.BENCH_OUT, JSON.stringify(res, null, 1));
    expect(out.length).toBeGreaterThan(10);
  }, 1_200_000);
});
