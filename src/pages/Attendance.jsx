import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Empty, PageHeader, Pill, Seg } from '../components/ui.jsx';
import { useUI } from '../components/UIProvider.jsx';
import { useCtx, useStore } from '../store/StoreContext.jsx';
import { ATT_CODE, ATT_REASONS } from '../lib/constants.js';
import { attCfg, attCode, attMonthStats, attStatus, isWorkday, worked } from '../lib/attendance.js';
import { addDays, fmtDate, fmtDur, fmtMonth, fmtShort, monthDays, nowHM, weekdayName } from '../lib/dates.js';
import { shortName } from '../lib/format.js';
import { downloadXlsx } from '../export/files.js';

export default function Attendance() {
  const ctx = useCtx();
  const store = useStore();
  const { toast } = useUI();
  const [tab, setTab] = useState('day');
  const [date, setDate] = useState(ctx.today);
  const c = attCfg(ctx.settings);
  const wd = isWorkday(ctx.settings, date);
  const list = ctx.teachers.slice().sort((a, b) => a.name.localeCompare(b.name));
  const mark = (tid, patch) => store.markAttendance(date, tid, patch);

  const body = !ctx.teachers.length ? (
    <Empty>Avval o'qituvchilarni kiriting.</Empty>
  ) : tab === 'month' ? (
    <Month ctx={ctx} ym={date.slice(0, 7)} list={list} toast={toast} />
  ) : !wd ? (
    <Empty>{c.holidays.includes(date) ? 'Bayram kuni' : 'Dam olish kuni'} — davomat yuritilmaydi.</Empty>
  ) : tab === 'kiosk' ? (
    <Kiosk ctx={ctx} date={date} list={list} onMark={(tid, f) => {
      const t = nowHM();
      mark(tid, { [f]: t });
      toast(`${ctx.tById.get(tid)?.name} — ${f === 'in' ? 'xush kelibsiz' : 'xayr'}, ${t}`);
    }} />
  ) : (
    <Day ctx={ctx} date={date} list={list} mark={mark} toast={toast} />
  );

  return (
    <>
      <PageHeader eyebrow="Kelib-ketishni qayd etish" title="Davomat" sub={`${fmtDate(date)} · ${weekdayName(date)} · ish vaqti ${c.start}–${c.end}, kechikish chegarasi ${c.grace} daqiqa`}>
        <button type="button" className="btn sm" onClick={() => setDate(addDays(date, -1))} aria-label="Oldingi kun">
          ‹
        </button>
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Sana" />
        <button type="button" className="btn sm" onClick={() => setDate(addDays(date, 1))} aria-label="Keyingi kun">
          ›
        </button>
        {date !== ctx.today ? (
          <button type="button" className="btn sm" onClick={() => setDate(ctx.today)}>
            Bugun
          </button>
        ) : null}
      </PageHeader>
      <div className="filters">
        <Seg value={tab} onChange={setTab} label="Ko'rinish" options={[['day', 'Kunlik qayd'], ['kiosk', 'Kiosk (eshik oldida)'], ['month', 'Oylik tabel']]} />
      </div>
      {body}
    </>
  );
}

function Day({ ctx, date, list, mark, toast }) {
  const rows = list.map((t) => ({ t, s: attStatus(ctx, date, t.id) }));
  const cnt = (k) => rows.filter((x) => x.s.key === k).length;
  const isToday = date === ctx.today;
  const names = (k, f = (x) => shortName(x.t.name)) => rows.filter((x) => x.s.key === k).map(f).join(', ') || '—';
  return (
    <>
      <section className="tiles">
        <div className="tile">
          <div className="lbl">Keldi</div>
          <div className="val" style={{ color: 'var(--good)' }}>
            {cnt('present') + cnt('late')}
            <small> / {rows.length}</small>
          </div>
          <div className="note">o'z vaqtida {cnt('present')}</div>
        </div>
        <div className="tile">
          <div className="lbl">Kechikdi</div>
          <div className="val" style={cnt('late') ? { color: 'var(--warn)' } : undefined}>{cnt('late')}</div>
          <div className="note">{names('late', (x) => `${shortName(x.t.name)} (${x.s.r.in})`)}</div>
        </div>
        <div className="tile">
          <div className="lbl">Sababli</div>
          <div className="val">{cnt('excused')}</div>
          <div className="note">{names('excused', (x) => `${shortName(x.t.name)} (${x.s.r.reason})`)}</div>
        </div>
        <div className="tile">
          <div className="lbl">{isToday ? 'Hali kelmagan' : 'Kelmagan'}</div>
          <div className="val" style={cnt('absent') ? { color: 'var(--bad)' } : undefined}>{cnt('absent')}</div>
          <div className="note">{names('absent')}</div>
        </div>
      </section>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>O'qituvchi</th>
              <th>Holat</th>
              <th>Keldi</th>
              <th>Ketdi</th>
              <th>Ishlagan</th>
              <th>Sabab</th>
              {isToday ? <th /> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ t, s }) => {
              const r = s.r;
              return (
                <tr key={t.id} className={s.key === 'absent' ? 'row-bad' : s.key === 'late' ? 'row-warn' : ''}>
                  <td>
                    <div className="strong">{t.name}</div>
                    <div className="t-sub">{t.position}</div>
                  </td>
                  <td>
                    <Pill cls={s.cls}>{s.label}</Pill>
                  </td>
                  <td>
                    <input type="time" key={`${date}-${t.id}-in-${r.in}`} defaultValue={r.in || ''} disabled={!!r.reason} onBlur={(e) => e.target.value !== (r.in || '') && mark(t.id, { in: e.target.value || null })} aria-label="Kelgan vaqt" />
                  </td>
                  <td>
                    <input type="time" key={`${date}-${t.id}-out-${r.out}`} defaultValue={r.out || ''} disabled={!!r.reason} onBlur={(e) => e.target.value !== (r.out || '') && mark(t.id, { out: e.target.value || null })} aria-label="Ketgan vaqt" />
                  </td>
                  <td className="num">{fmtDur(worked(r))}</td>
                  <td>
                    <select
                      value={r.reason || ''}
                      onChange={(e) => {
                        mark(t.id, { reason: e.target.value || null });
                        toast(e.target.value ? `Sababli: ${e.target.value}` : 'Sabab olib tashlandi');
                      }}
                      aria-label="Sabab"
                    >
                      <option value="">—</option>
                      {ATT_REASONS.map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </td>
                  {isToday ? (
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {!r.in && !r.reason ? (
                        <button type="button" className="btn sm primary" onClick={() => mark(t.id, { in: nowHM() })}>
                          Keldi
                        </button>
                      ) : null}
                      {r.in && !r.out ? (
                        <button type="button" className="btn sm" onClick={() => mark(t.id, { out: nowHM() })}>
                          Ketdi
                        </button>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="t-sub" style={{ marginTop: 8 }}>«Keldi» / «Ketdi» tugmasi joriy vaqtni yozadi. Vaqtni qo'lda ham tuzatish mumkin. Sabab tanlansa, kun sababli deb hisoblanadi.</p>
    </>
  );
}

function Kiosk({ ctx, date, list, onMark }) {
  return (
    <>
      <p className="lead">Planshetni kafedra eshigi oldiga qo'ying: o'qituvchi o'z ismini bossa, kelgan yoki ketgan vaqti avtomatik yoziladi. Boshqa qurilmadagi oynalar ham darhol yangilanadi.</p>
      <div className="kiosk">
        {list.map((t) => {
          const s = attStatus(ctx, date, t.id);
          const r = s.r;
          const next = r.reason ? '' : !r.in ? 'in' : !r.out ? 'out' : '';
          return (
            <button key={t.id} type="button" className={`kcard ${s.cls}`} disabled={!next || date !== ctx.today} onClick={() => onMark(t.id, next)}>
              <span className="kname">{shortName(t.name)}</span>
              <span className="t-sub">{t.position}</span>
              <span className="ktimes num">
                {r.in ? `↓ ${r.in}` : ''}
                {r.out ? ` · ↑ ${r.out}` : ''}
                {r.reason || ''}
              </span>
              <span className="kact">{next === 'in' ? 'Keldim' : next === 'out' ? 'Ketyapman' : r.reason ? 'Sababli' : 'Kun yakunlandi'}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function Month({ ctx, ym, list, toast }) {
  const days = monthDays(ym);
  const tot = list.map((t) => attMonthStats(ctx, ym, t.id));
  const W = tot[0]?.work || 0;
  const tone = { '+': 'good', K: 'warn', '×': 'bad', '·': 'off' };
  function exportXlsx() {
    const head = ["O'qituvchi", 'Lavozim', ...days.map((d) => String(+d.slice(8))), 'Kelgan', 'Ish kunlari', 'Kechikish', 'Kechikish (daq)', 'Sababli', 'Kelmagan', 'Ishlagan soat'];
    const rows = list.map((t, i) => {
      const s = tot[i];
      return [t.name, t.position, ...days.map((d) => {
        const st = attStatus(ctx, d, t.id);
        if (st.key === 'present') return `${st.r.in}${st.r.out ? `-${st.r.out}` : ''}`;
        if (st.key === 'late') return `K ${st.r.in}${st.r.out ? `-${st.r.out}` : ''}`;
        if (st.key === 'excused') return ATT_CODE[st.r.reason] || 'S';
        if (st.key === 'absent') return d < ctx.today ? '×' : '';
        return '';
      }), s.present, s.work, s.late, s.lateMin, s.excused, s.absent, Math.round(s.min / 60)];
    });
    downloadXlsx(`davomat-tabel-${ym}`, [{ name: `Tabel ${ym}`, pre: [`${ctx.settings.name} — davomat tabeli`, fmtMonth(ym)], head, rows }]).catch((e) => toast(e.message, 'bad'));
  }
  return (
    <>
      <div className="filters">
        <span className="strong">{fmtMonth(ym)}</span>
        <span className="t-sub">{W} ish kuni o'tdi</span>
        <button type="button" className="btn sm" onClick={exportXlsx} style={{ marginLeft: 'auto' }}>
          <Icon name="excel" />
          Tabelni Excel'ga
        </button>
      </div>
      <div className="table-wrap">
        <table className="tabel">
          <thead>
            <tr>
              <th className="stick">O'qituvchi</th>
              {days.map((d) => (
                <th key={d} className={`tc ${isWorkday(ctx.settings, d) ? '' : 'off'}`}>
                  {+d.slice(8)}
                </th>
              ))}
              <th>Keldi</th>
              <th>Kech.</th>
              <th>Daq</th>
              <th>Sabab.</th>
              <th>Kelm.</th>
              <th>Soat</th>
            </tr>
          </thead>
          <tbody>
            {list.map((t, i) => {
              const s = tot[i];
              return (
                <tr key={t.id} className={s.absent ? 'row-bad' : s.late >= 3 ? 'row-warn' : ''}>
                  <td className="stick">
                    <div className="strong" style={{ whiteSpace: 'nowrap' }}>{shortName(t.name)}</div>
                  </td>
                  {days.map((d) => {
                    const code = attCode(ctx, d, t.id) || '';
                    const st = attStatus(ctx, d, t.id);
                    const cls = tone[code] || (code && st.key === 'excused' ? 'info' : '');
                    return (
                      <td key={d} className={`tc ${cls}`} title={`${fmtShort(d)}: ${st.label}${st.r.in ? ` · ${st.r.in}` : ''}${st.r.out ? `–${st.r.out}` : ''}`}>
                        {code}
                      </td>
                    );
                  })}
                  <td className="num">
                    {s.present}/{s.work}
                  </td>
                  <td className="num">{s.late || ''}</td>
                  <td className="num">{s.lateMin || ''}</td>
                  <td className="num">{s.excused || ''}</td>
                  <td className="num" style={s.absent ? { color: 'var(--bad)', fontWeight: 600 } : undefined}>{s.absent || ''}</td>
                  <td className="num">{Math.round(s.min / 60)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="t-sub" style={{ marginTop: 8 }}>Belgilar: + keldi · K kechikdi · × kelmadi · B kasallik · X xizmat safari · T mehnat ta'tili · M malaka oshirish · S boshqa sabab · · dam olish/bayram. Katak ustiga olib borsangiz vaqtlar ko'rinadi.</p>
    </>
  );
}
