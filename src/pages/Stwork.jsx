import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Empty, PageHeader, Pill } from '../components/ui.jsx';
import { useUI } from '../components/UIProvider.jsx';
import { useCtx } from '../store/StoreContext.jsx';
import { ST_KINDS } from '../lib/constants.js';
import { stLate } from '../lib/analytics.js';
import { fmtShort } from '../lib/dates.js';
import { shortName } from '../lib/format.js';

export default function Stwork() {
  const ctx = useCtx();
  const { openForm, remind } = useUI();
  const [kind, setKind] = useState('');
  let list = ctx.stwork.slice();
  if (kind) list = list.filter((s) => s.kind === kind);
  list.sort((a, b) => stLate(ctx, b) - stLate(ctx, a) || String(a.deadline || '9').localeCompare(String(b.deadline || '9')));
  const counts = ST_KINDS.map((k) => [k, ctx.stwork.filter((s) => s.kind === k).length]).filter((x) => x[1]);
  return (
    <>
      <PageHeader eyebrow="Talabalar bilan ishlash" title="Talabalar bilan ish" sub={`${ctx.stwork.length} ta ish · ${ctx.stwork.filter((s) => s.status === 'Yakunlandi').length} yakunlangan · ${ctx.stwork.filter((s) => stLate(ctx, s)).length} kechikkan`}>
        <button type="button" className="btn primary" onClick={() => openForm('stwork')}>
          <Icon name="plus" />
          Ish qo'shish
        </button>
      </PageHeader>
      <div className="filters">
        <div className="chips">
          <button type="button" className="chip" aria-pressed={!kind} onClick={() => setKind('')}>
            Hammasi
          </button>
          {counts.map(([k, n]) => (
            <button key={k} type="button" className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>
              {k} · {n}
            </button>
          ))}
        </div>
      </div>
      {list.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Mavzu</th>
                <th>Turi</th>
                <th>Talaba</th>
                <th>Rahbar</th>
                <th>Muddat</th>
                <th>Holat</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((s) => {
                const l = stLate(ctx, s);
                return (
                  <tr key={s.id} className={l ? 'row-bad' : ''}>
                    <td className="t-title">{s.topic}</td>
                    <td>
                      <span className="tag">{s.kind}</span>
                    </td>
                    <td>{s.student || '—'}</td>
                    <td>{shortName(ctx.tById.get(s.teacherId)?.name)}</td>
                    <td className="num">{fmtShort(s.deadline)}</td>
                    <td>{l ? <Pill cls="bad">Kechikkan</Pill> : <Pill cls={s.status === 'Yakunlandi' ? 'good' : s.status === 'Jarayonda' ? 'info' : ''}>{s.status}</Pill>}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {l ? (
                        <button type="button" className="icon-btn" onClick={() => remind({ teacherId: s.teacherId, subject: `${s.kind}: «${s.topic}» (${s.student || 'talaba'}) muddati o'tgan`, when: s.deadline })} aria-label="Eslatma" title="Eslatma (Telegram)">
                          <Icon name="telegram" />
                        </button>
                      ) : null}
                      <button type="button" className="icon-btn" onClick={() => openForm('stwork', s.id)} aria-label="Tahrirlash">
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
        <Empty action={<button type="button" className="btn primary" onClick={() => openForm('stwork')}>Ish qo'shish</button>}>Bu bo'limda hali yozuv yo'q.</Empty>
      )}
    </>
  );
}
