// O'qituvchi profili: barcha bo'limlardagi ma'lumoti bitta oynada.
import { useNavigate } from 'react-router-dom';
import Modal from './Modal.jsx';
import Icon from './Icon.jsx';
import { Pill } from './ui.jsx';
import { useUI } from './UIProvider.jsx';
import { useCtx } from '../store/StoreContext.jsx';
import { kpiOfMonth, kpiStatus, pubLate, stLate, subjState, teacherStats } from '../lib/analytics.js';
import { attMonthStats, attStatus } from '../lib/attendance.js';
import { fmtMonth, fmtShort } from '../lib/dates.js';
import { num } from '../lib/format.js';

function List({ items, render }) {
  if (!items.length) return <div className="t-sub">Yo'q</div>;
  return <div className="mini-list">{items.map(render)}</div>;
}

export default function TeacherModal({ id, onClose }) {
  const ctx = useCtx();
  const nav = useNavigate();
  const { openForm, remind } = useUI();
  const t = ctx.tById.get(id);
  if (!t) return null;
  const s = teacherStats(ctx, t);
  const ym = ctx.today.slice(0, 7);
  const a = attMonthStats(ctx, ym, id);
  const today = attStatus(ctx, ctx.today, id);
  const subs = ctx.subjects.filter((x) => x.teacherId === id);
  const pubs = ctx.pubs.filter((x) => x.teacherId === id);
  const prj = ctx.projects.filter((p) => p.leaderId === id || (p.members || []).includes(id));
  const st = ctx.stwork.filter((x) => x.teacherId === id);
  const kpis = kpiOfMonth(ctx).filter((k) => k.responsibleId === id);
  const go = (path) => {
    onClose();
    nav(path);
  };
  return (
    <Modal wide onClose={onClose} label={t.name}>
      <div className="modal-h">
        <div>
          <div className="eyebrow">
            {t.position}
            {t.degree && t.degree !== '—' ? ` · ${t.degree}` : ''} · {num(t.rate)} stavka
          </div>
          <h2 style={{ fontSize: 20, marginTop: 4 }}>{t.name}</h2>
          <div className="t-sub">{[t.email, t.phone, t.telegram].filter(Boolean).join(' · ')}</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className="btn sm" onClick={() => openForm('teachers', id)}>
            <Icon name="edit" />
            Tahrirlash
          </button>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Yopish">
            <Icon name="close" />
          </button>
        </div>
      </div>
      <div className="tiles" style={{ margin: 0 }}>
        <div className="tile">
          <div className="lbl">Yuklama / me'yor</div>
          <div className="val" style={{ fontSize: 22 }}>
            {s.plan}
            <small> / {s.norm}</small>
          </div>
        </div>
        <div className="tile">
          <div className="lbl">O'tilgan / kutilgan</div>
          <div className="val" style={{ fontSize: 22 }}>
            {s.done}
            <small> / {s.expected}</small>
          </div>
        </div>
        <div className="tile">
          <div className="lbl">Maqola rejasi</div>
          <div className="val" style={{ fontSize: 22 }}>
            {s.published + s.accepted}
            <small> / {s.pubPlan}</small>
          </div>
        </div>
        <div className="tile">
          <div className="lbl">Reyting bali</div>
          <div className="val" style={{ fontSize: 22 }}>{s.score}</div>
        </div>
      </div>
      <div className="grid-2" style={{ margin: 0 }}>
        <div className="detail-sec">
          <h3>Fanlar</h3>
          <List items={subs} render={(x) => (
            <div key={x.id}>
              <span>
                {x.name} <span className="t-sub">{x.kind}, {x.semester}-sem</span>
              </span>
              <span className="num">{num(x.doneHours)}/{num(x.planHours)} · {subjState(ctx, x).label}</span>
            </div>
          )} />
        </div>
        <div className="detail-sec">
          <h3>Ilmiy ishlar</h3>
          <List items={pubs} render={(x) => (
            <div key={x.id}>
              <span>
                {x.title} <span className="t-sub">{x.type}</span>
              </span>
              {pubLate(ctx, x) ? (
                <button type="button" className="btn sm" onClick={() => remind({ teacherId: id, subject: `«${x.title}» ilmiy ishi muddati o'tgan, holati hali «${x.status}»`, when: x.deadline })}>
                  <Icon name="telegram" />
                  Eslatma
                </button>
              ) : (
                <Pill cls={x.status === 'Chop etilgan' || x.status === 'Qabul qilingan' ? 'good' : 'info'}>{x.status}</Pill>
              )}
            </div>
          )} />
        </div>
        <div className="detail-sec">
          <h3>Loyihalar</h3>
          <List items={prj} render={(x) => (
            <div key={x.id}>
              <span>{x.title}</span>
              <span className="t-sub">{x.leaderId === id ? 'rahbar' : 'ijrochi'} · {num(x.progress)}%</span>
            </div>
          )} />
        </div>
        <div className="detail-sec">
          <h3>Talabalar bilan ish</h3>
          <List items={st} render={(x) => (
            <div key={x.id}>
              <span>
                {x.kind}: {x.topic}
              </span>
              {stLate(ctx, x) ? <Pill cls="bad">Kechikkan</Pill> : <Pill cls={x.status === 'Yakunlandi' ? 'good' : ''}>{x.status}</Pill>}
            </div>
          )} />
        </div>
        <div className="detail-sec">
          <h3>Davomat ({fmtMonth(ym)})</h3>
          <div className="mini-list">
            <div>
              <span>Kelgan kunlar</span>
              <span className="num">{a.present}/{a.work}</span>
            </div>
            <div>
              <span>Kechikishlar</span>
              <span className="num">{a.late} marta · {a.lateMin} daq</span>
            </div>
            <div>
              <span>Sababli / sababsiz</span>
              <span className="num">{a.excused} / {a.absent}</span>
            </div>
            <div>
              <span>Bugun</span>
              <Pill cls={today.cls}>
                {today.label}
                {today.r.in ? ` ${today.r.in}` : ''}
              </Pill>
            </div>
          </div>
        </div>
        <div className="detail-sec">
          <h3>Mas'ul KPI ({fmtMonth(ym)})</h3>
          <List items={kpis} render={(x) => {
            const k = kpiStatus(ctx, x);
            return (
              <div key={x.id}>
                <span>
                  {x.code} {x.title} <span className="t-sub">{num(x.actual)}/{num(x.target)} · {fmtShort(x.deadline)}</span>
                </span>
                <Pill cls={k.cls}>{k.label}</Pill>
              </div>
            );
          }} />
        </div>
      </div>
      <div className="modal-f">
        <div className="r" style={{ marginLeft: 0 }}>
          <button type="button" className="btn primary" onClick={() => go(`/agent?q=${encodeURIComponent(`${t.name} faoliyatini tahlil qil va unga 3 ta aniq tavsiya ber.`)}`)}>
            <Icon name="agent" />
            AI tahlil
          </button>
          <button type="button" className="btn" onClick={() => go(`/hisobotlar?tur=teacher&arg=${id}`)}>
            <Icon name="reports" />
            Shaxsiy hisobot
          </button>
        </div>
      </div>
    </Modal>
  );
}
