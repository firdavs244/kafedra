// POST /api/transcribe — ovozli so'rovni matnga aylantirish (Groq Whisper, o'zbek tili).
import { GROQ_API, jsonError, models, originAllowed, rateLimited, requestKeys } from './_lib/groq.js';

const MAX_AUDIO = 4_000_000;
// Whisper'ga soha atamalarini oldindan aytib qo'yish imloni yaxshilaydi.
const HINT = "Kafedra, o'qituvchi, yuklama, KPI, maqola, Scopus, loyiha, grant, davomat, talaba, o'zlashtirish, semestr, hisobot.";

export async function POST(request) {
  if (!originAllowed(request)) return jsonError(403, 'forbidden_origin', 'Ruxsat etilmagan manba');
  if (rateLimited(request, 20)) return jsonError(429, 'rate_limited', "Juda ko'p so'rov.", { retryAfter: 30 });
  const keys = requestKeys(request);
  if (!keys.length) return jsonError(503, 'no_key', 'Serverda GROQ_API_KEY sozlanmagan.');

  let form;
  try {
    form = await request.formData();
  } catch {
    return jsonError(400, 'bad_form', 'Audio fayl topilmadi.');
  }
  const file = form.get('file');
  if (!file || typeof file === 'string') return jsonError(400, 'no_file', 'Audio fayl topilmadi.');
  if (file.size > MAX_AUDIO) return jsonError(413, 'too_large', 'Yozuv juda uzun (60 soniyagacha).');

  const out = new FormData();
  out.append('file', file, file.name || 'sorov.webm');
  out.append('model', models().stt);
  out.append('language', 'uz');
  out.append('response_format', 'json');
  out.append('temperature', '0');
  out.append('prompt', HINT);

  let last = 502;
  for (const key of keys) {
    try {
      const res = await fetch(`${GROQ_API}/audio/transcriptions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${key}` },
        body: out,
      });
      if (res.ok) {
        const j = await res.json();
        return Response.json({ text: String(j.text || '').trim() }, { headers: { 'cache-control': 'no-store' } });
      }
      last = res.status;
      if (res.status !== 429 && res.status !== 401 && res.status < 500) break;
    } catch {
      last = 502;
    }
  }
  if (last === 429) return jsonError(429, 'rate_limited', "Ovoz xizmati limiti to'ldi. Birozdan so'ng urinib ko'ring.", { retryAfter: 20 });
  return jsonError(502, 'upstream_error', "Ovozni matnga aylantirib bo'lmadi. Matn bilan yozing.");
}

export function GET() {
  return jsonError(405, 'method_not_allowed', "POST so'rovidan foydalaning.");
}
