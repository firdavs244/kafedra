import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import Markdown from '../components/Markdown.jsx';
import VoiceButton from '../components/VoiceButton.jsx';
import { PageHeader, Pill } from '../components/ui.jsx';
import { useUI } from '../components/UIProvider.jsx';
import { useCtx, useStore } from '../store/StoreContext.jsx';
import { cacheGet, cachePut, runAgent } from '../ai/agent.js';
import { errorText } from '../ai/client.js';
import { QUICK } from '../ai/quick.js';
import { SCHEMA, TITLES } from '../lib/constants.js';
import { clampText, uid } from '../lib/format.js';
import { reportFromMarkdown } from '../lib/reports.js';
import { copyText } from '../lib/remind.js';
import { downloadDocx, printReport } from '../export/files.js';

const CHAT_KEY = 'ka_chat';
let lastAuto = { q: '', t: 0 };

function loadChat() {
  try {
    const c = JSON.parse(localStorage.getItem(CHAT_KEY) || '[]');
    return Array.isArray(c) ? c.filter((m) => !m.pending) : [];
  } catch {
    return [];
  }
}

const STATUS = {
  thinking: 'Savol tahlil qilinmoqda…',
  tools: "Ma'lumotlar hisoblanmoqda…",
  writing: 'Javob yozilmoqda…',
};

function Proposal({ p, onApply, onReject, ctx }) {
  const fields = SCHEMA[p.coll]?.fields || [];
  const fmt = (k, v) => {
    const f = fields.find((x) => x.k === k);
    if (f?.t === 'teacher') return ctx.tById.get(v)?.name || v;
    if (f?.t === 'teachers') return (v || []).map((id) => ctx.tById.get(id)?.name || id).join(', ');
    return typeof v === 'object' ? JSON.stringify(v) : String(v);
  };
  const cur = p.kind === 'update' ? ctx[p.coll]?.find((d) => d.id === p.id) : null;
  const entries = Object.entries(p.kind === 'update' ? p.changes : p.data);
  return (
    <div className="proposal">
      <div className="p-h">
        <strong>
          {p.kind === 'update' ? "O'zgartirish taklifi" : 'Yangi yozuv taklifi'} · {TITLES[p.coll]}
        </strong>
        {p.state === 'applied' ? <Pill cls="good">Saqlandi</Pill> : p.state === 'rejected' ? <Pill>Rad etildi</Pill> : <Pill cls="warn">Tasdiq kutilmoqda</Pill>}
      </div>
      <div>
        {p.summary}
        {p.target ? <span className="t-sub"> ({p.target})</span> : null}
      </div>
      <dl className="diff">
        {entries.map(([k, v]) => (
          <div key={k} style={{ display: 'contents' }}>
            <dt>{fields.find((x) => x.k === k)?.l || k}</dt>
            <dd>
              {cur && cur[k] !== undefined ? (
                <>
                  <s className="muted">{fmt(k, cur[k])}</s> → <b>{fmt(k, v)}</b>
                </>
              ) : (
                <b>{fmt(k, v)}</b>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {p.state === 'pending' ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className="btn sm primary" onClick={onApply}>
            <Icon name="check" />
            Tasdiqlash
          </button>
          <button type="button" className="btn sm" onClick={onReject}>
            Rad etish
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function Agent() {
  const ctx = useCtx();
  const store = useStore();
  const { toast } = useUI();
  const [params, setParams] = useSearchParams();
  const [chat, setChat] = useState(loadChat);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const ctl = useRef(null);
  const box = useRef(null);
  const ta = useRef(null);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_KEY, JSON.stringify(chat.filter((m) => !m.pending).slice(-30)));
    } catch {
      /* e'tiborsiz */
    }
  }, [chat]);

  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat]);

  const patch = useCallback((id, p) => setChat((c) => c.map((m) => (m.id === id ? { ...m, ...(typeof p === 'function' ? p(m) : p) } : m))), []);

  const send = useCallback(
    async (raw) => {
      const q = String(raw || '').trim();
      if (!q || busy) return;
      setInput('');
      const history = chat
        .filter((m) => !m.error && m.content)
        .slice(-6)
        .map((m) => ({ role: m.role, content: clampText(m.content, 1500) }));
      while (history.length && history[0].role !== 'user') history.shift();
      const aid = uid('m');
      setChat((c) => [...c, { id: uid('u'), role: 'user', content: q }, { id: aid, role: 'assistant', content: '', pending: true, status: 'thinking', trace: [], proposals: [], q }]);
      const cur = ctxRef.current;
      const cached = !history.length || QUICK.includes(q) ? cacheGet(q, cur) : null;
      if (cached) {
        patch(aid, { ...cached, pending: false, cached: true });
        return;
      }
      setBusy(true);
      ctl.current = new AbortController();
      try {
        const r = await runAgent({
          question: q,
          history,
          ctx: cur,
          signal: ctl.current.signal,
          onUpdate: (ev) => patch(aid, { content: ev.text || '', trace: [...ev.trace], status: ev.status, wait: ev.wait || 0 }),
          onProposal: (p) => patch(aid, (m) => ({ proposals: [...(m.proposals || []), { ...p, state: 'pending' }] })),
        });
        const done = { content: r.text, trace: r.trace, model: r.model, ms: r.ms, usage: r.usage, truncated: r.truncated };
        patch(aid, (m) => ({ ...done, pending: false, status: null, wait: 0, proposals: m.proposals }));
        if (!r.trace.some((t) => t.name.startsWith('taklif'))) cachePut(q, cur, done);
      } catch (e) {
        const msg = errorText(e);
        patch(aid, (m) => ({ pending: false, status: null, wait: 0, content: m.content || e.partial || '', error: msg || "To'xtatildi" }));
      } finally {
        setBusy(false);
        ctl.current = null;
        setTimeout(() => ta.current?.focus(), 30);
      }
    },
    [busy, chat, patch],
  );

  useEffect(() => {
    const q = params.get('q');
    if (!q) return;
    const now = Date.now();
    setParams({}, { replace: true });
    if (lastAuto.q === q && now - lastAuto.t < 3000) return;
    lastAuto = { q, t: now };
    send(q);
  }, [params, setParams, send]);

  function apply(mid, j) {
    const m = chat.find((x) => x.id === mid);
    const p = m?.proposals?.[j];
    if (!p || p.state !== 'pending') return;
    try {
      if (p.kind === 'update') store.update(p.coll, p.id, p.changes);
      else {
        const def = {};
        SCHEMA[p.coll].fields.forEach((f) => {
          if (f.def != null) def[f.k] = f.def;
        });
        if (p.coll === 'kpi' && !p.data.period) def.period = ctx.today.slice(0, 7);
        store.insert(p.coll, { ...def, ...p.data });
      }
      patch(mid, { proposals: m.proposals.map((x, i) => (i === j ? { ...x, state: 'applied' } : x)) });
      toast('Saqlandi');
    } catch (e) {
      toast(e.message || "Saqlab bo'lmadi", 'bad');
    }
  }

  const reportOf = (m) => reportFromMarkdown(ctx, clampText(m.q || 'AI tahlili', 90), m.content, m.q);

  function saveToHistory(m) {
    store.insert('history', { kind: 'ai', title: clampText(m.q || 'AI javobi', 100), question: m.q, text: m.content, trace: m.trace, model: m.model, at: new Date().toISOString() });
    toast('Hisobotlar → Tarix bo\'limiga saqlandi');
  }

  const counts = [
    ["O'qituvchilar", ctx.teachers.length],
    ["O'quv yuklama yozuvlari", ctx.subjects.length],
    ['Ilmiy ishlar', ctx.pubs.length],
    ['Loyihalar', ctx.projects.length],
    ['KPI bandlari', ctx.kpi.length],
    ["O'zlashtirish qaydnomalari", ctx.grades.length],
    ['Davomat kunlari', ctx.attendance.length],
    ['Ish rejalar', ctx.plans.length],
  ];

  return (
    <>
      <PageHeader eyebrow="Sun'iy intellekt yordamchisi" title="KafedraAgent" sub="Savolga kafedraning barcha bo'limlari asosida javob beradi, hisobot tayyorlaydi va o'zgartirishni taklif qiladi">
        <button type="button" className="btn" disabled={busy || !chat.length} onClick={() => setChat([])}>
          <Icon name="trash" />
          Suhbatni tozalash
        </button>
      </PageHeader>
      <div className="agent">
        <section className="chat" aria-label="Suhbat">
          <div className="msgs" ref={box} aria-live="polite">
            {!chat.length ? (
              <div className="empty-chat">
                <div className="brand-mark">KA</div>
                <div>
                  <strong style={{ color: 'var(--fg)', fontSize: 16 }}>Kafedra bo'yicha istalgan savolni bering</strong>
                  <br />
                  KPI, ortda qolgan maqolalar, yuklama taqsimoti, davomat, talabalar o'zlashtirishi yoki oylik hisobot. Ovoz bilan ham so'rashingiz mumkin.
                </div>
                <div className="chips">
                  {QUICK.slice(0, 6).map((x) => (
                    <button key={x} type="button" className="chip" onClick={() => send(x)}>
                      {x}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              chat.map((m) =>
                m.role === 'user' ? (
                  <div key={m.id} className="msg user">
                    <div className="av">Siz</div>
                    <div className="bubble">{m.content}</div>
                  </div>
                ) : (
                  <div key={m.id} className="msg ai">
                    <div className="av">KA</div>
                    <div className="bubble">
                      {m.trace?.length ? (
                        <div className="trace" aria-label="Foydalanilgan manbalar">
                          <span>Manbalar:</span>
                          {m.trace.map((t, i) => (
                            <span key={i} className={`tr ${t.error ? 'err' : ''}`} title={t.error || t.args || ''}>
                              <Icon name="tool" />
                              {t.label}
                              {t.args ? <span className="t-sub">· {clampText(t.args, 40)}</span> : null}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {m.pending && !m.content ? (
                        m.wait ? (
                          <span className="wait-note">Groq daqiqalik limiti to'ldi — {m.wait} soniyadan so'ng avtomatik davom etadi…</span>
                        ) : (
                          <span className="thinking">
                            <i />
                            <i />
                            <i /> {STATUS[m.status] || STATUS.thinking}
                          </span>
                        )
                      ) : (
                        <Markdown text={m.content} />
                      )}
                      {m.error ? <div className="err">{m.error}</div> : null}
                      {m.truncated ? <div className="t-sub">Javob uzunlik chegarasida to'xtadi — savolni toraytiring.</div> : null}
                      {(m.proposals || []).map((p, j) => (
                        <Proposal
                          key={j}
                          p={p}
                          ctx={ctx}
                          onApply={() => apply(m.id, j)}
                          onReject={() => patch(m.id, { proposals: m.proposals.map((x, i) => (i === j ? { ...x, state: 'rejected' } : x)) })}
                        />
                      ))}
                      {!m.pending && m.content ? (
                        <>
                          <div className="msg-meta">
                            {m.cached ? (
                              <span>
                                <Icon name="bolt" size={12} /> keshdan (ma'lumot o'zgarmagan)
                              </span>
                            ) : null}
                            {m.model ? <span>{m.model}</span> : null}
                            {m.ms ? <span>{(m.ms / 1000).toFixed(1)} s</span> : null}
                            {m.usage ? <span>{((m.usage.prompt + m.usage.completion) / 1000).toFixed(1)}K token</span> : null}
                          </div>
                          <div className="msg-tools">
                            <button type="button" className="btn sm" onClick={async () => toast((await copyText(m.content)) ? 'Nusxa olindi' : "Nusxa olib bo'lmadi")}>
                              <Icon name="copy" />
                              Nusxa
                            </button>
                            <button type="button" className="btn sm" onClick={() => downloadDocx(reportOf(m)).catch((e) => toast(e.message, 'bad'))}>
                              <Icon name="word" />
                              Word
                            </button>
                            <button type="button" className="btn sm" onClick={() => printReport(reportOf(m))}>
                              <Icon name="pdf" />
                              PDF
                            </button>
                            <button type="button" className="btn sm" onClick={() => saveToHistory(m)}>
                              <Icon name="history" />
                              Tarixga saqlash
                            </button>
                          </div>
                        </>
                      ) : null}
                      {!m.pending && m.error && m.q ? (
                        <div className="msg-tools">
                          <button type="button" className="btn sm" onClick={() => send(m.q)} disabled={busy}>
                            <Icon name="refresh" />
                            Qayta yuborish
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ),
              )
            )}
          </div>
          <div className="composer">
            <textarea
              ref={ta}
              value={input}
              rows={1}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="Savolingizni yozing… (Enter — yuborish, Shift+Enter — yangi qator)"
              aria-label="Savol"
            />
            <VoiceButton onText={(t) => setInput((v) => (v ? `${v} ${t}` : t))} disabled={busy} />
            {busy ? (
              <button type="button" className="btn" onClick={() => ctl.current?.abort()}>
                To'xtatish
              </button>
            ) : (
              <button type="button" className="btn primary" onClick={() => send(input)} disabled={!input.trim()}>
                <Icon name="send" />
                Yuborish
              </button>
            )}
          </div>
        </section>
        <aside className="aside">
          <div className="panel">
            <h3 style={{ marginBottom: 10 }}>Tez so'rovlar</h3>
            <div className="chips">
              {QUICK.map((x) => (
                <button key={x} type="button" className="chip" onClick={() => send(x)} disabled={busy}>
                  {x}
                </button>
              ))}
            </div>
          </div>
          <div className="panel meta">
            <h3 style={{ marginBottom: 8 }}>Qanday ishlaydi</h3>
            <ol className="t-sub" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
              <li>Savolingizga qarab agent kerakli vositani tanlaydi (KPI, yuklama, davomat…).</li>
              <li>Vosita raqamlarni <b>tizim ma'lumotidan kod bilan hisoblaydi</b> — AI raqam to'qimaydi.</li>
              <li>AI natijani o'zbekcha tushuntiradi; ishlatilgan manbalar javob tepasida ko'rinadi.</li>
              <li>O'zgartirishlar faqat siz tasdiqlaganingizdan keyin saqlanadi.</li>
            </ol>
            <p className="t-sub" style={{ margin: '10px 0 0' }}>
              Sifat o'lchovi: <Link to="/sifat">Agent sifati</Link>
            </p>
          </div>
          <div className="panel meta">
            <h3 style={{ marginBottom: 8 }}>Agent nimani ko'radi</h3>
            <div className="mini-list">
              {counts.map(([l, n]) => (
                <div key={l}>
                  <span>{l}</span>
                  <span className="num">{n}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
