import Icon from '../components/Icon.jsx';
import { Bar, Empty, PageHeader, Pill } from '../components/ui.jsx';
import { useUI } from '../components/UIProvider.jsx';
import { useCtx } from '../store/StoreContext.jsx';
import { PROJ_STATUS } from '../lib/constants.js';
import { daysBetween, fmtShort } from '../lib/dates.js';
import { fmtNum, num, shortName } from '../lib/format.js';

export default function Projects() {
  const ctx = useCtx();
  const { openForm } = useUI();
  const list = ctx.projects.slice().sort((a, b) => PROJ_STATUS.indexOf(a.status) - PROJ_STATUS.indexOf(b.status) || String(a.end).localeCompare(b.end));
  const act = list.filter((p) => p.status === 'Jarayonda');
  const name = (id) => ctx.tById.get(id)?.name || '—';
  return (
    <>
      <PageHeader eyebrow="Ilmiy-innovatsion faoliyat" title="Loyihalar va grantlar" sub={`${act.length} ta faol · ${fmtNum(act.reduce((a, p) => a + num(p.funding), 0))} mln so'm`}>
        <button type="button" className="btn primary" onClick={() => openForm('projects')}>
          <Icon name="plus" />
          Loyiha
        </button>
      </PageHeader>
      {list.length ? (
        <div className="cards">
          {list.map((p) => {
            const d = p.end ? daysBetween(ctx.today, p.end) : null;
            const prog = num(p.progress);
            const total = p.start && p.end ? Math.max(1, daysBetween(p.start, p.end)) : null;
            const gone = total ? Math.min(100, Math.max(0, Math.round((daysBetween(p.start, ctx.today) / total) * 100))) : null;
            const warn = p.status === 'Jarayonda' && d != null && (d < 0 || (d <= 60 && prog < 80) || (gone != null && gone - prog > 20));
            return (
              <article key={p.id} className="card">
                <div className="card-top">
                  <div>
                    <span className="tag">{p.type}</span>
                    <h3 style={{ marginTop: 8, fontSize: 15 }}>{p.title}</h3>
                  </div>
                  <button type="button" className="icon-btn" onClick={() => openForm('projects', p.id)} aria-label="Tahrirlash">
                    <Icon name="edit" />
                  </button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <Pill cls={p.status === 'Jarayonda' ? 'info' : p.status === 'Yakunlangan' ? 'good' : p.status === "To'xtatilgan" ? 'bad' : ''}>{p.status}</Pill>
                  <span className="num">{prog}%</span>
                </div>
                <Bar value={prog} cls={warn ? 'warn' : prog >= 100 ? 'good' : ''} mark={p.status === 'Jarayonda' ? gone : null} />
                <dl className="kv">
                  <dt>Rahbar</dt>
                  <dd>{name(p.leaderId)}</dd>
                  <dt>Ijrochilar</dt>
                  <dd>{(p.members || []).map((id) => shortName(name(id))).join(', ') || '—'}</dd>
                  <dt>Mablag'</dt>
                  <dd className="num">{fmtNum(p.funding)} mln so'm</dd>
                  <dt>Muddat</dt>
                  <dd className="num">
                    {fmtShort(p.start)} – {fmtShort(p.end)}
                  </dd>
                </dl>
                {p.status === 'Jarayonda' && d != null ? (
                  <div className="t-sub" style={warn ? { color: 'var(--warn)' } : undefined}>
                    {d < 0 ? `Muddati ${-d} kun oldin tugagan` : `Tugashiga ${d} kun qoldi`}
                    {gone != null ? ` · vaqtning ${gone}% o'tdi` : ''}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <Empty action={<button type="button" className="btn primary" onClick={() => openForm('projects')}>Loyiha qo'shish</button>}>Loyihalar hali kiritilmagan.</Empty>
      )}
      <p className="t-sub" style={{ marginTop: 10 }}>Chiziqdagi belgi — loyiha muddatining qancha qismi o'tgani. Bajarilish belgidan 20 punktdan ko'p orqada bo'lsa, loyiha xavf ostida deb belgilanadi.</p>
    </>
  );
}
