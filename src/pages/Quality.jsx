import { useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Bar, PageHeader, Pill, Seg, toneOf } from '../components/ui.jsx';
import { useUI } from '../components/UIProvider.jsx';
import { useCtx, useStore } from '../store/StoreContext.jsx';
import { buildCases, checkAnswer, QUICK_IDS } from '../ai/benchmark.js';
import { runAgent } from '../ai/agent.js';
import { errorText } from '../ai/client.js';
import { fmtDateTime } from '../lib/dates.js';
import { clampText } from '../lib/format.js';
import { downloadXlsx } from '../export/files.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function Quality() {
  const ctx = useCtx();
  const store = useStore();
  const { toast } = useUI();
  const [mode, setMode] = useState('quick');
  const [running, setRunning] = useState(null);
  const ctl = useRef(null);
  const cases = useMemo(() => buildCases(ctx), [ctx]);
  const todo = mode === 'quick' ? cases.filter((c) => QUICK_IDS.includes(c.id)) : cases;
  const runs = ctx.benchmarks.slice().sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const last = running ? null : runs[0];
  const view = running || last;

  async function start() {
    ctl.current = new AbortController();
    const out = [];
    const state = { at: new Date().toISOString(), mode, total: todo.length, results: out, current: 0 };
    setRunning({ ...state });
    for (let i = 0; i < todo.length; i += 1) {
      if (ctl.current.signal.aborted) break;
      const c = todo[i];
      setRunning({ ...state, current: i, results: [...out], status: `${i + 1}/${todo.length}: ${c.q}` });
      try {
        const r = await runAgent({ question: c.q, ctx, signal: ctl.current.signal, onUpdate: (ev) => ev.wait && setRunning((s) => s && { ...s, status: `Groq limiti — ${ev.wait} s kutilmoqda…` }) });
        out.push({ id: c.id, area: c.area, q: c.q, expect: c.expect, ok: checkAnswer(r.text, c), text: r.text, ms: r.ms, model: r.model, tools: r.trace.map((t) => t.label) });
      } catch (e) {
        if (e.code === 'cancelled') break;
        out.push({ id: c.id, area: c.area, q: c.q, expect: c.expect, ok: false, error: errorText(e), ms: 0 });
      }
      setRunning({ ...state, current: i + 1, results: [...out] });
      await sleep(2500);
    }
    const done = out.filter((r) => !r.error);
    const res = {
      ...state,
      results: out,
      ok: out.filter((r) => r.ok).length,
      answered: done.length,
      avgMs: done.length ? Math.round(done.reduce((a, r) => a + r.ms, 0) / done.length) : 0,
      models: [...new Set(done.map((r) => r.model).filter(Boolean))],
    };
    delete res.current;
    if (out.length) store.insert('benchmarks', res);
    setRunning(null);
    toast(`O'lchov yakunlandi: ${res.ok}/${out.length}`);
  }

  const results = view?.results || [];
  const ok = results.filter((r) => r.ok).length;
  const pct = results.length ? Math.round((ok / results.length) * 100) : 0;
  const answered = results.filter((r) => !r.error);
  const avg = answered.length ? answered.reduce((a, r) => a + r.ms, 0) / answered.length / 1000 : 0;

  return (
    <>
      <PageHeader eyebrow="Model sifati" title="Agent sifatini o'lchash" sub="Nazorat savollari: to'g'ri javob tizim ma'lumotidan kod bilan hisoblanadi, agent javobi avtomatik tekshiriladi. Natija — o'lchangan raqam, va'da emas.">
        <Seg value={mode} onChange={setMode} label="To'plam" options={[['quick', `Tezkor (${cases.filter((c) => QUICK_IDS.includes(c.id)).length})`], ['full', `To'liq (${cases.length})`]]} />
        {running ? (
          <button type="button" className="btn" onClick={() => ctl.current?.abort()}>
            To'xtatish
          </button>
        ) : (
          <button type="button" className="btn primary" onClick={start}>
            <Icon name="play" />
            O'lchashni boshlash
          </button>
        )}
      </PageHeader>

      {running ? (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-h">
            <h2>O'lchanmoqda…</h2>
            <span className="num">
              {running.current}/{running.total}
            </span>
          </div>
          <div className="progress" style={{ marginBottom: 8 }}>
            <i style={{ width: `${(running.current / running.total) * 100}%` }} />
          </div>
          <div className="t-sub">{running.status}</div>
          <p className="t-sub" style={{ margin: '8px 0 0' }}>Groq bepul tarifida daqiqasiga token limiti bor — savollar orasida qisqa pauza qilinadi. To'liq to'plam 3–6 daqiqa oladi.</p>
        </div>
      ) : null}

      {view && results.length ? (
        <>
          <section className="tiles">
            <div className="tile">
              <div className="lbl">To'g'ri javoblar</div>
              <div className="score-big" style={{ margin: '6px 0' }}>
                {pct}
                <small style={{ fontSize: 20, color: 'var(--muted)' }}>%</small>
              </div>
              <Bar value={pct} cls={toneOf(pct, 85, 70)} />
              <div className="note" style={{ marginTop: 6 }}>
                {ok} / {results.length} savol
              </div>
            </div>
            <div className="tile">
              <div className="lbl">O'rtacha javob vaqti</div>
              <div className="val">
                {avg.toFixed(1)}
                <small> s</small>
              </div>
              <div className="note">savoldan to'liq javobgacha (vositalar bilan)</div>
            </div>
            <div className="tile">
              <div className="lbl">Halollik testi</div>
              <div className="val">{results.find((r) => r.id === 'nodata') ? (results.find((r) => r.id === 'nodata').ok ? "O'tdi" : "O'tmadi") : '—'}</div>
              <div className="note">yo'q ma'lumot so'ralganda raqam to'qimaslik</div>
            </div>
            <div className="tile">
              <div className="lbl">O'lchov</div>
              <div className="val" style={{ fontSize: 18 }}>{running ? 'jarayonda' : fmtDateTime(view.at)}</div>
              <div className="note">{(view.models || []).join(', ') || '—'} · {view.mode === 'quick' ? 'tezkor' : "to'liq"} to'plam</div>
            </div>
          </section>
          <div className="filters">
            <span className="t-sub">Har bir qatorda: savol, tizim hisoblagan kutilgan javob va agentning javobi.</span>
            {!running ? (
              <button
                type="button"
                className="btn sm"
                style={{ marginLeft: 'auto' }}
                onClick={() => downloadXlsx(`agent-sifati-${ctx.today}`, [{ name: 'Natijalar', pre: [`O'lchov: ${fmtDateTime(view.at)}`, `Natija: ${ok}/${results.length} (${pct}%)`], head: ["Yo'nalish", 'Savol', 'Kutilgan', 'Natija', 'Vaqt (s)', 'Model', 'Vositalar', 'Javob'], rows: results.map((r) => [r.area, r.q, r.expect.join(', '), r.ok ? "to'g'ri" : r.error ? 'xato' : "noto'g'ri", (r.ms / 1000).toFixed(1), r.model || '', (r.tools || []).join(', '), r.error || r.text]) }]).catch((e) => toast(e.message, 'bad'))}
              >
                <Icon name="excel" />
                Excel
              </button>
            ) : null}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th />
                  <th>Savol</th>
                  <th>Kutilgan (tizim hisobi)</th>
                  <th>Agent javobi</th>
                  <th>Vositalar</th>
                  <th>Vaqt</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.id} className={`bench-row ${r.ok ? '' : 'row-bad'}`}>
                    <td>{r.ok ? <span className="ok">✓</span> : <span className="no">✗</span>}</td>
                    <td className="t-title">
                      {r.q}
                      <div className="t-sub">{r.area}</div>
                    </td>
                    <td className="num" style={{ whiteSpace: 'normal' }}>{r.expect.join(', ')}</td>
                    <td>
                      <div className="bench-ans" title={r.error || r.text}>{r.error ? <span className="err">{r.error}</span> : clampText(r.text.replace(/[#*|]/g, ' '), 260)}</div>
                    </td>
                    <td className="t-sub">{(r.tools || []).join(', ')}</td>
                    <td className="num">{r.ms ? `${(r.ms / 1000).toFixed(1)} s` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : !running ? (
        <div className="panel">
          <div className="empty">
            <strong style={{ color: 'var(--fg)' }}>Hali o'lchov o'tkazilmagan</strong>
            <span>«O'lchashni boshlash» tugmasini bosing. Tezkor to'plam ~1 daqiqa, to'liq — 3–6 daqiqa.</span>
          </div>
        </div>
      ) : null}

      <section className="grid-2" style={{ marginTop: 16 }}>
        <div className="panel">
          <div className="panel-h">
            <h2>Nazorat savollari</h2>
            <span className="t-sub">{cases.length} ta</span>
          </div>
          <div className="mini-list">
            {cases.map((c) => (
              <div key={c.id}>
                <span>
                  {c.q} <span className="t-sub">· {c.area}</span>
                </span>
                <span className="num t-sub" style={{ textAlign: 'right' }}>{c.expect.join(', ')}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="panel-h">
            <h2>Metodika</h2>
          </div>
          <ul className="t-sub" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
            <li>Kutilgan javob joriy ma'lumotdan kod bilan hisoblanadi — ma'lumot o'zgarsa, savollar ham yangilanadi.</li>
            <li>Javob «to'g'ri» hisoblanadi, agar unda kutilgan barcha raqam va familiyalar bo'lsa.</li>
            <li>«Halollik» savoli: tizimda maosh ma'lumoti yo'q — agent buni aytishi va summa to'qimasligi kerak.</li>
            <li>Bu o'lchov agentning vosita tanlashi va raqamni buzmasdan yetkazishini tekshiradi. Hisob-kitob mantiqining o'zi {'>'}40 ta avtomatik test bilan tekshirilgan.</li>
            <li>Cheklov: namuna ma'lumotlarda o'lchangan; real kafedra ma'lumotlarida qayta o'lchash tavsiya etiladi.</li>
          </ul>
          {runs.length > 1 ? (
            <>
              <h3 style={{ margin: '14px 0 8px' }}>Oldingi o'lchovlar</h3>
              <div className="mini-list">
                {runs.slice(0, 6).map((r) => (
                  <div key={r.id}>
                    <span className="num">{fmtDateTime(r.at)}</span>
                    <span>
                      <Pill cls={toneOf(Math.round((r.ok / r.results.length) * 100), 85, 70)}>
                        {r.ok}/{r.results.length}
                      </Pill>{' '}
                      <span className="t-sub">{(r.avgMs / 1000).toFixed(1)} s</span>
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </section>
    </>
  );
}
