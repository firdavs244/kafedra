import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { Empty, PageHeader, Pill } from '../components/ui.jsx';
import { useUI } from '../components/UIProvider.jsx';
import { useCtx } from '../store/StoreContext.jsx';
import { PUB_STATUS, PUB_TYPES } from '../lib/constants.js';
import { pubLate, pubSoon, teacherStats } from '../lib/analytics.js';
import { daysBetween, fmtShort } from '../lib/dates.js';
import { matchText, shortName } from '../lib/format.js';
import { downloadXlsx } from '../export/files.js';

export default function Pubs() {
  const ctx = useCtx();
  const { openForm, remind, toast } = useUI();
  const [params] = useSearchParams();
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [teacher, setTeacher] = useState('');
  const [onlyLate, setOnlyLate] = useState(false);
  const [q, setQ] = useState(params.get('q') || '');
  const all = ctx.pubs;
  let list = all.slice();
  if (status) list = list.filter((p) => p.status === status);
  if (type) list = list.filter((p) => p.type === type);
  if (teacher) list = list.filter((p) => p.teacherId === teacher);
  if (onlyLate) list = list.filter((p) => pubLate(ctx, p) || pubSoon(ctx, p));
  if (q) list = list.filter((p) => matchText(`${p.title} ${p.journal} ${p.coauthors}`, q));
  list.sort((a, b) => pubLate(ctx, b) - pubLate(ctx, a) || String(a.deadline || '9').localeCompare(String(b.deadline || '9')));
  const late = all.filter((p) => pubLate(ctx, p)).length;
  const behind = ctx.teachers.filter((t) => teacherStats(ctx, t).pubBehind).length;

  return (
    <>
      <PageHeader
        eyebrow="Ilmiy faoliyat"
        title="Ilmiy ishlar va maqolalar"
        sub={
          <>
            {all.length} ta ish{late ? <span style={{ color: 'var(--bad)' }}> · {late} tasining muddati o'tgan</span> : null} · {behind} o'qituvchi yillik rejadan ortda
          </>
        }
      >
        <button
          type="button"
          className="btn"
          onClick={() => downloadXlsx(`ilmiy-ishlar-${ctx.today}`, [{ name: 'Ilmiy ishlar', head: ['Mavzu', 'Muallif', 'Hammualliflar', 'Turi', 'Jurnal', 'Kvartil', 'Holat', 'Reja muddati', 'Chop sanasi'], rows: list.map((p) => [p.title, ctx.tById.get(p.teacherId)?.name || '', p.coauthors, p.type, p.journal, p.quartile, p.status, p.deadline, p.pubDate]) }]).catch((e) => toast(e.message, 'bad'))}
        >
          <Icon name="excel" />
          Excel
        </button>
        <button type="button" className="btn primary" onClick={() => openForm('pubs')}>
          <Icon name="plus" />
          Ilmiy ish
        </button>
      </PageHeader>
      <div className="pipe" role="group" aria-label="Holatlar">
        {PUB_STATUS.map((s) => (
          <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(status === s ? '' : s)}>
            <b>{all.filter((p) => p.status === s).length}</b>
            <span>{s}</span>
          </button>
        ))}
      </div>
      <div className="filters">
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Holat">
          <option value="">Barcha holatlar</option>
          {PUB_STATUS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Tur">
          <option value="">Barcha turlar</option>
          {PUB_TYPES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select value={teacher} onChange={(e) => setTeacher(e.target.value)} aria-label="Muallif">
          <option value="">Barcha mualliflar</option>
          {ctx.teachers.slice().sort((a, b) => a.name.localeCompare(b.name)).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Mavzu yoki jurnal…" aria-label="Qidiruv" />
        <label className="check">
          <input type="checkbox" checked={onlyLate} onChange={(e) => setOnlyLate(e.target.checked)} /> Faqat kechikkan va yaqin muddatlilar
        </label>
      </div>
      {list.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Mavzu</th>
                <th>Muallif</th>
                <th>Turi</th>
                <th>Holat</th>
                <th>Reja muddati</th>
                <th>Chop</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const l = pubLate(ctx, p);
                const s = pubSoon(ctx, p);
                return (
                  <tr key={p.id} className={l ? 'row-bad' : s ? 'row-warn' : ''}>
                    <td className="t-title">
                      {p.title}
                      <div className="t-sub">
                        {p.journal}
                        {p.coauthors ? ` · ${p.coauthors}` : ''}
                      </div>
                    </td>
                    <td>{shortName(ctx.tById.get(p.teacherId)?.name)}</td>
                    <td>
                      <span className="tag">
                        {p.type}
                        {p.quartile && p.quartile !== '—' ? ` · ${p.quartile}` : ''}
                      </span>
                    </td>
                    <td>
                      {l ? (
                        <Pill cls="bad">{p.status} · {daysBetween(p.deadline, ctx.today)} kun kechikkan</Pill>
                      ) : s ? (
                        <Pill cls="warn">{p.status} · {daysBetween(ctx.today, p.deadline)} kun qoldi</Pill>
                      ) : (
                        <Pill cls={p.status === 'Chop etilgan' || p.status === 'Qabul qilingan' ? 'good' : p.status === 'Yuborilgan' ? 'info' : ''}>{p.status}</Pill>
                      )}
                    </td>
                    <td className="num">{fmtShort(p.deadline)}</td>
                    <td className="num muted">{fmtShort(p.pubDate)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {l || s ? (
                        <button type="button" className="icon-btn" onClick={() => remind({ teacherId: p.teacherId, subject: `«${p.title}» (${p.type}) ${l ? "ishining muddati o'tgan" : 'ishining muddati yaqinlashmoqda'}, holati hozircha «${p.status}»`, when: p.deadline })} aria-label="Eslatma" title="Eslatma (Telegram)">
                          <Icon name="telegram" />
                        </button>
                      ) : null}
                      <button type="button" className="icon-btn" onClick={() => openForm('pubs', p.id)} aria-label="Tahrirlash">
                        <Icon name="edit" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty action={<button type="button" className="btn primary" onClick={() => openForm('pubs')}>Ilmiy ish qo'shish</button>}>Bu filtr bo'yicha ilmiy ish topilmadi.</Empty>
      )}
    </>
  );
}
