import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { PageHeader, Pill } from '../components/ui.jsx';
import { useUI } from '../components/UIProvider.jsx';
import { useCtx, useStore } from '../store/StoreContext.jsx';
import { DOC_TYPES, extractDocument, fileToDataUrl } from '../ai/vision.js';
import { errorText } from '../ai/client.js';
import { detectType, mapGrades, mapPubs } from '../lib/docmap.js';
import { gradeRow } from '../lib/grades.js';
import { PUB_STATUS, PUB_TYPES } from '../lib/constants.js';
import { shortName } from '../lib/format.js';
import { downloadXlsx } from '../export/files.js';

const SAMPLES = [
  { file: '/namuna/qaydnoma-namuna.jpg', title: 'Yakuniy nazorat qaydnomasi', sub: "ATT-25-02 · Algoritmlar · 24 talaba" },
  { file: '/namuna/ilmiy-ishlar-namuna.jpg', title: "Ilmiy maqolalar rejasi", sub: "5 ta maqola, qo'lda to'ldirilgan jadval" },
];

function Steps({ step }) {
  const list = ['Rasm', 'AI tahlili', 'Tekshirish', 'Saqlash'];
  return (
    <div className="steps">
      {list.map((s, i) => (
        <span key={s} className={i < step ? 'done' : i === step ? 'on' : ''}>
          {i < step ? <Icon name="check" size={13} /> : `${i + 1}.`} {s}
        </span>
      ))}
    </div>
  );
}

function GradesImport({ m, ctx, onSave }) {
  const after = gradeRow({ ...m.counts, students: m.students });
  const before = m.existing ? gradeRow(m.existing) : null;
  return (
    <div className="panel">
      <div className="panel-h">
        <h2>O'zlashtirish qaydnomasi</h2>
        {m.existing ? <Pill cls="info">Mavjud yozuv yangilanadi</Pill> : <Pill cls="warn">Yangi yozuv</Pill>}
      </div>
      <dl className="kv" style={{ marginBottom: 12 }}>
        <dt>Fan</dt>
        <dd>
          {m.subjectFixed || m.subject || '—'}
          {m.subjectFixed ? <span className="t-sub"> (rasmda: «{m.subject}» — bazadagi nomga moslandi)</span> : null}
        </dd>
        <dt>Guruh</dt>
        <dd className="num">{m.group || '—'}</dd>
        <dt>O'qituvchi</dt>
        <dd>{m.teacher ? m.teacher.name : <span style={{ color: 'var(--warn)' }}>{m.teacherName || '—'} (bog'lanmadi)</span>}</dd>
        <dt>Talabalar</dt>
        <dd className="num">{m.students}</dd>
      </dl>
      <div className="table-wrap" style={{ marginBottom: 12 }}>
        <table>
          <thead>
            <tr>
              <th />
              <th>A'lo</th>
              <th>Yaxshi</th>
              <th>Qoniqarli</th>
              <th>Qoniqarsiz</th>
              <th>O'zlashtirish</th>
              <th>Sifat</th>
            </tr>
          </thead>
          <tbody>
            {m.existing ? (
              <tr className="muted">
                <td>Hozir tizimda</td>
                <td className="num">{m.existing.a}</td>
                <td className="num">{m.existing.b}</td>
                <td className="num">{m.existing.c}</td>
                <td className="num">{m.existing.f}</td>
                <td className="num">{before.pass}%</td>
                <td className="num">{before.quality}%</td>
              </tr>
            ) : null}
            <tr>
              <td className="strong">Rasmdan</td>
              <td className="num strong">{m.counts.a}</td>
              <td className="num strong">{m.counts.b}</td>
              <td className="num strong">{m.counts.c}</td>
              <td className="num strong" style={{ color: 'var(--bad)' }}>{m.counts.f}</td>
              <td className="num strong">{after.pass}%</td>
              <td className="num strong">{after.quality}%</td>
            </tr>
          </tbody>
        </table>
      </div>
      {m.debtors.length ? (
        <p className="lead">
          <b>Qarzdorlar ({m.debtors.length}):</b> {m.debtors.join(', ')}
        </p>
      ) : null}
      {m.problems.length ? <div className="notice">{m.problems.join('. ')}.</div> : null}
      <button type="button" className="btn primary" onClick={onSave} disabled={!m.group || !m.subject || !m.students}>
        <Icon name="check" />
        {m.existing ? "O'zlashtirishni yangilash" : "O'zlashtirishga qo'shish"}
      </button>
    </div>
  );
}

function PubsImport({ recs, setRecs, ctx, onSave }) {
  const teachers = ctx.teachers.slice().sort((a, b) => a.name.localeCompare(b.name));
  const upd = (i, patch) => setRecs(recs.map((r, j) => (j === i ? { ...r, rec: { ...r.rec, ...patch } } : r)));
  const chosen = recs.filter((r) => r.on && r.rec.title && r.rec.teacherId);
  return (
    <div className="panel">
      <div className="panel-h">
        <h2>Ilmiy ishlar ({recs.length})</h2>
        <span className="t-sub">Saqlashdan oldin tekshiring — AI matnni noto'g'ri o'qigan bo'lishi mumkin</span>
      </div>
      <div className="table-wrap" style={{ marginBottom: 12 }}>
        <table className="edit">
          <thead>
            <tr>
              <th />
              <th>Mavzu</th>
              <th>Muallif</th>
              <th>Turi</th>
              <th>Holat</th>
              <th>Muddat</th>
            </tr>
          </thead>
          <tbody>
            {recs.map((r, i) => (
              <tr key={i} className={r.duplicate ? 'row-warn' : ''}>
                <td>
                  <input type="checkbox" checked={!!r.on} onChange={(e) => setRecs(recs.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} aria-label="Qo'shish" />
                </td>
                <td style={{ minWidth: 240 }}>
                  <input type="text" value={r.rec.title} onChange={(e) => upd(i, { title: e.target.value })} aria-label="Mavzu" />
                  {r.duplicate ? <div className="t-sub" style={{ color: 'var(--warn)' }}>Bu mavzu tizimda allaqachon bor</div> : null}
                </td>
                <td>
                  <select value={r.rec.teacherId} onChange={(e) => upd(i, { teacherId: e.target.value })} aria-label="Muallif">
                    <option value="">— {r.authorText || 'tanlang'} —</option>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {shortName(t.name)}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select value={r.rec.type} onChange={(e) => upd(i, { type: e.target.value })} aria-label="Turi">
                    {PUB_TYPES.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <select value={r.rec.status} onChange={(e) => upd(i, { status: e.target.value })} aria-label="Holat">
                    {PUB_STATUS.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <input type="date" value={r.rec.deadline} onChange={(e) => upd(i, { deadline: e.target.value })} aria-label="Muddat" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="btn primary" onClick={() => onSave(chosen)} disabled={!chosen.length}>
        <Icon name="check" />
        Tanlanganlarni qo'shish ({chosen.length})
      </button>
    </div>
  );
}

export default function DocScan() {
  const ctx = useCtx();
  const store = useStore();
  const nav = useNavigate();
  const { toast } = useUI();
  const [hint, setHint] = useState('auto');
  const [img, setImg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const [res, setRes] = useState(null);
  const [recs, setRecs] = useState([]);
  const [saved, setSaved] = useState(null);
  const [over, setOver] = useState(false);
  const ctl = useRef(null);
  const step = saved ? 4 : res ? 2 : busy ? 1 : img ? 1 : 0;

  async function analyze(dataUrl) {
    setImg(dataUrl);
    setRes(null);
    setSaved(null);
    setBusy(true);
    ctl.current = new AbortController();
    try {
      const r = await extractDocument(dataUrl, hint, { signal: ctl.current.signal, onWait: setWait });
      const type = hint !== 'auto' ? hint : detectType(r.doc);
      const mapped = type === 'qaydnoma' ? mapGrades(r.doc, ctx) : type === 'ilmiy_ishlar' ? mapPubs(r.doc, ctx) : null;
      setRes({ ...r, type, mapped });
      if (type === 'ilmiy_ishlar') setRecs(mapped.recs.map((x) => ({ ...x, on: x.ok && !x.duplicate })));
    } catch (e) {
      toast(errorText(e), 'bad');
    } finally {
      setBusy(false);
      setWait(0);
    }
  }

  async function onFile(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      toast('Rasm fayl tanlang (JPG, PNG). PDF uchun sahifani skrinshot qiling.', 'bad');
      return;
    }
    try {
      analyze(await fileToDataUrl(file));
    } catch (e) {
      toast(e.message, 'bad');
    }
  }

  async function loadSample(url) {
    const blob = await (await fetch(url)).blob();
    onFile(new File([blob], url.split('/').pop(), { type: blob.type || 'image/jpeg' }));
  }

  function saveGrades() {
    const m = res.mapped;
    const data = { ...m.counts, students: m.students, debtors: m.debtors, group: m.group, subject: m.subjectFixed || m.subject, teacherId: m.teacher?.id || m.existing?.teacherId || '' };
    if (m.existing) store.update('grades', m.existing.id, data, { silent: true });
    else store.insert('grades', { ...data, kurs: m.kurs, planId: m.planId, session: ctx.grades[0]?.session || '', retakeDeadline: ctx.grades[0]?.retakeDeadline || '' }, { silent: true });
    store.log(`Qaydnoma rasmdan kiritildi: ${data.group} · ${data.subject} (o'zlashtirish ${gradeRow({ ...m.counts, students: m.students }).pass}%, ${m.debtors.length} qarzdor)`, 'Talabalar', 'students');
    store.insert('history', { kind: 'scan', title: `Qaydnoma: ${data.group} · ${data.subject}`, report: scanReport(), at: new Date().toISOString() });
    setSaved({ to: '/talabalar', label: "Talabalar va o'zlashtirish" });
    toast('Qaydnoma saqlandi');
  }

  function savePubs(list) {
    store.insertMany('pubs', list.map((x) => x.rec), `Rasmdan ${list.length} ta ilmiy ish qo'shildi`);
    store.insert('history', { kind: 'scan', title: `Ilmiy ishlar ro'yxati (${list.length} ta)`, report: scanReport(), at: new Date().toISOString() });
    setSaved({ to: '/ilmiy', label: 'Ilmiy ishlar' });
    toast(`${list.length} ta ilmiy ish qo'shildi`);
  }

  function scanReport() {
    return {
      kind: 'scan',
      title: res.doc.sarlavha || 'Hujjat tahlili',
      subtitle: `Rasmdan AI yordamida ajratilgan jadval · ${DOC_TYPES[res.type] || res.type}`,
      org: [ctx.settings.university, ctx.settings.name].filter(Boolean),
      date: ctx.today,
      sections: [{ heading: 'Jadval', table: { head: res.doc.ustunlar, rows: res.doc.qatorlar } }],
    };
  }

  return (
    <>
      <PageHeader eyebrow="Sun'iy intellekt · kompyuter ko'rishi" title="Hujjat tahlili" sub="Qog'oz hujjatni (qaydnoma, maqolalar ro'yxati, jadval) telefonda suratga oling — AI jadvalni o'qiydi, tizim uni tegishli bo'limga bog'laydi.">
        <select value={hint} onChange={(e) => setHint(e.target.value)} aria-label="Hujjat turi">
          {Object.entries(DOC_TYPES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </PageHeader>
      <Steps step={step} />
      <div className="scan-grid">
        <div>
          {img ? (
            <img className="scan-img" src={img} alt="Yuklangan hujjat" />
          ) : (
            <div
              className={`drop ${over ? 'over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(true);
              }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(false);
                onFile(e.dataTransfer.files?.[0]);
              }}
            >
              <Icon name="scan" className="big" />
              <strong>Hujjat rasmini shu yerga tashlang</strong>
              <span className="t-sub">JPG yoki PNG · telefonda kamera ochiladi</span>
              <div className="chips" style={{ justifyContent: 'center' }}>
                <label className="btn primary">
                  <Icon name="camera" />
                  Suratga olish / tanlash
                  <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFile(e.target.files?.[0])} />
                </label>
              </div>
            </div>
          )}
          {img ? (
            <div className="chips" style={{ marginTop: 10 }}>
              <label className="btn">
                <Icon name="camera" />
                Boshqa rasm
                <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFile(e.target.files?.[0])} />
              </label>
              {busy ? (
                <button type="button" className="btn" onClick={() => ctl.current?.abort()}>
                  To'xtatish
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="panel" style={{ marginTop: 14 }}>
            <h3 style={{ marginBottom: 10 }}>Namuna hujjat bilan sinash</h3>
            <div className="mini-list">
              {SAMPLES.map((s) => (
                <div key={s.file}>
                  <span>
                    <b>{s.title}</b>
                    <br />
                    <span className="t-sub">{s.sub}</span>
                  </span>
                  <span style={{ display: 'flex', gap: 6 }}>
                    <a className="btn sm" href={s.file} target="_blank" rel="noreferrer">
                      <Icon name="eye" />
                    </a>
                    <button type="button" className="btn sm primary" onClick={() => loadSample(s.file)} disabled={busy}>
                      Tahlil qilish
                    </button>
                  </span>
                </div>
              ))}
            </div>
            <p className="t-sub" style={{ margin: '10px 0 0' }}>Namuna rasmlarni telefonga ochib, ekrandan suratga olib ham sinashingiz mumkin.</p>
          </div>
        </div>
        <div>
          {busy ? (
            <div className="panel">
              <h2 style={{ marginBottom: 10 }}>Rasm tahlil qilinmoqda…</h2>
              <div className="progress indet" style={{ marginBottom: 10 }}>
                <i />
              </div>
              <p className="t-sub" style={{ margin: 0 }}>
                {wait ? `Groq daqiqalik limiti: ${wait} soniyadan so'ng avtomatik davom etadi.` : 'AI jadval qatorlari va sarlavhani o\'qiyapti (odatda 2–4 soniya).'}
              </p>
            </div>
          ) : res ? (
            <>
              <div className="panel" style={{ marginBottom: 14 }}>
                <div className="panel-h">
                  <div>
                    <h2>{res.doc.sarlavha || 'Ajratilgan jadval'}</h2>
                    <div className="t-sub">
                      {DOC_TYPES[res.type] || res.type} · {res.doc.qatorlar.length} qator · {(res.ms / 1000).toFixed(1)} s · {res.model}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => downloadXlsx(`hujjat-${ctx.today}`, [{ name: 'Jadval', pre: [res.doc.sarlavha || ''], head: res.doc.ustunlar, rows: res.doc.qatorlar }]).catch((e) => toast(e.message, 'bad'))}
                  >
                    <Icon name="excel" />
                    Excel
                  </button>
                </div>
                <div className="table-wrap" style={{ maxHeight: 280, overflow: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        {res.doc.ustunlar.map((h, i) => (
                          <th key={i}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {res.doc.qatorlar.map((r, i) => (
                        <tr key={i}>
                          {r.map((c, j) => (
                            <td key={j}>{c}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {res.truncated ? <div className="notice" style={{ margin: '10px 0 0' }}>Jadval uzun — oxirgi qatorlar kesilgan bo'lishi mumkin. Rasmni ikki qismga bo'lib yuklang.</div> : null}
              </div>
              {saved ? (
                <div className="notice info">
                  Saqlandi. <Link to={saved.to}>{saved.label}</Link> bo'limida ko'ring · tahlil <Link to="/hisobotlar">Tarix</Link>ga yozildi.
                </div>
              ) : res.type === 'qaydnoma' ? (
                <GradesImport m={res.mapped} ctx={ctx} onSave={saveGrades} />
              ) : res.type === 'ilmiy_ishlar' ? (
                <PubsImport recs={recs} setRecs={setRecs} ctx={ctx} onSave={savePubs} />
              ) : (
                <div className="panel">
                  <p className="lead">Bu jadval turini tizim bo'limiga avtomatik bog'lab bo'lmadi. Uni Excel'ga yuklab olishingiz yoki AI'dan tahlil so'rashingiz mumkin.</p>
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => {
                      const t = [res.doc.ustunlar.join(' | '), ...res.doc.qatorlar.slice(0, 30).map((r) => r.join(' | '))].join('\n');
                      nav(`/agent?q=${encodeURIComponent(`Quyidagi hujjat jadvalini tahlil qil va kafedra uchun xulosa ber (${res.doc.sarlavha || 'hujjat'}):\n${t}`.slice(0, 1800))}`);
                    }}
                  >
                    <Icon name="agent" />
                    AI'dan tahlil so'rash
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="panel">
              <h2 style={{ marginBottom: 8 }}>Qanday ishlaydi</h2>
              <ol className="t-sub" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                <li>Hujjatni suratga oling yoki namuna tanlang.</li>
                <li>AI (Qwen, rasmni tushunadigan model) jadvalni matnga ko'chiradi.</li>
                <li>Tizim ustunlarni taniydi, o'qituvchi ismini bazaga bog'laydi, baholarni hisoblaydi.</li>
                <li>Siz tekshirasiz va tasdiqlaysiz — shundan keyingina saqlanadi.</li>
              </ol>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
