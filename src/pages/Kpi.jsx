import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Bar, Empty, PageHeader, Pill } from '../components/ui.jsx';
import { useUI } from '../components/UIProvider.jsx';
import { useCtx, useStore } from '../store/StoreContext.jsx';
import { KPI_CATS } from '../lib/constants.js';
import { kpiScore, kpiStatus } from '../lib/analytics.js';
import { fmtMonth, fmtShort, lastDay, nextMonth } from '../lib/dates.js';
import { num, shortName } from '../lib/format.js';

export default function Kpi() {
  const ctx = useCtx();
  const store = useStore();
  const { openForm, remind, toast } = useUI();
  const [period, setPeriod] = useState(ctx.today.slice(0, 7));
  const periods = [...new Set(ctx.kpi.map((k) => k.period).filter(Boolean).concat(ctx.today.slice(0, 7)))].sort().reverse();
  const list = ctx.kpi.filter((k) => k.period === period).sort((a, b) => String(a.code).localeCompare(String(b.code), undefined, { numeric: true }));
  const st = list.map((k) => kpiStatus(ctx, k));
  const cnt = (key) => st.filter((s) => s.key === key).length;
  const groups = KPI_CATS.map((c) => [c, list.filter((k) => k.category === c)]).concat([['Boshqa', list.filter((k) => !KPI_CATS.includes(k.category))]]).filter((g) => g[1].length);

  function copyNext() {
    const n = nextMonth(period);
    const exist = new Set(ctx.kpi.filter((k) => k.period === n).map((k) => `${k.code}|${k.title}`));
    const docs = list
      .filter((k) => !exist.has(`${k.code}|${k.title}`))
      .map(({ id, createdAt, updatedAt, ...rest }) => ({ ...rest, actual: 0, period: n, deadline: `${n}-${String(lastDay(n)).padStart(2, '0')}` }));
    if (!docs.length) {
      toast('Barcha bandlar allaqachon mavjud');
      return;
    }
    store.insertMany('kpi', docs, `${docs.length} ta KPI bandi ${fmtMonth(n)}ga ko'chirildi`);
    toast(`${docs.length} ta band ${fmtMonth(n)}ga ko'chirildi`);
    setPeriod(n);
  }

  return (
    <>
      <PageHeader eyebrow="Samaradorlik ko'rsatkichlari" title={`KPI · ${fmtMonth(period)}`} sub={`Umumiy bajarilish ${kpiScore(list)}% (vaznli) · ${cnt('done')} bajarildi · ${cnt('progress')} jarayonda · ${cnt('risk')} xavf ostida · ${cnt('failed')} bajarilmadi`}>
        <select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Oy">
          {periods.map((x) => (
            <option key={x} value={x}>
              {fmtMonth(x)}
            </option>
          ))}
        </select>
        {list.length ? (
          <button type="button" className="btn" onClick={copyNext}>
            {fmtMonth(nextMonth(period))}ga nusxalash
          </button>
        ) : null}
        <button type="button" className="btn primary" onClick={() => openForm('kpi', null, { period })}>
          <Icon name="plus" />
          KPI bandi
        </button>
      </PageHeader>
      {list.length ? (
        groups.map(([c, items]) => (
          <section key={c} style={{ marginBottom: 18 }}>
            <div className="panel-h" style={{ marginBottom: 8 }}>
              <h2>
                {c}
                <span className="count">{kpiScore(items)}%</span>
              </h2>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Band</th>
                    <th>Ko'rsatkich</th>
                    <th>Mas'ul</th>
                    <th>Reja</th>
                    <th>Fakt</th>
                    <th style={{ minWidth: 120 }}>Bajarilish</th>
                    <th>Muddat</th>
                    <th>Holat</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((k) => {
                    const s = kpiStatus(ctx, k);
                    return (
                      <tr key={k.id} className={s.key === 'failed' ? 'row-bad' : s.key === 'risk' ? 'row-warn' : ''}>
                        <td className="num muted">{k.code}</td>
                        <td className="t-title">
                          {k.title}
                          <div className="t-sub">
                            {k.unit} · {num(k.weight) || 1} ball
                          </div>
                        </td>
                        <td>{shortName(ctx.tById.get(k.responsibleId)?.name)}</td>
                        <td className="num">{num(k.target)}</td>
                        <td>
                          <input
                            type="number"
                            key={`${k.id}-${k.actual}`}
                            defaultValue={num(k.actual)}
                            min="0"
                            style={{ width: 74 }}
                            className="num"
                            aria-label="Fakt"
                            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                            onBlur={(e) => {
                              const v = Number(e.target.value);
                              if (!Number.isFinite(v) || v === num(k.actual)) return;
                              store.update('kpi', k.id, { actual: v });
                              toast(`KPI ${k.code}: fakt ${v}`);
                            }}
                          />
                        </td>
                        <td>
                          <Bar value={s.p * 100} cls={s.cls === 'info' ? '' : s.cls} />
                          <div className="t-sub num">{Math.round(s.p * 100)}%</div>
                        </td>
                        <td className="num">{fmtShort(k.deadline)}</td>
                        <td>
                          <Pill cls={s.cls}>{s.label}</Pill>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {(s.key === 'failed' || s.key === 'risk') && k.responsibleId ? (
                            <button type="button" className="icon-btn" onClick={() => remind({ teacherId: k.responsibleId, subject: `KPI ${k.code} «${k.title}» bo'yicha holat: ${num(k.actual)}/${num(k.target)} ${k.unit || ''}`, when: k.deadline })} aria-label="Eslatma" title="Eslatma (Telegram)">
                              <Icon name="telegram" />
                            </button>
                          ) : null}
                          <button type="button" className="icon-btn" onClick={() => openForm('kpi', k.id)} aria-label="Tahrirlash">
                            <Icon name="edit" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))
      ) : (
        <Empty action={<button type="button" className="btn primary" onClick={() => openForm('kpi', null, { period })}>KPI bandi qo'shish</button>}>{fmtMonth(period)} uchun KPI bandlari yo'q.</Empty>
      )}
      <p className="t-sub">Vaznli bajarilish: har bir band (fakt ÷ reja, ko'pi bilan 100%) o'z vazni bilan hisoblanadi. Muddatga 7 kun qolganda bajarilish 70% dan past bo'lsa — «xavf ostida».</p>
    </>
  );
}
