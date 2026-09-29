// GET /api/health — AI tayyormi? ?ping=1 bo'lsa Groq'dan modellar ro'yxatini so'rab,
// kerakli modellar haqiqatan mavjudligini tekshiradi (HTTP 200 emas — ma'lumot).
import { GROQ_API, models, requestKeys, serverKeys } from './_lib/groq.js';

export async function GET(request) {
  const M = models();
  const keys = requestKeys(request);
  const out = {
    ok: true,
    keyConfigured: serverKeys().length > 0,
    usingOwnKey: !!request.headers.get('x-groq-key'),
    models: M,
    groq: null,
    time: new Date().toISOString(),
  };
  const ping = new URL(request.url).searchParams.get('ping') === '1';
  if (ping && keys.length) {
    try {
      const r = await fetch(`${GROQ_API}/models`, { headers: { authorization: `Bearer ${keys[0]}` } });
      if (r.ok) {
        const ids = new Set(((await r.json()).data || []).map((m) => m.id));
        out.groq = { ok: true, primary: ids.has(M.primary), fallback: ids.has(M.fallback), stt: ids.has(M.stt) };
      } else {
        out.groq = { ok: false, status: r.status };
      }
    } catch (e) {
      out.groq = { ok: false, error: String(e?.message || e).slice(0, 120) };
    }
  }
  return Response.json(out, { headers: { 'cache-control': 'no-store' } });
}
