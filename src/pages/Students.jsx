import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { Bar, Empty, PageHeader, Pill, Seg, toneOf } from '../components/ui.jsx';
import { useUI } from '../components/UIProvider.jsx';
import { useCtx } from '../store/StoreContext.jsx';
import { PASS_TARGET } from '../lib/constants.js';
import { contingent, debtors, gradeRow, gradesByGroup, gradesBySubject, gradesTotal, groupsFromPlans } from '../lib/grades.js';
import { daysBetween, fmtShort } from '../lib/dates.js';
import { matchText, shortName } from '../lib/format.js';
import { downloadXlsx } from '../export/files.js';

export default function Students() {
  const ctx = useCtx();
  const { openForm, remind, toast } = useUI();
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get('guruh') ? 'groups' : 'subjects');
  const [kurs, setKurs] = useState('');
  const [q, setQ] = useState(params.get('guruh') || '');
  const cont = contingent(ctx);
  const t = gradesTotal(ctx);
  const list = debtors(ctx);
  const session = ctx.grades[0]?.session || '';
  const nextDeadline = list.map((d) => d.deadline).filter(Boolean).sort()[0];
  const groups = groupsFromPlans(ctx);
  const byGroup = useMemo(() => new Map(gradesByGroup(ctx).map((g) => [`${g.kurs}|${g.group}`, g])), [ctx]);
  const tname = (id) => shortName(ctx.tById.get(id)?.name);

  function exportXlsx() {
    downloadXlsx(`ozlashtirish-${ctx.today}`, [
      { name: 'Fanlar', pre: [session], head: ['Fan', "O'qituvchi", 'Guruhlar', "O'zlashtirish %", 'Sifat %', 'Qarzdorlar'], rows: gradesBySubject(ctx).map((x) => [x.subject, x.teacherIds.map(tname).join(', '), x.groups, x.pass, x.quality, x.f]) },
      { name: 'Guruhlar', head: ['Guruh', 'Kurs', 'Talabalar', "O'zlashtirish %", 'Sifat %', 'Qarzdorlar'], rows: gradesByGroup(ctx).map((g) => [g.group, g.kurs, g.students, g.pass, g.quality, g.f]) },
      { name: 'Qarzdorlar', head: ['Talaba', 'Guruh', 'Fan', "O'qituvchi", 'Qayta topshirish'], rows: list.map((d) => [d.name, d.group, d.subject, tname(d.teacherId), fmtShort(d.deadline)]) },
    ]).catch((e) => toast(e.message, 'bad'));
  }

  return (
    <>
      <PageHeader eyebrow="Talabalar va guruhlar" title="Talabalar va o'zlashtirish" sub={`${cont.students} talaba · ${cont.groups} guruh · ${session}`}>
        <Link className="btn" to="/hujjat">
          <Icon name="camera" />
          Qaydnomani rasmdan kiritish
        </Link>
        <button type="button" className="btn" onClick={exportXlsx}>
          <Icon name="excel" />
          Excel
        </button>
        <button type="button" className="btn primary" onClick={() => openForm('grades')}>
          <Icon name="plus" />
          Qaydnoma
        </button>
      </PageHeader>
      <section className="tiles">
        <div className="tile">
          <div className="lbl">Talabalar kontingenti</div>
          <div className="val">
            {cont.students}
            <small> nafar</small>
          </div>
          <div className="note">{cont.groups} ta guruh, faol ish rejalar bo'yicha</div>
        </div>
        <div className="tile">
          <div className="lbl">O'zlashtirish</div>
          <div className="val">
            {t.pass}
            <small>%</small>
          </div>
          <Bar value={t.pass} cls={toneOf(t.pass, 85, PASS_TARGET)} mark={PASS_TARGET} />
          <div className="note" style={{ marginTop: 6 }}>me'yor {PASS_TARGET}% · o'rtacha baho {t.avg}</div>
        </div>
        <div className="tile">
          <div className="lbl">Sifat ko'rsatkichi</div>
          <div className="val">
            {t.quality}
            <small>%</small>
          </div>
          <div className="note">«a'lo» va «yaxshi» baholar ulushi</div>
        </div>
        <div className="tile">
          <div className="lbl">Akademik qarzdorlar</div>
          <div className="val" style={t.f ? { color: 'var(--bad)' } : undefined}>
            {t.f}
            <small> nafar</small>
          </div>
          <div className="note">{nextDeadline ? `qayta topshirish: ${fmtShort(nextDeadline)} (${daysBetween(ctx.today, nextDeadline)} kun)` : "qarzdor yo'q"}</div>
        </div>
      </section>
      <div className="filters">
        <Seg value={tab} onChange={setTab} label="Ko'rinish" options={[['subjects', "Fanlar bo'yicha"], ['groups', "Guruhlar bo'yicha"], ['debtors', `Qarzdorlar (${list.length})`]]} />
        <select value={kurs} onChange={(e) => setKurs(e.target.value)} aria-label="Kurs">
          <option value="">Barcha kurslar</option>
          {[...new Set(groups.map((g) => g.kurs))].sort().map((k) => (
            <option key={k} value={k}>
              {k}-kurs
            </option>
          ))}
        </select>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Guruh, fan yoki talaba…" aria-label="Qidiruv" />
      </div>
      {!ctx.grades.length ? (
        <Empty action={<button type="button" className="btn primary" onClick={() => openForm('grades')}>Qaydnoma qo'shish</button>}>O'zlashtirish ma'lumotlari hali kiritilmagan.</Empty>
      ) : tab === 'subjects' ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fan</th>
                <th>O'qituvchi</th>
                <th>Guruhlar</th>
                <th style={{ minWidth: 150 }}>O'zlashtirish</th>
                <th>Sifat</th>
                <th>Qarzdorlar</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {gradesBySubject(ctx)
                .filter((x) => matchText(x.subject, q))
                .map((x) => (
                  <tr key={x.subject} className={x.pass < PASS_TARGET - 5 ? 'row-bad' : x.pass < PASS_TARGET ? 'row-warn' : ''}>
                    <td className="t-title">{x.subject}</td>
                    <td>{x.teacherIds.map(tname).join(', ')}</td>
                    <td className="num">{x.groups}</td>
                    <td>
                      <Bar value={x.pass} cls={toneOf(x.pass, 85, PASS_TARGET)} mark={PASS_TARGET} />
                      <div className="t-sub num">{x.pass}%</div>
                    </td>
                    <td className="num">{x.quality}%</td>
                    <td className="num strong" style={x.f ? { color: 'var(--bad)' } : undefined}>{x.f}</td>
                    <td>
                      {x.pass < PASS_TARGET && x.teacherIds[0] ? (
                        <button type="button" className="btn sm" onClick={() => remind({ teacherId: x.teacherIds[0], subject: `«${x.subject}» fanidan o'zlashtirish ${x.pass}% (me'yor ${PASS_TARGET}%), ${x.f} nafar talaba qarzdor. Qayta topshirish jadvali va qo'shimcha mashg'ulotlar rejasini yuboring`, when: nextDeadline })}>
                          <Icon name="telegram" />
                          Eslatma
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : tab === 'groups' ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Guruh</th>
                <th>Ish reja</th>
                <th>Talabalar</th>
                <th style={{ minWidth: 150 }}>O'zlashtirish</th>
                <th>Sifat</th>
                <th>Qarzdorlar</th>
              </tr>
            </thead>
            <tbody>
              {groups
                .filter((g) => (!kurs || +g.kurs === +kurs) && matchText(`${g.name} ${g.plan}`, q))
                .map((g) => {
                  const st = byGroup.get(`${g.kurs}|${g.name}`);
                  return (
                    <tr key={g.key} className={st && st.pass < PASS_TARGET ? 'row-warn' : ''}>
                      <td className="strong num">{g.name}</td>
                      <td className="t-sub">{g.plan}</td>
                      <td className="num">{g.students}</td>
                      <td>
                        {st ? (
                          <>
                            <Bar value={st.pass} cls={toneOf(st.pass, 85, PASS_TARGET)} mark={PASS_TARGET} />
                            <div className="t-sub num">{st.pass}% · {st.subjects} fan</div>
                          </>
                        ) : (
                          <span className="t-sub">{g.kurs === 1 ? 'birinchi sessiya hali bo\'lmagan' : "ma'lumot yo'q"}</span>
                        )}
                      </td>
                      <td className="num">{st ? `${st.quality}%` : '—'}</td>
                      <td className="num strong" style={st?.f ? { color: 'var(--bad)' } : undefined}>{st ? st.f : '—'}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      ) : (
        <Debtors ctx={ctx} list={list.filter((d) => (!kurs || +d.kurs === +kurs) && matchText(`${d.name} ${d.group} ${d.subject}`, q))} openForm={openForm} tname={tname} />
      )}
      <p className="t-sub" style={{ marginTop: 10 }}>
        O'zlashtirish = qoniqarli va undan yuqori baho olganlar ulushi; sifat = «a'lo» va «yaxshi» ulushi. Kontingent (guruhlar va talabalar soni) Yuklama taqsimoti → Ish rejalar bo'limidan olinadi.
      </p>
    </>
  );
}

function Debtors({ ctx, list, openForm, tname }) {
  const byGrade = new Map(ctx.grades.map((g) => [g.id, g]));
  return list.length ? (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>№</th>
            <th>Talaba</th>
            <th>Guruh</th>
            <th>Fan</th>
            <th>O'qituvchi</th>
            <th>Qayta topshirish</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {list.map((d, i) => {
            const left = d.deadline ? daysBetween(ctx.today, d.deadline) : null;
            const g = byGrade.get(d.gradeId);
            return (
              <tr key={`${d.gradeId}-${d.name}-${i}`} className={left != null && left < 0 ? 'row-bad' : ''}>
                <td className="num muted">{i + 1}</td>
                <td className="strong">{d.name}</td>
                <td className="num">{d.group}</td>
                <td>{d.subject}</td>
                <td>{tname(d.teacherId)}</td>
                <td>
                  <span className="num">{fmtShort(d.deadline)}</span> {left != null ? <Pill cls={left < 0 ? 'bad' : left <= 5 ? 'warn' : 'info'}>{left < 0 ? `${-left} kun o'tdi` : `${left} kun`}</Pill> : null}
                </td>
                <td>
                  {g ? (
                    <button type="button" className="icon-btn" onClick={() => openForm('grades', g.id)} aria-label="Qaydnomani tahrirlash" title={`Qaydnoma: ${gradeRow(g).pass}% o'zlashtirish`}>
                      <Icon name="edit" />
                    </button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty>Qarzdor talaba topilmadi.</Empty>
  );
}
