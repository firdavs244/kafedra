import { useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import Modal from '../components/Modal.jsx';
import { Bar, ConfirmButton, Empty, PageHeader, Seg } from '../components/ui.jsx';
import { useUI } from '../components/UIProvider.jsx';
import { useCtx, useStore } from '../store/StoreContext.jsx';
import { POS } from '../lib/constants.js';
import { fmtNum, num, shortName } from '../lib/format.js';
import {
  activePlans, allocItems, allocStale, allocToSubjects, avgNorm, lcBuildItems, lcGroups, lcHash, lcIsOurs, lcPlanLabel, LC_KIND, LC_LECTURERS, parsePlanWorkbook, runAllocation, wlSummary,
} from '../lib/workload.js';
import { downloadXlsx } from '../export/files.js';

const R = Math.round;

function ItemTable({ items, showPlan, ctx, onAssign }) {
  const teachers = ctx.teachers.slice().sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Fan</th>
            <th>Turi</th>
            <th>Guruh / potok</th>
            {showPlan ? <th>Ish reja</th> : null}
            <th>Semestr</th>
            <th>Soat</th>
            <th>O'qituvchi</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id}>
              <td className="t-title">{i.name}</td>
              <td>
                <span className="tag">{LC_KIND[i.kind]}</span>
              </td>
              <td className="num">{i.group}</td>
              {showPlan ? <td className="t-sub">{i.plan}</td> : null}
              <td className="num">{i.sem}-sem</td>
              <td className="num strong">{i.hours}</td>
              <td>
                <select value={i.teacherId || ''} onChange={(e) => onAssign(i.id, e.target.value)} aria-label="O'qituvchi" style={{ maxWidth: 230 }}>
                  <option value="">— taqsimlanmagan —</option>
                  {teachers
                    .filter((t) => i.kind !== 'M' || LC_LECTURERS.includes(t.position) || t.id === i.teacherId)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {shortName(t.name)} ({t.position})
                      </option>
                    ))}
                </select>
                {i.pinned ? (
                  <span className="tag" style={{ marginLeft: 6 }} title="Qo'lda biriktirilgan — qayta taqsimlashda saqlanadi">
                    qo'lda
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Workload() {
  const ctx = useCtx();
  const store = useStore();
  const { toast } = useUI();
  const [tab, setTab] = useState('dist');
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState('');
  const [modalT, setModalT] = useState(null);
  const s = wlSummary(ctx);
  const stale = allocStale(ctx);
  const items = allocItems(ctx);

  const assign = (id, teacherId) => {
    const next = items.map((i) => (i.id === id ? { ...i, teacherId: teacherId || null, pinned: !!teacherId } : i));
    store.setMeta('alloc', { ...ctx.alloc, items: next });
    toast(teacherId ? 'Biriktirildi' : 'Biriktirish olib tashlandi');
  };

  function run() {
    if (!ctx.teachers.length) {
      toast("Avval o'qituvchilarni kiriting", 'bad');
      return;
    }
    const res = runAllocation(ctx);
    const un = res.filter((i) => !i.teacherId);
    store.setMeta('alloc', { items: res, generatedAt: new Date().toISOString() }, `Yuklama avtomatik taqsimlandi: ${res.length - un.length}/${res.length} mashg'ulot`);
    toast(`${res.length - un.length}/${res.length} ta mashg'ulot biriktirildi${un.length ? ` · ${R(un.reduce((a, i) => a + i.hours, 0))} soat qoldi` : ''}`);
  }

  function applyToSubjects() {
    const subs = allocToSubjects(items, ctx.subjects);
    store.replaceAll('subjects', subs.map((x) => ({ ...x, id: `s${lcHash(`${x.teacherId}|${x.name}|${x.kind}|${x.semester}`)}` })), `Yuklama taqsimoti O'quv yuklama bo'limiga o'tkazildi (${subs.length} yozuv)`);
    toast(`${subs.length} ta yozuv O'quv yuklama bo'limiga o'tkazildi`);
  }

  async function importFiles(files) {
    setBusy(true);
    setLog("Fayllar o'qilmoqda…");
    const lines = [];
    let added = 0;
    try {
      const XLSX = await import('xlsx');
      let plans = ctx.plans.slice();
      for (const f of files) {
        try {
          const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
          const { plans: found, skipped } = parsePlanWorkbook(XLSX, wb, f.name, ctx.settings.year);
          skipped.forEach((x) => lines.push(`${f.name} · «${x.sheet}» o'tkazib yuborildi: ${x.reason}`));
          if (!found.length && !skipped.length) lines.push(`${f.name}: ishchi o'quv reja jadvali topilmadi`);
          for (const p of found) {
            const same = plans.find((x) => x.file === p.file && x.sheet === p.sheet);
            const id = same ? same.id : `pl${lcHash(`${p.file}|${p.sheet}|${Date.now()}`)}`;
            const masof = /masofa/i.test(p.form);
            plans = plans.map((o) => {
              if (o.id !== id && o.active && o.specCode === p.specCode && o.kurs === p.kurs && o.form === p.form && (o.extra || '') === (p.extra || '')) {
                lines.push(`Takroriy reja nofaol qilindi: ${o.file} · ${o.sheet}`);
                return { ...o, active: false };
              }
              return o;
            });
            const doc = { ...p, id, groups: same ? same.groups : 2, students: same ? same.students : masof ? 30 : 25, active: true, importedAt: new Date().toISOString() };
            plans = same ? plans.map((x) => (x.id === id ? doc : x)) : [...plans, doc];
            added += 1;
            lines.push(`✓ ${lcPlanLabel(p)} — ${p.subjects.length} ta fan (${f.name})`);
          }
        } catch (e) {
          lines.push(`${f.name}: o'qib bo'lmadi (${e.message || 'format xato'})`);
        }
      }
      if (added) store.replaceAll('plans', plans, `${added} ta ishchi o'quv reja yuklandi`);
    } catch (e) {
      lines.push(e.message);
    }
    setBusy(false);
    setLog(`${added} ta ish reja yuklandi. Guruhlar sonini tekshiring va «Avtomatik taqsimlash»ni bosing.\n${lines.join('\n')}`);
    if (added) setTab('plans');
  }

  const need = s.total / avgNorm(ctx);
  const have = ctx.teachers.reduce((a, t) => a + num(t.rate || 1), 0);
  const dp = s.total ? R(((s.total - s.unassigned) / s.total) * 100) : 0;

  function exportXlsx() {
    downloadXlsx(`yuklama-taqsimoti-${ctx.today}`, [
      { name: "O'qituvchilar", head: ["O'qituvchi", 'Lavozim', 'Stavka', "Me'yor", "Ma'ruza", 'Amaliy', 'Laboratoriya', 'Seminar', 'Kurs ishi', 'Kuzgi', 'Bahorgi', 'Jami', '%'], rows: s.rows.map((r) => [r.t.name, r.t.position, num(r.t.rate), r.norm, R(r.M), R(r.A), R(r.L), R(r.S), R(r.KI), R(r.h1), R(r.h2), R(r.total), r.norm ? R((r.total / r.norm) * 100) : 0]) },
      { name: "Mashg'ulotlar", head: ['Fan', 'Turi', 'Guruh', 'Ish reja', 'Semestr', 'Soat', "O'qituvchi"], rows: items.map((i) => [i.name, LC_KIND[i.kind], i.group, i.plan, i.sem, i.hours, i.teacherId ? ctx.tById.get(i.teacherId)?.name : 'taqsimlanmagan']) },
    ]).catch((e) => toast(e.message, 'bad'));
  }

  return (
    <>
      <PageHeader eyebrow="Ishchi o'quv rejalar asosida" title="Yuklama taqsimoti" sub={`${activePlans(ctx).length} ta faol ish reja · ${ctx.settings.year} o'quv yili · ${items.length} ta mashg'ulot birligi`}>
        <a className="btn" href="/namuna/ish-reja-namuna.xlsx" download>
          <Icon name="download" />
          Namuna reja
        </a>
        <label className="btn">
          <Icon name="upload" />
          Ish reja yuklash (.xlsx)
          <input
            type="file"
            accept=".xlsx,.xls"
            multiple
            hidden
            onChange={(e) => {
              const f = [...e.target.files];
              e.target.value = '';
              if (f.length) importFiles(f);
            }}
          />
        </label>
        <button type="button" className="btn primary" onClick={run} disabled={busy}>
          <Icon name="agent" />
          Avtomatik taqsimlash
        </button>
      </PageHeader>
      {stale && ctx.plans.length ? <div className="notice">Ish rejalar yoki parametrlar o'zgargan. Yangi hisob uchun «Avtomatik taqsimlash»ni bosing — qo'lda biriktirilganlar saqlanib qoladi.</div> : null}
      {busy ? <div className="progress indet" style={{ marginBottom: 12 }}><i /></div> : null}
      {log ? (
        <div className="panel" style={{ marginBottom: 16, whiteSpace: 'pre-wrap', fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span>{log}</span>
            <button type="button" className="icon-btn" onClick={() => setLog('')} aria-label="Yopish">
              <Icon name="close" />
            </button>
          </div>
        </div>
      ) : null}
      {ctx.plans.length ? (
        <section className="tiles">
          <div className="tile">
            <div className="lbl">Kafedra yuklamasi</div>
            <div className="val">
              {fmtNum(s.total)}
              <small> soat</small>
            </div>
            <div className="note">
              Kuzgi {fmtNum(s.h1)} · bahorgi {fmtNum(s.h2)}
            </div>
          </div>
          <div className="tile">
            <div className="lbl">Shtat: kerakli / mavjud</div>
            <div className="val">
              {need.toFixed(1)}
              <small> / {have} stavka</small>
            </div>
            <div className="note">O'rtacha me'yor {R(avgNorm(ctx))} soat</div>
          </div>
          <div className="tile">
            <div className="lbl">Taqsimlangan</div>
            <div className="val">
              {dp}
              <small>%</small>
            </div>
            <Bar value={dp} cls={dp >= 100 ? 'good' : dp >= 90 ? 'warn' : 'bad'} />
          </div>
          <div className="tile">
            <div className="lbl">Taqsimlanmagan</div>
            <div className="val" style={s.unassigned ? { color: 'var(--bad)' } : undefined}>
              {R(s.unassigned)}
              <small> soat</small>
            </div>
            <div className="note">{s.unassigned ? `≈ ${(s.unassigned / avgNorm(ctx)).toFixed(2)} stavka yetishmaydi` : 'Hammasi taqsimlangan'}</div>
          </div>
        </section>
      ) : null}
      <div className="filters">
        <Seg value={tab} onChange={setTab} label="Ko'rinish" options={[['dist', "O'qituvchilar bo'yicha"], ['subj', "Fanlar bo'yicha"], ['plans', `Ish rejalar (${ctx.plans.length})`]]} />
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn sm" onClick={exportXlsx} disabled={!items.length}>
            <Icon name="excel" />
            Excel
          </button>
          {items.some((i) => i.teacherId) ? (
            <ConfirmButton className="btn sm" question={`O'quv yuklama bo'limidagi ${ctx.subjects.length} ta yozuv almashtiriladi (o'tilgan soatlar saqlanadi).`} confirmText="Ha, o'tkazish" onConfirm={applyToSubjects}>
              O'quv yuklamaga o'tkazish
            </ConfirmButton>
          ) : null}
        </span>
      </div>
      {!ctx.plans.length ? (
        <Empty
          action={
            <label className="btn primary">
              Ish reja yuklash
              <input type="file" accept=".xlsx,.xls" multiple hidden onChange={(e) => importFiles([...e.target.files])} />
            </label>
          }
        >
          <strong style={{ color: 'var(--fg)' }}>Ishchi o'quv rejalarni yuklang</strong>
          <br />
          Excel (.xlsx) fayllarni tanlang — fanlar, semestrlar va soatlar avtomatik ajratib olinadi.
        </Empty>
      ) : tab === 'plans' ? (
        <Plans ctx={ctx} store={store} toast={toast} />
      ) : tab === 'subj' ? (
        <BySubject ctx={ctx} store={store} />
      ) : !items.length ? (
        <Empty>Hali taqsimlanmagan. «Avtomatik taqsimlash» tugmasini bosing.</Empty>
      ) : (
        <Dist ctx={ctx} s={s} onTeacher={setModalT} onAssign={assign} />
      )}
      {modalT ? <TeacherItems ctx={ctx} id={modalT} onClose={() => setModalT(null)} onAssign={assign} /> : null}
    </>
  );
}

function Dist({ ctx, s, onTeacher, onAssign }) {
  const rows = s.rows.slice().sort((a, b) => POS.indexOf(a.t.position) - POS.indexOf(b.t.position) || b.total - a.total);
  const un = allocItems(ctx).filter((i) => !i.teacherId);
  const T = (k) => R(s.rows.reduce((a, r) => a + r[k], 0));
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>O'qituvchi</th>
              <th>Stavka</th>
              <th>Me'yor</th>
              <th>Ma'ruza</th>
              <th>Amaliy</th>
              <th>Lab.</th>
              <th>Seminar</th>
              <th>Kurs ishi</th>
              <th>Kuzgi</th>
              <th>Bahorgi</th>
              <th>Jami</th>
              <th style={{ minWidth: 120 }}>Bajarilish</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const p = r.norm ? R((r.total / r.norm) * 100) : 0;
              return (
                <tr key={r.t.id} className={`click ${p > 105 ? 'row-warn' : ''}`} onClick={() => onTeacher(r.t.id)}>
                  <td>
                    <div className="strong">{r.t.name}</div>
                    <div className="t-sub">
                      {r.t.position} · {r.subs.size} ta fan
                    </div>
                  </td>
                  <td className="num">{num(r.t.rate)}</td>
                  <td className="num">{r.norm}</td>
                  {['M', 'A', 'L', 'S', 'KI'].map((k) => (
                    <td key={k} className="num">
                      {r[k] ? R(r[k]) : <span className="muted">—</span>}
                    </td>
                  ))}
                  <td className="num">{R(r.h1)}</td>
                  <td className="num">{R(r.h2)}</td>
                  <td className="num strong">{R(r.total)}</td>
                  <td>
                    <Bar value={Math.min(p, 100)} cls={p > 105 ? 'warn' : p >= 90 ? 'good' : p >= 70 ? '' : 'warn'} />
                    <div className="t-sub num">{p}%</div>
                  </td>
                </tr>
              );
            })}
            <tr className="total">
              <td>Jami</td>
              <td className="num">{ctx.teachers.reduce((a, t) => a + num(t.rate || 1), 0)}</td>
              <td className="num">{s.rows.reduce((a, r) => a + r.norm, 0)}</td>
              {['M', 'A', 'L', 'S', 'KI'].map((k) => (
                <td key={k} className="num">
                  {T(k)}
                </td>
              ))}
              <td className="num">{T('h1')}</td>
              <td className="num">{T('h2')}</td>
              <td className="num">{T('total')}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      {un.length ? (
        <section style={{ marginTop: 18 }}>
          <div className="panel-h">
            <h2>
              Taqsimlanmagan yuklama
              <span className="count">
                {un.length} ta · {R(un.reduce((a, i) => a + i.hours, 0))} soat
              </span>
            </h2>
            <span className="t-sub">Qo'lda biriktiring yoki yangi o'qituvchi qo'shib qayta taqsimlang</span>
          </div>
          <ItemTable items={un} showPlan ctx={ctx} onAssign={onAssign} />
        </section>
      ) : null}
    </>
  );
}

function TeacherItems({ ctx, id, onClose, onAssign }) {
  const t = ctx.tById.get(id);
  const items = allocItems(ctx)
    .filter((i) => i.teacherId === id)
    .sort((a, b) => a.sem - b.sem || a.name.localeCompare(b.name) || a.kind.localeCompare(b.kind));
  const r = wlSummary(ctx).rows.find((x) => x.t.id === id);
  if (!t || !r) return null;
  return (
    <Modal wide onClose={onClose} label={t.name}>
      <div className="modal-h">
        <div>
          <div className="eyebrow">
            {t.position} · {num(t.rate)} stavka · me'yor {r.norm} soat
          </div>
          <h2 style={{ fontSize: 20, marginTop: 4 }}>{t.name}</h2>
          <div className="t-sub">
            Jami {R(r.total)} soat ({r.norm ? R((r.total / r.norm) * 100) : 0}%) · kuzgi {R(r.h1)} · bahorgi {R(r.h2)}
          </div>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Yopish">
          <Icon name="close" />
        </button>
      </div>
      {items.length ? <ItemTable items={items} showPlan ctx={ctx} onAssign={onAssign} /> : <div className="empty">Yuklama biriktirilmagan</div>}
      <p className="t-sub" style={{ marginTop: 10 }}>O'qituvchini o'zgartirsangiz, bu biriktirish «qo'lda» deb belgilanadi va qayta taqsimlashda saqlanadi.</p>
    </Modal>
  );
}

function Plans({ ctx, store, toast }) {
  const cfg = ctx.loadcfg;
  const dupKey = (p) => [p.specCode, p.kurs, p.form, p.extra || ''].join('|');
  const cnt = {};
  activePlans(ctx).forEach((p) => {
    cnt[dupKey(p)] = (cnt[dupKey(p)] || 0) + 1;
  });
  const plans = ctx.plans.slice().sort((a, b) => a.kurs - b.kurs || String(a.specCode).localeCompare(b.specCode) || String(a.form).localeCompare(b.form));
  const hp = useMemo(() => {
    const m = {};
    lcBuildItems(ctx.plans, cfg).forEach((i) => {
      m[i.planId] = (m[i.planId] || 0) + i.hours;
    });
    return m;
  }, [ctx.plans, cfg]);
  const setCfg = (k, v) => {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) store.setMeta('loadcfg', { ...cfg, [k]: n });
  };
  const setPlan = (id, patch) => store.replaceAll('plans', ctx.plans.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  return (
    <>
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-h">
          <h2>Hisoblash parametrlari</h2>
        </div>
        <div className="form" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
          {[
            ['streamSize', "Ma'ruza potokidagi guruhlar", 1],
            ['labSplit', 'Laboratoriyada kichik guruhlar', 1],
            ['kiNorm', 'Kurs ishi (soat / talaba)', 0.5],
            ['overPct', "Me'yordan oshish chegarasi (%)", 1],
          ].map(([k, l, step]) => (
            <div key={k} className="field">
              <label htmlFor={`cf-${k}`}>{l}</label>
              <input id={`cf-${k}`} type="number" min="0" step={step} defaultValue={cfg[k]} onBlur={(e) => setCfg(k, e.target.value)} />
            </div>
          ))}
        </div>
        <p className="t-sub" style={{ margin: '10px 0 0' }}>
          Ma'ruza soati × potoklar soni, amaliy va seminar × guruhlar, laboratoriya × guruhlar × kichik guruhlar, kurs ishi × talabalar × me'yor. O'qituvchi me'yorlari Sozlamalar bo'limida.
        </p>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Faol</th>
              <th>Ish reja</th>
              <th>Yo'nalish</th>
              <th>Guruhlar</th>
              <th>Talaba / guruh</th>
              <th>Fanlar</th>
              <th>Kafedra soati</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => {
              const ours = (p.subjects || []).filter((x) => lcIsOurs(x.name, cfg)).length;
              const dup = p.active && cnt[dupKey(p)] > 1;
              return (
                <tr key={p.id} className={`${dup ? 'row-warn' : ''} ${p.active ? '' : 'muted'}`}>
                  <td>
                    <input type="checkbox" checked={!!p.active} onChange={(e) => setPlan(p.id, { active: e.target.checked })} aria-label="Faol" />
                  </td>
                  <td style={{ maxWidth: 320 }}>
                    <div className="strong">{lcPlanLabel(p)}</div>
                    <div className="t-sub" style={{ overflowWrap: 'anywhere' }}>
                      {p.file} · {p.sheet}
                      {dup ? <span style={{ color: 'var(--warn)' }}> · takroriy</span> : null}
                    </div>
                  </td>
                  <td>
                    <span className="num">{p.specCode}</span>
                    <div className="t-sub">{p.specName}</div>
                  </td>
                  <td>
                    <input type="number" min="0" style={{ width: 64 }} defaultValue={num(p.groups)} onBlur={(e) => setPlan(p.id, { groups: Math.max(0, Number(e.target.value) || 0) })} aria-label="Guruhlar" />
                    <div className="t-sub">
                      {lcGroups(p).slice(0, 2).join(', ')}
                      {num(p.groups) > 2 ? '…' : ''}
                    </div>
                  </td>
                  <td>
                    <input type="number" min="0" style={{ width: 64 }} defaultValue={num(p.students)} onBlur={(e) => setPlan(p.id, { students: Math.max(0, Number(e.target.value) || 0) })} aria-label="Talabalar" />
                  </td>
                  <td className="num">
                    {ours} / {(p.subjects || []).length}
                  </td>
                  <td className="num strong">{p.active ? R(hp[p.id] || 0) : '—'}</td>
                  <td>
                    <ConfirmButton
                      className="icon-btn"
                      confirmText="O'chirish"
                      onConfirm={() => {
                        store.replaceAll('plans', ctx.plans.filter((x) => x.id !== p.id), `Ish reja o'chirildi: ${lcPlanLabel(p)}`);
                        toast("Ish reja o'chirildi");
                      }}
                    >
                      <Icon name="trash" />
                    </ConfirmButton>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="t-sub" style={{ marginTop: 8 }}>Guruhlar va talabalar soni taxminiy kiritilgan — haqiqiy kontingentga moslang. Bir xil yo'nalish/kurs/shakl uchun bitta reja faol bo'lishi kerak.</p>
    </>
  );
}

function BySubject({ ctx, store }) {
  const cfg = ctx.loadcfg;
  const list = useMemo(() => {
    const map = new Map();
    for (const p of activePlans(ctx)) {
      for (const s of p.subjects || []) {
        const e = map.get(s.name) || { name: s.name, codes: new Set(), plans: [], sems: new Set(), tmpl: [], ours: lcIsOurs(s.name, cfg) };
        e.codes.add(s.code);
        e.plans.push(lcPlanLabel(p));
        Object.entries(s.sem).forEach(([k, v]) => {
          e.sems.add(k);
          e.tmpl = v;
        });
        map.set(s.name, e);
      }
    }
    return [...map.values()].sort((a, b) => b.ours - a.ours || a.name.localeCompare(b.name));
  }, [ctx, cfg]);
  const hours = {};
  const teachers = {};
  const un = {};
  allocItems(ctx).forEach((i) => {
    hours[i.name] = (hours[i.name] || 0) + i.hours;
    if (i.teacherId) (teachers[i.name] = teachers[i.name] || new Set()).add(i.teacherId);
    else un[i.name] = (un[i.name] || 0) + i.hours;
  });
  const toggle = (name, on) => {
    const oursOn = (cfg.oursOn || []).filter((x) => x !== name);
    const oursOff = (cfg.oursOff || []).filter((x) => x !== name);
    (on ? oursOn : oursOff).push(name);
    store.setMeta('loadcfg', { ...cfg, oursOn, oursOff });
  };
  return (
    <>
      <p className="lead">Faol ish rejalardagi joriy o'quv yili fanlari. «Kafedra fani» belgilanganlari yuklamaga kiradi; qolganlari boshqa kafedralarga tegishli deb hisoblanadi.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Kafedra fani</th>
              <th>Fan</th>
              <th>Semestr</th>
              <th>Soatlar (M/A/L/S)</th>
              <th>Ish rejalar</th>
              <th>Yuklama</th>
              <th>O'qituvchilar</th>
            </tr>
          </thead>
          <tbody>
            {list.map((e) => (
              <tr key={e.name} className={`${e.ours ? '' : 'muted'} ${un[e.name] ? 'row-bad' : ''}`}>
                <td>
                  <input type="checkbox" checked={e.ours} onChange={(ev) => toggle(e.name, ev.target.checked)} aria-label="Kafedra fani" />
                </td>
                <td className="t-title">
                  {e.name}
                  <div className="t-sub num">{[...e.codes].join(', ')}</div>
                </td>
                <td className="num">{[...e.sems].sort().join(', ')}</td>
                <td className="num">{e.tmpl.join(' / ')}</td>
                <td className="t-sub">{[...new Set(e.plans)].join('; ')}</td>
                <td className="num strong">
                  {e.ours ? R(hours[e.name] || 0) : '—'}
                  {un[e.name] ? <div className="t-sub" style={{ color: 'var(--bad)' }}>{R(un[e.name])} taqsimlanmagan</div> : null}
                </td>
                <td className="t-sub">{e.ours ? [...(teachers[e.name] || [])].map((id) => shortName(ctx.tById.get(id)?.name)).join(', ') || '—' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
