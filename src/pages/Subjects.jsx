import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { Empty, PageHeader, Pill, Seg } from '../components/ui.jsx';
import { useUI } from '../components/UIProvider.jsx';
import { useCtx, useStore } from '../store/StoreContext.jsx';
import { currentSemester, semFrac, subjState } from '../lib/analytics.js';
import { matchText, num, shortName } from '../lib/format.js';
import { downloadXlsx } from '../export/files.js';

export default function Subjects() {
  const ctx = useCtx();
  const store = useStore();
  const { openForm, toast } = useUI();
  const [params] = useSearchParams();
  const [sem, setSem] = useState(currentSemester(ctx));
  const [teacher, setTeacher] = useState('');
  const [q, setQ] = useState(params.get('q') || '');
  const [onlyBehind, setOnlyBehind] = useState(false);

  let list = ctx.subjects.slice();
  if (sem !== 'all') list = list.filter((s) => String(s.semester || '1') === sem);
  if (teacher) list = list.filter((s) => s.teacherId === teacher);
  if (q) list = list.filter((s) => matchText(`${s.name} ${s.group}`, q));
  const rows = list.map((s) => ({ s, st: subjState(ctx, s) }));
  const shown = onlyBehind ? rows.filter((x) => x.st.cls === 'bad' || x.st.cls === 'warn') : rows;
  shown.sort((a, b) => (ctx.tById.get(a.s.teacherId)?.name || '').localeCompare(ctx.tById.get(b.s.teacherId)?.name || '') || a.s.name.localeCompare(b.s.name));
  const plan = list.reduce((a, s) => a + num(s.planHours), 0);
  const done = list.reduce((a, s) => a + num(s.doneHours), 0);
  const exp = Math.round(rows.reduce((a, x) => a + x.st.exp, 0));
  const fr = sem === 'all' ? null : Math.round(semFrac(ctx, sem) * 100);
  const teachers = ctx.teachers.slice().sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <PageHeader eyebrow="O'quv ishi" title="O'quv yuklama" sub={`Rejadagi ${plan} soat · o'tilgan ${done} · bugungacha kutilgan ${exp}${fr != null ? ` · semestrning ${fr}% o'tdi` : ''}`}>
        <button
          type="button"
          className="btn"
          onClick={() => downloadXlsx(`oquv-yuklama-${ctx.today}`, [{ name: "O'quv yuklama", head: ['Fan', "O'qituvchi", 'Turi', 'Guruh', 'Semestr', 'Reja', "O'tildi", 'Kutilgan', 'Holat'], rows: shown.map(({ s, st }) => [s.name, ctx.tById.get(s.teacherId)?.name || '', s.kind, s.group, s.semester, num(s.planHours), num(s.doneHours), Math.round(st.exp), st.label]) }]).catch((e) => toast(e.message, 'bad'))}
        >
          <Icon name="excel" />
          Excel
        </button>
        <button type="button" className="btn primary" onClick={() => openForm('subjects')}>
          <Icon name="plus" />
          Fan qo'shish
        </button>
      </PageHeader>
      <div className="filters">
        <Seg value={sem} onChange={setSem} label="Semestr" options={[['1', '1-semestr'], ['2', '2-semestr'], ['all', 'Hammasi']]} />
        <select value={teacher} onChange={(e) => setTeacher(e.target.value)} aria-label="O'qituvchi">
          <option value="">Barcha o'qituvchilar</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Fan yoki guruh…" aria-label="Qidiruv" />
        <label className="check">
          <input type="checkbox" checked={onlyBehind} onChange={(e) => setOnlyBehind(e.target.checked)} /> Faqat ortda qolganlar
        </label>
      </div>
      {shown.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fan</th>
                <th>O'qituvchi</th>
                <th>Turi</th>
                <th>Guruh</th>
                <th>Sem</th>
                <th>Reja</th>
                <th>O'tildi</th>
                <th>Kutilgan</th>
                <th>Holat</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map(({ s, st }) => (
                <tr key={s.id} className={st.cls === 'bad' ? 'row-bad' : st.cls === 'warn' ? 'row-warn' : ''}>
                  <td className="t-title">{s.name}</td>
                  <td>{shortName(ctx.tById.get(s.teacherId)?.name)}</td>
                  <td>
                    <span className="tag">{s.kind || '—'}</span>
                  </td>
                  <td className="t-sub" style={{ maxWidth: 220 }}>{s.group}</td>
                  <td className="num">{s.semester || '1'}</td>
                  <td className="num">{num(s.planHours)}</td>
                  <td className="num strong">{num(s.doneHours)}</td>
                  <td className="num muted">{Math.round(st.exp)}</td>
                  <td>
                    <Pill cls={st.cls}>{st.label}</Pill>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button
                      type="button"
                      className="btn sm"
                      title="2 soat (1 juftlik) qo'shish"
                      onClick={() => {
                        store.update('subjects', s.id, { doneHours: num(s.doneHours) + 2 }, { silent: true });
                        toast(`${s.name}: +2 soat`);
                      }}
                    >
                      +2
                    </button>{' '}
                    <button type="button" className="icon-btn" onClick={() => openForm('subjects', s.id)} aria-label="Tahrirlash">
                      <Icon name="edit" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty action={<button type="button" className="btn primary" onClick={() => openForm('subjects')}>Fan qo'shish</button>}>Bu filtr bo'yicha fan topilmadi.</Empty>
      )}
      <p className="t-sub" style={{ marginTop: 10 }}>«Kutilgan» — yillik rejaning semestrning o'tgan ulushiga mos qismi. 90% dan yuqori — me'yorda, 75–90% — biroz ortda, 75% dan past — ortda.</p>
    </>
  );
}
