// POST /api/chat — Groq chat completions uchun xavfsiz proksi.
// Brauzer tool-calling siklini o'zi yuritadi (ma'lumotlar brauzerda), server esa
// faqat kalitni yashiradi, modelni tanlaydi va limitda zaxira modelga o'tadi.
import {
  capsOf,
  groqChat,
  jsonError,
  models,
  originAllowed,
  rateLimited,
  requestKeys,
  upstreamError,
} from './_lib/groq.js';

const MAX_BODY = 4_000_000; // Vercel so'rov chegarasi 4.5 MB
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export async function handleChat(request, fetchImpl = fetch) {
  if (!originAllowed(request)) return jsonError(403, 'forbidden_origin', 'Ruxsat etilmagan manba');
  if (rateLimited(request)) {
    return jsonError(429, 'rate_limited', "Juda ko'p so'rov. Bir daqiqadan so'ng urinib ko'ring.", { retryAfter: 30 });
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY) return jsonError(413, 'too_large', "So'rov hajmi juda katta (rasmni kichraytiring).");
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return jsonError(400, 'bad_json', "So'rov JSON formatida emas.");
  }
  const { messages, tools, stream = false, response_format: responseFormat } = body || {};
  if (!Array.isArray(messages) || !messages.length || messages.length > 80) {
    return jsonError(400, 'bad_messages', "messages ro'yxati noto'g'ri.");
  }
  const keys = requestKeys(request);
  if (!keys.length) return jsonError(503, 'no_key', 'Serverda GROQ_API_KEY sozlanmagan.');

  const M = models();
  const known = [M.primary, M.fallback];
  const hasImage = messages.some(
    (m) => Array.isArray(m?.content) && m.content.some((p) => p?.type === 'image_url'),
  );
  let candidates = known.includes(body.model) ? [body.model, ...known] : known;
  candidates = [...new Set(candidates)].filter((m) => (!hasImage || capsOf(m).vision) && (!tools?.length || capsOf(m).tools));
  if (!candidates.length) return jsonError(400, 'no_model', "Bu so'rov uchun mos model yo'q.");

  const payload = {
    messages,
    temperature: clamp(Number(body.temperature ?? 0.2) || 0, 0, 1),
    max_tokens: clamp(Math.round(Number(body.max_tokens) || 700), 16, 2048),
    stream: !!stream,
  };
  if (Array.isArray(tools) && tools.length) {
    payload.tools = tools.slice(0, 24);
    payload.tool_choice = body.tool_choice === 'none' ? 'none' : 'auto';
  }
  if (responseFormat?.type === 'json_object') payload.response_format = { type: 'json_object' };

  const r = await groqChat(payload, keys, candidates, fetchImpl);
  if (r.error) return upstreamError(r.error);

  const headers = { 'x-model': r.model, 'cache-control': 'no-store' };
  if (payload.stream) {
    return new Response(r.res.body, {
      status: 200,
      headers: { ...headers, 'content-type': 'text/event-stream; charset=utf-8' },
    });
  }
  const data = await r.res.json();
  return Response.json(data, { headers });
}

export function POST(request) {
  return handleChat(request);
}

export function GET() {
  return jsonError(405, 'method_not_allowed', "POST so'rovidan foydalaning.");
}
