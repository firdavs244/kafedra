// KafedraAgent: savol → kerakli vositalarni tanlash → model vositani chaqiradi →
// brauzer vositani mahalliy ma'lumotda bajaradi → model natijani o'zbekcha
// tushuntiradi. Har qadam `trace`ga yoziladi (javob ostida "manbalar").
import { fmtDate } from '../lib/dates.js';
import { norm, shortName } from '../lib/format.js';
import { currentSemester } from '../lib/analytics.js';
import { SCHEMA, PUB_STATUS, PROJ_STATUS, ST_STATUS } from '../lib/constants.js';
import { AIError, chatCompletion, withRetry } from './client.js';
import { READ_TOOLS, runTool, summarizeArgs, TOOLS, toolDefs } from './tools.js';

// Savoldagi so'zlarga qarab faqat kerakli vositalarni yuboramiz: har bir vosita
// ta'rifi token yeydi, bepul limit esa daqiqasiga 8000 token.
const ROUTES = [
  [/kpi|ko.rsatkich|band(i|lar)?\b/, ['kpi']],
  [/yuklama|soat|taqsim|stavka|me.yor|potok|ma.ruza|amaliy|laborator/, ['yuklama_taqsimoti', 'dars_bajarilishi']],
  [/\bfan|kurs\b|\d\s*-\s*kurs|semestr|o.quv reja|ish reja|kuzgi|bahorgi/, ['oquv_reja', 'dars_bajarilishi']],
  [/maqola|ilmiy|scopus|oak|nashr|jurnal|monograf|darslik|qo.llanma|konferens|wos|web of|chop/, ['ilmiy_ishlar']],
  [/loyiha|grant|startap|moliya|mablag|shartnoma|erasmus/, ['loyihalar']],
  [/davomat|kechik|kelma|keldi|ketdi|ishga|sababli|tabel|intizom|kasal|safar|kelgan/, ['davomat']],
  [/talaba|guruh|o.zlashtir|baho|qarzdor|sifat|sessiya|imtihon|nazorat|att-|ax-|si-/, ['ozlashtirish', 'talabalar_bilan_ish']],
  [/bmi|dissertats|olimpiad|to.garak|kurs ishi|bitiruv|magistr/, ['talabalar_bilan_ish']],
  [/muddat|deadline|yaqin|kun ichida|haftada|tugaydi|kechikkan/, ['muddatlar']],
  [/hisobot|tahlil|umumiy|holat|brifing|majlis|tavsiya|muammo|xulosa|reyting|eng yaxshi|kuchli|zaif|nima qilish/, ['ogohlantirishlar', 'oqituvchilar', 'kpi', 'muddatlar']],
];
const WRITE_RE = /o.zgartir|qo.sh|yangila|belgila|kirit|tuzat|yozib qo|\bo.chir|saqla|ko.chir|fakt(ini)? .*(qil|et)|holat(ini)? .*(qil|o.tkaz)/;
const BASE = ['kafedra_holati', 'oqituvchilar'];

export function selectTools(question) {
  const q = norm(question);
  const set = new Set(BASE);
  let hit = false;
  for (const [re, names] of ROUTES) {
    if (re.test(q)) {
      names.forEach((n) => set.add(n));
      hit = true;
    }
  }
  if (!hit) READ_TOOLS.forEach((n) => set.add(n));
  if (WRITE_RE.test(q)) {
    set.add('taklif_ozgartirish');
    set.add('taklif_yangi');
  }
  return [...set];
}

export function systemPrompt(ctx, toolNames) {
  const s = ctx.settings;
  const writes = toolNames.some((n) => TOOLS[n]?.proposal);
  const fields = writes
    ? `\nTaklif maydonlari: ${['teachers', 'subjects', 'pubs', 'projects', 'stwork', 'kpi'].map((c) => `${c}(${SCHEMA[c].fields.map((f) => f.k).join(',')})`).join('; ')}. Holatlar: pubs ${PUB_STATUS.join('/')}; projects ${PROJ_STATUS.join('/')}; stwork ${ST_STATUS.join('/')}. O'qituvchi maydonlariga id yoz.`
    : '';
  return `Sen — KafedraAgent, «${s.name}» mudirining AI yordamchisisan${s.university ? ` (${s.university})` : ''}.
Bugun: ${fmtDate(ctx.today)}, soat ${ctx.now}. O'quv yili ${s.year}, ${currentSemester(ctx)}-semestr.
O'qituvchilar: ${ctx.teachers.map((t) => shortName(t.name)).join(', ')}.

QOIDALAR:
1. Faqat o'zbek tilida (lotin yozuvi) javob ber.
2. Har bir raqam, ism, sana va ro'yxatni FAQAT vositalar natijasidan ol. Hech narsani taxmin qilma va o'ylab topma. Jami sonni natijadagi "jami"/"jami_qatorlar" maydonidan ol — qatorlarni o'zing sanama va qo'shma. Bir nechta teng qiymat bo'lsa, hammasini ayt. Kerakli ma'lumot yo'q bo'lsa, shuni ochiq ayt va qaysi bo'limga kiritish kerakligini ko'rsat.
3. Kerakli vositalarni bir vaqtda chaqir. Bir vositani bir xil argument bilan qayta chaqirma. Kafedra bo'yicha umumiy son (o'qituvchi, talaba, guruh, loyiha) so'ralsa — kafedra_holati natijasidagi tayyor sondan foydalan.
4. Javob tuzilishi: 1–2 jumlali aniq xulosa → tafsilot (qisqa ro'yxat yoki markdown jadval, 12 qatordan oshmasin; ko'p bo'lsa eng muhimlarini ko'rsat va qolganini jami bilan ayt) → agar savol tahliliy bo'lsa, "**Tavsiyalar**" (2–4 ta, mas'ul shaxs bilan). Hajmi 250 so'zdan oshmasin.
5. Ismlarni "Familiya I.O." shaklida, oylarni so'z bilan (masalan "sentyabr") yoz. Uslub — ishchan, hurmatli, kirish so'zlarisiz. "ichki_id" va vosita nomlarini javobda HECH QACHON ko'rsatma; jadval sarlavhalarini oddiy o'zbekcha so'z bilan yoz.
6. Ma'lumotni o'zgartirish/qo'shish so'ralsa — taklif_* vositasi bilan TAKLIF tayyorla va "tasdiqlash uchun taklif tayyor" de; "saqlandi" dema.${fields}`;
}

const MAX_ROUNDS = 4;
const TOOL_OUT_LIMIT = 7000;

function clip(obj) {
  const s = JSON.stringify(obj);
  return s.length > TOOL_OUT_LIMIT ? `${s.slice(0, TOOL_OUT_LIMIT)}…(qisqartirildi)` : s;
}

/**
 * @param {object} p
 * @param {string} p.question
 * @param {Array}  p.history  [{role, content}] — oldingi savol-javoblar (matn)
 * @param {object} p.ctx      makeCtx natijasi (joriy ma'lumotlar)
 * @param {(ev)=>void} p.onUpdate  {text, trace, status, wait}
 */
export async function runAgent({ question, history = [], ctx, onUpdate, onProposal, signal, maxTokens = 1000, model: wantModel }) {
  const t0 = performance.now();
  const names = selectTools(question);
  const tools = toolDefs(names);
  const messages = [{ role: 'system', content: systemPrompt(ctx, names) }, ...history, { role: 'user', content: question }];
  const trace = [];
  const usage = { prompt: 0, completion: 0 };
  let model = '';
  let text = '';
  let truncated = false;
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const last = round === MAX_ROUNDS - 1;
    onUpdate?.({ text: '', trace, status: round === 0 ? 'thinking' : 'writing' });
    const r = await withRetry(
      () => chatCompletion({
        messages,
        tools,
        toolChoice: last ? 'none' : undefined,
        maxTokens,
        signal,
        model: wantModel,
        onDelta: (t, hasTools) => {
          if (!hasTools) onUpdate?.({ text: t, trace, status: 'streaming' });
        },
      }),
      { signal, maxWait: 40, retries: 2, onWait: (s) => onUpdate?.({ text: '', trace, status: 'waiting', wait: s }) },
    );
    model = r.model || model;
    if (r.usage) {
      usage.prompt += r.usage.prompt_tokens || 0;
      usage.completion += r.usage.completion_tokens || 0;
    }
    const calls = r.message.tool_calls || [];
    if (calls.length && !last) {
      messages.push({ role: 'assistant', content: r.message.content || '', tool_calls: calls });
      for (const c of calls) {
        let args = {};
        try {
          args = JSON.parse(c.function.arguments || '{}') || {};
        } catch {
          args = {};
        }
        const out = runTool(ctx, c.function.name, args, { onProposal });
        trace.push({ name: c.function.name, label: TOOLS[c.function.name]?.label || c.function.name, args: summarizeArgs(args), error: out?.xato || null });
        messages.push({ role: 'tool', tool_call_id: c.id, content: clip(out) });
      }
      onUpdate?.({ text: '', trace, status: 'tools' });
      continue;
    }
    text = (r.message.content || '').trim();
    truncated = r.finish === 'length';
    break;
  }
  if (!text) throw new AIError('empty', "Model javob qaytarmadi. Savolni boshqacha ifodalab ko'ring.");
  return { text, trace, model, usage, truncated, ms: Math.round(performance.now() - t0) };
}

// Bir martalik matn so'rovi (vositasiz) — hisobot xulosasi, brifing, majlis kun tartibi
export async function askText({ system, prompt, maxTokens = 600, signal, onDelta, onWait }) {
  const t0 = performance.now();
  const r = await withRetry(
    () => chatCompletion({ messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }], maxTokens, signal, onDelta, temperature: 0.3 }),
    { signal, onWait },
  );
  return { text: (r.message.content || '').trim(), model: r.model, ms: Math.round(performance.now() - t0), usage: r.usage };
}

/* ---------------- javoblar keshi ---------------- */
const CACHE_KEY = 'ka_ai_cache';
const cacheKey = (q, ctx) => `${norm(q)}|${ctx.rev}|${ctx.today}`;

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
  } catch {
    return [];
  }
}
export function cacheGet(q, ctx) {
  const k = cacheKey(q, ctx);
  return readCache().find((x) => x.k === k)?.v || null;
}
export function cachePut(q, ctx, v) {
  try {
    const k = cacheKey(q, ctx);
    const list = [{ k, v }, ...readCache().filter((x) => x.k !== k)].slice(0, 30);
    localStorage.setItem(CACHE_KEY, JSON.stringify(list));
  } catch {
    /* e'tiborsiz */
  }
}
