import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handleChat } from '../api/chat.js';
import { groqChat } from '../api/_lib/groq.js';

const req = (body, headers = {}) =>
  new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost', host: 'localhost', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const okRes = (model) => new Response(JSON.stringify({ model, choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }] }), { status: 200 });
const errRes = (status, message = 'x', code) => new Response(JSON.stringify({ error: { message, code } }), { status });

describe('/api/chat proksi', () => {
  let saved;
  beforeEach(() => {
    saved = process.env.GROQ_API_KEY;
    process.env.GROQ_API_KEY = 'gsk_test_key_aaaaaaaaaaaaaaaaaaaaaaa';
  });
  afterEach(() => {
    process.env.GROQ_API_KEY = saved;
  });

  it('kalit yo\'q bo\'lsa — tushunarli 503', async () => {
    process.env.GROQ_API_KEY = '';
    const r = await handleChat(req({ messages: [{ role: 'user', content: 'salom' }] }), async () => okRes('x'));
    expect(r.status).toBe(503);
    expect((await r.json()).error.code).toBe('no_key');
  });

  it("noto'g'ri JSON va bo'sh messages rad etiladi", async () => {
    expect((await handleChat(req('{bad'), async () => okRes('x'))).status).toBe(400);
    expect((await handleChat(req({ messages: [] }), async () => okRes('x'))).status).toBe(400);
  });

  it('begona saytdan kelgan so\'rov rad etiladi', async () => {
    const r = await handleChat(req({ messages: [{ role: 'user', content: 'a' }] }, { origin: 'https://evil.example' }), async () => okRes('x'));
    expect(r.status).toBe(403);
  });

  it('asosiy model limitga ursa — zaxira modelga o\'tadi', async () => {
    const seen = [];
    const fetchImpl = async (url, init) => {
      const m = JSON.parse(init.body).model;
      seen.push(m);
      return m === 'qwen/qwen3.8-27b' ? errRes(429, 'Rate limit reached. Please try again in 7.5s') : okRes(m);
    };
    const r = await handleChat(req({ messages: [{ role: 'user', content: 'salom' }] }), fetchImpl);
    expect(r.status).toBe(200);
    expect(r.headers.get('x-model')).toBe('openai/gpt-oss-120b');
    expect(seen).toEqual(['qwen/qwen3.8-27b', 'openai/gpt-oss-120b']);
  });

  it("rasmli so'rov faqat rasmni tushunadigan modelga ketadi", async () => {
    const seen = [];
    const fetchImpl = async (url, init) => {
      seen.push(JSON.parse(init.body).model);
      return errRes(429, 'try again in 12s');
    };
    const r = await handleChat(req({ messages: [{ role: 'user', content: [{ type: 'text', text: 'a' }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAA' } }] }] }), fetchImpl);
    expect(seen).toEqual(['qwen/qwen3.8-27b']);
    expect(r.status).toBe(429);
    const j = await r.json();
    expect(j.error.code).toBe('rate_limited');
    expect(j.error.retryAfter).toBe(12);
  });

  it("max_tokens chegaralanadi va model ro'yxatdan tashqari tanlanmaydi", async () => {
    let body;
    const r = await handleChat(req({ messages: [{ role: 'user', content: 'a' }], max_tokens: 999999, model: 'boshqa/model' }), async (u, init) => {
      body = JSON.parse(init.body);
      return okRes(body.model);
    });
    expect(r.status).toBe(200);
    expect(body.max_tokens).toBe(2048);
    expect(body.model).toBe('qwen/qwen3.8-27b');
  });

  it('kunlik limit alohida xabar bilan qaytadi', async () => {
    const r = await groqChat({ messages: [] }, ['k'], ['m1'], async () => errRes(429, 'Rate limit reached on requests per day (RPD)'));
    expect(r.error.status).toBe(429);
  });
});
