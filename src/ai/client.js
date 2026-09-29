// /api/chat bilan ishlaydigan mijoz: oqimli (SSE) javobni o'qiydi, tool_call
// bo'laklarini yig'adi va xatolarni tushunarli o'zbekcha xabarga aylantiradi.

const KEY_STORAGE = 'ka_groq_key';

export function getOwnKey() {
  try {
    return localStorage.getItem(KEY_STORAGE) || '';
  } catch {
    return '';
  }
}
export function setOwnKey(k) {
  try {
    if (k) localStorage.setItem(KEY_STORAGE, k);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* e'tiborsiz */
  }
}

export class AIError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    Object.assign(this, extra);
  }
}

const MESSAGES = {
  rate_limited: "AI limiti vaqtincha to'ldi. Bir necha soniyadan so'ng qayta yuboring.",
  no_key: 'Serverda Groq API kaliti sozlanmagan. Sozlamalar → AI bo\'limida o\'z kalitingizni kiriting.',
  bad_key: "Groq API kaliti noto'g'ri yoki muddati tugagan. Sozlamalarda yangi kalit kiriting.",
  too_large: "So'rov juda katta. Suhbatni tozalab, savolni qisqaroq bering.",
  network: "Internet aloqasi yo'q yoki server javob bermadi.",
  upstream_error: "AI xizmati javob bermadi. Qayta urinib ko'ring.",
};

function headers() {
  const h = { 'content-type': 'application/json' };
  const k = getOwnKey();
  if (k) h['x-groq-key'] = k;
  return h;
}

async function asError(res) {
  let j = {};
  try {
    j = await res.json();
  } catch {
    /* bo'sh */
  }
  const e = j.error || {};
  const code = e.code || (res.status === 429 ? 'rate_limited' : res.status === 401 ? 'bad_key' : 'upstream_error');
  return new AIError(code, e.message || MESSAGES[code] || `Xato ${res.status}`, { status: res.status, retryAfter: e.retryAfter ?? null, daily: !!e.daily });
}

/**
 * @returns {Promise<{message:{role,content,tool_calls?}, usage, model, finish, ms}>}
 */
export async function chatCompletion({ messages, tools, toolChoice, stream = true, maxTokens = 700, temperature = 0.2, responseFormat, signal, onDelta }) {
  const t0 = performance.now();
  let res;
  try {
    res = await fetch('/api/chat', {
      method: 'POST',
      headers: headers(),
      signal,
      body: JSON.stringify({
        messages,
        tools: tools?.length ? tools : undefined,
        tool_choice: toolChoice,
        stream,
        max_tokens: maxTokens,
        temperature,
        response_format: responseFormat,
      }),
    });
  } catch (e) {
    if (signal?.aborted) throw new AIError('cancelled', "To'xtatildi");
    throw new AIError('network', MESSAGES.network);
  }
  if (!res.ok) throw await asError(res);
  const model = res.headers.get('x-model') || '';

  if (!stream) {
    const j = await res.json();
    const ch = j.choices?.[0] || {};
    return { message: ch.message || { role: 'assistant', content: '' }, usage: j.usage || null, model: model || j.model, finish: ch.finish_reason, ms: performance.now() - t0 };
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let content = '';
  const calls = [];
  let finish = null;
  let usage = null;
  const handle = (data) => {
    if (data === '[DONE]') return;
    let j;
    try {
      j = JSON.parse(data);
    } catch {
      return;
    }
    if (j.error) throw new AIError(j.error.code || 'upstream_error', j.error.message || MESSAGES.upstream_error);
    const ch = j.choices?.[0];
    const d = ch?.delta || {};
    if (d.content) {
      content += d.content;
      onDelta?.(content, calls.length > 0);
    }
    if (Array.isArray(d.tool_calls)) {
      for (const tc of d.tool_calls) {
        const i = tc.index ?? calls.length;
        if (!calls[i]) calls[i] = { id: '', type: 'function', function: { name: '', arguments: '' } };
        if (tc.id) calls[i].id = tc.id;
        if (tc.function?.name) calls[i].function.name += tc.function.name;
        if (tc.function?.arguments) calls[i].function.arguments += tc.function.arguments;
      }
    }
    if (ch?.finish_reason) finish = ch.finish_reason;
    if (j.x_groq?.usage) usage = j.x_groq.usage;
    if (j.usage) usage = j.usage;
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (line.startsWith('data:')) handle(line.slice(5).trim());
      }
    }
    if (buf.trim().startsWith('data:')) handle(buf.trim().slice(5).trim());
  } catch (e) {
    if (signal?.aborted) throw new AIError('cancelled', "To'xtatildi", { partial: content });
    if (e instanceof AIError) throw e;
    throw new AIError('network', MESSAGES.network, { partial: content });
  }
  const toolCalls = calls.filter((c) => c && c.function.name);
  toolCalls.forEach((c, i) => {
    if (!c.id) c.id = `call_${i}_${Date.now().toString(36)}`;
  });
  return {
    message: { role: 'assistant', content, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) },
    usage,
    model,
    finish,
    ms: performance.now() - t0,
  };
}

// 429 bo'lsa, server aytgan vaqtcha kutib bir marta qayta urinadi (daqiqalik limit uchun).
export async function withRetry(fn, { onWait, signal, maxWait = 25, retries = 1 } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= retries || e?.code !== 'rate_limited' || e.daily || !e.retryAfter || e.retryAfter > maxWait) throw e;
      for (let s = Math.ceil(e.retryAfter); s > 0; s -= 1) {
        if (signal?.aborted) throw new AIError('cancelled', "To'xtatildi");
        onWait?.(s);
        await new Promise((r) => setTimeout(r, 1000));
      }
      onWait?.(0);
    }
  }
}

export async function transcribe(blob) {
  const fd = new FormData();
  const ext = /mp4|m4a|aac/.test(blob.type) ? 'm4a' : /ogg/.test(blob.type) ? 'ogg' : 'webm';
  fd.append('file', blob, `sorov.${ext}`);
  const h = {};
  const k = getOwnKey();
  if (k) h['x-groq-key'] = k;
  let res;
  try {
    res = await fetch('/api/transcribe', { method: 'POST', body: fd, headers: h });
  } catch {
    throw new AIError('network', MESSAGES.network);
  }
  if (!res.ok) throw await asError(res);
  return (await res.json()).text || '';
}

export async function health(ping = false) {
  const res = await fetch(`/api/health${ping ? '?ping=1' : ''}`, { headers: headers() });
  if (!res.ok) throw await asError(res);
  return res.json();
}

export function errorText(e) {
  if (!e) return "Noma'lum xato";
  if (e.code === 'cancelled') return '';
  return e.message || MESSAGES[e.code] || "Noma'lum xato";
}
