import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import { ConfirmButton, PageHeader } from '../components/ui.jsx';
import { useUI } from '../components/UIProvider.jsx';
import { useCtx, useStore } from '../store/StoreContext.jsx';
import { POS, SCHEMA, TITLES } from '../lib/constants.js';
import { normsOf } from '../lib/workload.js';
import { fmtDateTime } from '../lib/dates.js';
import { getOwnKey, health, setOwnKey, errorText } from '../ai/client.js';
import { downloadXlsx, saveText } from '../export/files.js';

function AIPanel({ toast }) {
  const [key, setKey] = useState(getOwnKey());
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);
  async function check() {
    setBusy(true);
    try {
      setSt(await health(true));
    } catch (e) {
      setSt({ error: errorText(e) });
    } finally {
      setBusy(false);
    }
  }
  const row = (ok, text) => (
    <div>
      <span className={`dot ${ok ? '' : 'bad'}`} />
      {text}
    </div>
  );
  return (
    <div className="panel">
      <div className="panel-h">
        <h2>AI (Groq)</h2>
        <button type="button" className="btn sm" onClick={check} disabled={busy}>
          <Icon name="refresh" />
          {busy ? 'Tekshirilmoqda…' : 'Holatni tekshirish'}
        </button>
      </div>
      <p className="lead">Asosiy kalit serverda saqlanadi (Vercel muhit o'zgaruvchisi) va brauzerga chiqmaydi. Limit tugasa, bu yerga boshqa Groq kalitini kiritish mumkin — u faqat shu brauzerda saqlanadi.</p>
      {st ? (
        <div className="health">
          {st.error ? row(false, st.error) : (
            <>
              {row(st.keyConfigured || st.usingOwnKey, st.usingOwnKey ? 'Shaxsiy kalit ishlatilmoqda' : st.keyConfigured ? 'Server kaliti sozlangan' : "Server kaliti yo'q")}
              {st.groq ? (
                st.groq.ok ? (
                  <>
                    {row(st.groq.primary, `Asosiy model: ${st.models.primary}`)}
                    {row(st.groq.fallback, `Zaxira model: ${st.models.fallback}`)}
                    {row(st.groq.stt, `Ovoz: ${st.models.stt}`)}
                  </>
                ) : (
                  row(false, `Groq javob bermadi (${st.groq.status || st.groq.error})`)
                )
              ) : null}
              <div className="t-sub">Tekshirildi: {fmtDateTime(st.time)}</div>
            </>
          )}
        </div>
      ) : null}
      <div className="form" style={{ marginTop: 12 }}>
        <div className="field full">
          <label htmlFor="own-key">Zaxira Groq API kaliti (ixtiyoriy)</label>
          <input id="own-key" type="password" autoComplete="off" placeholder="gsk_…" value={key} onChange={(e) => setKey(e.target.value.trim())} />
        </div>
      </div>
      <div className="chips" style={{ marginTop: 10 }}>
        <button
          type="button"
          className="btn sm primary"
          onClick={() => {
            if (key && !/^gsk_[A-Za-z0-9]{20,}$/.test(key)) {
              toast("Kalit «gsk_» bilan boshlanishi kerak", 'bad');
              return;
            }
            setOwnKey(key);
            toast(key ? 'Shaxsiy kalit saqlandi' : "Shaxsiy kalit o'chirildi");
          }}
        >
          Saqlash
        </button>
        {getOwnKey() ? (
          <button
            type="button"
            className="btn sm"
            onClick={() => {
              setOwnKey('');
              setKey('');
              toast("Shaxsiy kalit o'chirildi — server kaliti ishlatiladi");
            }}
          >
            Server kalitiga qaytish
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default function Settings() {
  const ctx = useCtx();
  const store = useStore();
  const { toast } = useUI();
  const s = ctx.settings;
  const n = normsOf(s);
  const [msg, setMsg] = useState('');

  function submit(e) {
    e.preventDefault();
    const f = e.currentTarget;
    const vals = {};
    ['name', 'faculty', 'university', 'head', 'year', 'sem1Start', 'sem1End', 'sem2Start', 'sem2End', 'workStart', 'workEnd', 'workWeek', 'holidays'].forEach((k) => {
      vals[k] = f.elements[k].value.trim();
    });
    vals.graceMin = Math.max(0, Number(f.elements.graceMin.value) || 0);
    const norms = {};
    POS.forEach((p, i) => {
      norms[p] = Number(f.elements[`nm-${i}`].value) || 0;
    });
    vals.norms = norms;
    store.setMeta('settings', { ...s, ...vals }, 'Kafedra sozlamalari yangilandi');
    toast('Sozlamalar saqlandi');
  }

  async function importFile(file) {
    try {
      const obj = JSON.parse(await file.text());
      const n2 = store.importJSON(obj);
      setMsg(`${n2} ta yozuv tiklandi.`);
      toast('Zaxira nusxadan tiklandi');
    } catch (e) {
      setMsg(e.message || "Fayl o'qilmadi");
    }
  }

  const text = (k, l, full) => (
    <div key={k} className={`field ${full ? 'full' : ''}`}>
      <label htmlFor={`st-${k}`}>{l}</label>
      <input id={`st-${k}`} name={k} type="text" defaultValue={s[k] || ''} />
    </div>
  );
  const date = (k, l) => (
    <div key={k} className="field">
      <label htmlFor={`st-${k}`}>{l}</label>
      <input id={`st-${k}`} name={k} type="date" defaultValue={s[k] || ''} />
    </div>
  );

  return (
    <>
      <PageHeader eyebrow="Tizim" title="Sozlamalar" sub="Kafedra ma'lumotlari, semestr sanalari, yuklama me'yorlari, AI va ma'lumotlar zaxirasi" />
      <div className="settings-grid">
        <form className="panel" onSubmit={submit} key={ctx.rev}>
          <div className="panel-h">
            <h2>Kafedra</h2>
          </div>
          <div className="form">
            {text('name', 'Kafedra nomi', true)}
            {text('university', 'OTM nomi')}
            {text('faculty', 'Fakultet')}
            {text('head', 'Kafedra mudiri')}
            {text('year', "O'quv yili (masalan 2026-2027)")}
            {date('sem1Start', '1-semestr boshlanishi')}
            {date('sem1End', '1-semestr tugashi')}
            {date('sem2Start', '2-semestr boshlanishi')}
            {date('sem2End', '2-semestr tugashi')}
            <div className="field full">
              <label>Davomat: ish tartibi</label>
            </div>
            <div className="field">
              <label htmlFor="st-workStart">Ish boshlanishi</label>
              <input id="st-workStart" name="workStart" type="time" defaultValue={s.workStart || '08:30'} />
            </div>
            <div className="field">
              <label htmlFor="st-workEnd">Ish tugashi</label>
              <input id="st-workEnd" name="workEnd" type="time" defaultValue={s.workEnd || '17:00'} />
            </div>
            <div className="field">
              <label htmlFor="st-grace">Kechikish chegarasi (daqiqa)</label>
              <input id="st-grace" name="graceMin" type="number" min="0" defaultValue={s.graceMin ?? 10} />
            </div>
            <div className="field">
              <label htmlFor="st-week">Ish haftasi</label>
              <select id="st-week" name="workWeek" defaultValue={String(s.workWeek) === '5' ? '5' : '6'}>
                <option value="6">6 kunlik</option>
                <option value="5">5 kunlik</option>
              </select>
            </div>
            <div className="field full">
              <label htmlFor="st-hol">Bayram kunlari (YYYY-MM-DD, vergul bilan)</label>
              <input id="st-hol" name="holidays" type="text" defaultValue={s.holidays || ''} />
            </div>
            <div className="field full">
              <label>Yillik yuklama me'yori (1 stavka, soat)</label>
            </div>
            {POS.map((p, i) => (
              <div key={p} className="field">
                <label htmlFor={`nm-${i}`}>{p}</label>
                <input id={`nm-${i}`} name={`nm-${i}`} type="number" min="0" defaultValue={n[p]} />
              </div>
            ))}
          </div>
          <div className="modal-f">
            <div className="r">
              <button type="submit" className="btn primary">
                Saqlash
              </button>
            </div>
          </div>
        </form>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <AIPanel toast={toast} />
          <div className="panel">
            <div className="panel-h">
              <h2>Eksport</h2>
            </div>
            <p className="lead">Barcha bo'limlar bitta Excel faylda (har bo'lim alohida varaqda).</p>
            <button
              type="button"
              className="btn sm"
              onClick={() =>
                downloadXlsx(
                  `kafedra-malumotlari-${ctx.today}`,
                  ['teachers', 'subjects', 'pubs', 'projects', 'stwork', 'kpi', 'grades'].map((c) => ({
                    name: TITLES[c],
                    head: SCHEMA[c].fields.map((f) => f.l),
                    rows: ctx[c].map((d) => SCHEMA[c].fields.map((f) => (f.t === 'teacher' ? ctx.tById.get(d[f.k])?.name || '' : f.t === 'teachers' ? (d[f.k] || []).map((id) => ctx.tById.get(id)?.name).join(', ') : d[f.k] ?? ''))),
                  })),
                ).catch((e) => toast(e.message, 'bad'))
              }
            >
              <Icon name="excel" />
              Hammasini Excel'ga
            </button>
          </div>
          <div className="panel">
            <div className="panel-h">
              <h2>Zaxira nusxa</h2>
            </div>
            <p className="lead">Ma'lumotlar shu brauzerda saqlanadi. Boshqa kompyuterga o'tkazish yoki himoyalash uchun JSON zaxira oling.</p>
            <div className="chips">
              <button type="button" className="btn sm" onClick={() => saveText(`kafedra-zaxira-${ctx.today}.json`, JSON.stringify(store.exportJSON()), 'application/json')}>
                <Icon name="download" />
                JSON yuklab olish
              </button>
              <label className="btn sm">
                <Icon name="upload" />
                JSON'dan tiklash
                <input type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files[0] && importFile(e.target.files[0])} />
              </label>
            </div>
            {msg ? <div className="t-sub" style={{ marginTop: 8 }}>{msg}</div> : null}
          </div>
          <div className="panel">
            <div className="panel-h">
              <h2>Namuna ma'lumotlar</h2>
            </div>
            <p className="lead">
              Taqdimotdan oldin bosing: namuna bugungi sanaga moslab qayta yaratiladi (davomat, KPI muddatlari, qarzdorlar). Barcha o'zgarishlar bekor bo'ladi.
              {ctx.meta?.seededAt ? ` Oxirgi marta: ${fmtDateTime(ctx.meta.seededAt)}.` : ''}
            </p>
            <ConfirmButton className="btn sm" question="Barcha o'zgarishlar o'chadi." confirmText="Ha, tiklash" onConfirm={() => { store.reset(); toast('Namuna qayta tiklandi'); }}>
              <Icon name="refresh" />
              Namunani qayta tiklash
            </ConfirmButton>
          </div>
          <div className="panel danger-zone">
            <div className="panel-h">
              <h2>Ma'lumotlarni tozalash</h2>
            </div>
            <p className="lead">Haqiqiy kafedra ma'lumotlarini noldan kiritish uchun. Barcha yozuvlar o'chiriladi — avval zaxira nusxa oling.</p>
            <ConfirmButton question="Rostdan ham hammasi o'chirilsinmi?" confirmText="Ha, hammasini o'chirish" onConfirm={() => { store.wipe(); toast("Ma'lumotlar tozalandi"); }}>
              Hammasini o'chirish…
            </ConfirmButton>
          </div>
        </div>
      </div>
    </>
  );
}
