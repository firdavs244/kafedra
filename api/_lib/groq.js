// Groq bilan ishlash uchun umumiy yordamchilar. Faqat serverda ishlaydi —
// kalit hech qachon brauzerga chiqmaydi. `_` bilan boshlangan papka Vercel'da
// alohida funksiya sifatida chiqmaydi.

export const GROQ_API = 'https://api.groq.com/openai/v1';

// 2026-09-29 da o'lchangan: qwen tool-calling + rasmni qo'llaydi, gpt-oss-120b
// faqat matn (rasmga 400 qaytaradi). gpt-oss-20b tool nomini buzib yubordi —
// shuning uchun ro'yxatda yo'q. Batafsil: docs/REJA.md "O'lchovlar".
const CAPS = {
  'qwen/qwen3.8-27b': { vision: true, tools: true, extra: {} },
  'openai/gpt-oss-120b': { vision: false, tools: true, extra: { reasoning_effort: 'low' } },
};

export function models() {
  return {
    primary: process.env.GROQ_MODEL_PRIMARY || 'qwen/qwen3.8-27b',
    fallback: process.env.GROQ_MODEL_FALLBACK || 'openai/gpt-oss-120b',
    stt: process.env.GROQ_MODEL_STT || 'whisper-large-v3-turbo',
  };
}

export function capsOf(model) {
  return CAPS[model] || { vision: false, tools: true, extra: {} };
}

export function serverKeys() {
  return String(process.env.GROQ_API_KEY || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// Foydalanuvchi Sozlamalarda o'z kalitini kiritgan bo'lsa — o'shani ishlatamiz
// (taqdimot paytida server kaliti limiti tugasa, zaxira yo'l).
export function requestKeys(request) {
  const own = (request.headers.get('x-groq-key') || '').trim();
  if (/^gsk_[A-Za-z0-9]{20,}$/.test(own)) return [own];
  return serverKeys();
}

export function originAllowed(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  let host;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  const reqHost = request.headers.get('x-forwarded-host') || request.headers.get('host');
  if (host === reqHost) return true;
  if (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return true;
  const allowed = String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return allowed.some((a) => a === origin || a === host);
}

// Eng oddiy himoya: bitta IP daqiqasiga N so'rovdan oshmasin (150 — taqdimotda butun
// xona bitta Wi-Fi IP'dan chiqadi, 40 kamlik qilardi). Serverless
// nusxalar orasida umumiy emas — bu to'liq himoya emas, suiiste'molni
// sekinlatadi xolos.
const hits = new Map();
export function rateLimited(request, limit = 150, windowMs = 60_000) {
  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'local';
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > limit;
}

export function jsonError(status, code, message, extra = {}) {
  return Response.json(
    { error: { code, message, ...extra } },
    { status, headers: { 'cache-control': 'no-store' } },
  );
}

function retryAfterOf(res, err) {
  const h = Number(res.headers.get('retry-after'));
  if (Number.isFinite(h) && h > 0) return Math.ceil(h);
  const m = String(err?.message || '').match(/try again in ([\d.]+)\s*(ms|s|m)/i);
  if (!m) return null;
  const v = Number(m[1]);
  return Math.max(1, Math.ceil(m[2] === 'ms' ? v / 1000 : m[2] === 'm' ? v * 60 : v));
}

/**
 * Groq'ga so'rov: har bir model uchun har bir kalit sinab ko'riladi.
 * 429/5xx/401 — keyingi kalit; kalitlar tugasa yoki model topilmasa — keyingi model.
 * Boshqa 400 — mijoz xatosi, qayta urinish foydasiz.
 */
export async function groqChat(payload, keys, candidates, fetchImpl = fetch) {
  let last = null;
  for (const model of candidates) {
    for (const key of keys) {
      let res;
      try {
        res = await fetchImpl(`${GROQ_API}/chat/completions`, {
          method: 'POST',
          headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
          body: JSON.stringify({ ...payload, model, ...capsOf(model).extra }),
        });
      } catch (e) {
        last = { status: 502, err: { message: String(e?.message || e) }, model };
        continue;
      }
      if (res.ok) return { res, model };
      const text = await res.text().catch(() => '');
      let err = {};
      try {
        err = JSON.parse(text).error || {};
      } catch {
        err = { message: text.slice(0, 300) };
      }
      last = { status: res.status, err, model, retryAfter: retryAfterOf(res, err) };
      if (res.status === 429 || res.status >= 500 || res.status === 401 || res.status === 403) continue;
      if (res.status === 404 || res.status === 413 || err.code === 'tool_use_failed' || err.code === 'model_decommissioned') break;
      return { error: last };
    }
  }
  return { error: last || { status: 503, err: { message: 'Model mavjud emas' } } };
}

export function upstreamError(e) {
  const s = e?.status || 502;
  const msg = e?.err?.message || '';
  if (s === 429) {
    const daily = /per day|RPD|TPD/i.test(msg);
    return jsonError(429, 'rate_limited', daily
      ? "Groq kunlik limiti tugadi. Sozlamalarda boshqa kalit kiriting yoki ertaga urinib ko'ring."
      : "AI limiti vaqtincha to'ldi (daqiqalik). Bir necha soniyadan so'ng qayta yuboring.",
    { retryAfter: e.retryAfter || (daily ? null : 20), daily, detail: msg.slice(0, 240) });
  }
  if (s === 401 || s === 403) return jsonError(401, 'bad_key', "Groq API kaliti noto'g'ri yoki muddati tugagan.");
  if (s === 413) return jsonError(413, 'too_large', "So'rov juda katta. Savolni qisqartiring yoki suhbatni tozalang.");
  if (s === 400) return jsonError(400, e?.err?.code || 'bad_request', msg || "So'rov rad etildi.");
  return jsonError(502, 'upstream_error', "AI xizmati javob bermadi. Qayta urinib ko'ring.", { detail: msg.slice(0, 200) });
}
