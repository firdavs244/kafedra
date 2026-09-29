import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Bar, Empty, PageHeader, Pill, Seg } from '../components/ui.jsx';
import { useUI } from '../components/UIProvider.jsx';
import { useCtx } from '../store/StoreContext.jsx';
import { teacherStats } from '../lib/analytics.js';
import { matchText, num } from '../lib/format.js';
import { downloadXlsx } from '../export/files.js';

export default function Teachers() {
  const ctx = useCtx();
  const { openForm, openTeacher, toast } = useUI();
  const [sort, setSort] = useState('name');
  const [q, setQ] = useState('');
  const rows = ctx.teachers.filter((t) => matchText(`${t.name} ${t.position}`, q)).map((t) => ({ t, s: teacherStats(ctx, t) }));
  const sorters = {
    name: (a, b) => a.t.name.localeCompare(b.t.name),
    score: (a, b) => b.s.score - a.s.score,
    late: (a, b) => b.s.overdue.length - a.s.overdue.length || a.s.loadPace - b.s.loadPace,
  };
  rows.sort(sorters[sort]);
  const exportXlsx = () =>
    downloadXlsx(`oqituvchilar-${ctx.today}`, [
      {
        name: "O'qituvchilar",
        head: ['F.I.Sh.', 'Lavozim', 'Daraja', 'Stavka', 'Yuklama', "Me'yor", "O'tilgan", 'Kutilgan', 'Maqola (bajarilgan)', 'Maqola rejasi', "Muddati o'tgan", 'Reyting'],
        rows: rows.map(({ t, s }) => [t.name, t.position, t.degree, num(t.rate), s.plan, s.norm, s.done, s.expected, s.published + s.accepted, s.pubPlan, s.overdue.length, s.score]),
      },
    ]).catch((e) => toast(e.message, 'bad'));

  return (
    <>
      <PageHeader eyebrow="Kafedra tarkibi" title="O'qituvchilar" sub={`${ctx.teachers.length} nafar · stavkalar jami ${ctx.teachers.reduce((a, t) => a + num(t.rate), 0)}`}>
        <Seg value={sort} onChange={setSort} label="Saralash" options={[['name', 'Ism'], ['score', 'Reyting'], ['late', 'Ortda']]} />
        <button type="button" className="btn" onClick={exportXlsx}>
          <Icon name="excel" />
          Excel
        </button>
        <button type="button" className="btn primary" onClick={() => openForm('teachers')}>
          <Icon name="plus" />
          O'qituvchi
        </button>
      </PageHeader>
      <div className="filters">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ism yoki lavozim…" aria-label="Qidiruv" />
      </div>
      {rows.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>O'qituvchi</th>
                <th>Stavka</th>
                <th>Yuklama / me'yor</th>
                <th>Dars bajarilishi</th>
                <th>Maqolalar</th>
                <th>Loyiha</th>
                <th className="right">Ball</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ t, s }) => {
                const lp = Math.round(s.loadPace * 100);
                return (
                  <tr key={t.id} className={`click ${s.overdue.length ? 'row-bad' : s.pubBehind ? 'row-warn' : ''}`} onClick={() => openTeacher(t.id)}>
                    <td>
                      <div className="strong">{t.name}</div>
                      <div className="t-sub">
                        {t.position}
                        {t.degree && t.degree !== '—' ? `, ${t.degree}` : ''}
                      </div>
                    </td>
                    <td className="num">{num(t.rate)}</td>
                    <td>
                      <div className="num">
                        {s.plan} / {s.norm}
                      </div>
                      {s.loadState === 'over' ? <Pill cls="warn">Ortiqcha</Pill> : s.loadState === 'under' ? <Pill cls="warn">Kam</Pill> : <Pill cls="good">Me'yorda</Pill>}
                    </td>
                    <td style={{ minWidth: 130 }}>
                      <div className="num">
                        {s.done} / {s.expected} soat
                      </div>
                      <Bar value={Math.min(lp, 100)} cls={lp >= 90 ? 'good' : lp >= 75 ? 'warn' : 'bad'} />
                    </td>
                    <td>
                      <div className="num">
                        {s.published + s.accepted} / {s.pubPlan}
                      </div>
                      {s.overdue.length ? <Pill cls="bad">{s.overdue.length} muddati o'tgan</Pill> : s.pubBehind ? <Pill cls="warn">Ortda</Pill> : <Pill cls="good">Rejada</Pill>}
                    </td>
                    <td className="num">
                      {s.lead ? `${s.lead} rahbar` : ''}
                      {s.lead && s.member ? ', ' : ''}
                      {s.member ? `${s.member} ijrochi` : ''}
                      {!s.lead && !s.member ? <span className="muted">—</span> : null}
                    </td>
                    <td className="num strong right">{s.score}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty action={<button type="button" className="btn primary" onClick={() => openForm('teachers')}>O'qituvchi qo'shish</button>}>O'qituvchi topilmadi.</Empty>
      )}
      <p className="t-sub" style={{ marginTop: 10 }}>
        Reyting bali: chop etilgan maqolalar (Scopus/WoS 10, monografiya 8, darslik 7, OAK 5, konferensiya 2–3), loyihalar (rahbar 6, ijrochi 3), talabalar bilan ish va dars jadvaliga rioya; muddati o'tgan ishlar ball kamaytiradi. Formula ochiq — qaror uchun asos, jazo vositasi emas.
      </p>
    </>
  );
}
