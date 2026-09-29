import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import BarChart from '../components/BarChart.jsx';
import Markdown from '../components/Markdown.jsx';
import VoiceButton from '../components/VoiceButton.jsx';
import { Bar, PageHeader, Seg, toneOf } from '../components/ui.jsx';
import { useUI } from '../components/UIProvider.jsx';
import { useCtx } from '../store/StoreContext.jsx';
import { computeAlerts, currentSemester, deadlines, kpiByCategory, kpiOfMonth, semFrac, subjState, summary, teacherStats, yearFrac } from '../lib/analytics.js';
import { gradesByGroup } from '../lib/grades.js';
import { daysBetween, fmtDate, fmtDateTime, fmtMonth, fmtShort, relDays, weekdayName } from '../lib/dates.js';
import { fmtNum, num, shortName } from '../lib/format.js';
import { VIEW_PATH } from '../lib/constants.js';
import { askText } from '../ai/agent.js';
import { errorText } from '../ai/client.js';
import { TOOLS } from '../ai/tools.js';
import { QUICK } from '../ai/quick.js';


const AREA_ICON = { KPI: 'kpi', Ilmiy: 'pubs', Yuklama: 'workload', Loyiha: 'projects', Talabalar: 'students', Davomat: 'attendance', "O'qituvchilar": 'teachers', Tizim: 'settings', 'Ilmiy ish': 'pubs', "O'quv jarayoni": 'subjects' };

function useChartData(ctx, tab) {
  return useMemo(() => {
    if (tab === 'load') {
      const sem = currentSemester(ctx);
      const kinds = ["Ma'ruza", 'Amaliy', 'Laboratoriya', 'Kurs ishi'];
      return {
        series: [{ name: 'Bugungacha kutilgan', color: 'var(--series-1)' }, { name: "O'tilgan", color: 'var(--series-2)' }],
        data: kinds.map((k) => {
          const list = ctx.subjects.filter((s) => s.kind === k && String(s.semester) === sem);
          return { label: k, values: [Math.round(list.reduce((a, s) => a + subjState(ctx, s).exp, 0)), list.reduce((a, s) => a + num(s.doneHours), 0)] };
        }),
        unit: ' soat',
        note: `${sem}-semestrning ${Math.round(semFrac(ctx, sem) * 100)}% o'tdi. Kutilgan soat = yillik reja × o'tgan ulush.`,
      };
    }
    if (tab === 'pubs') {
      const groups = ['Professor', 'Dotsent', "Katta o'qituvchi", 'Assistent'];
      return {
        series: [{ name: 'Yillik reja', color: 'var(--series-1)' }, { name: 'Bajarilgan', color: 'var(--series-2)' }],
        data: groups.map((g) => {
          const ts = ctx.teachers.filter((t) => t.position === g);
          const st = ts.map((t) => teacherStats(ctx, t));
          return { label: g === "Katta o'qituvchi" ? "Katta o'q." : g, full: g, values: [st.reduce((a, s) => a + s.pubPlan, 0), st.reduce((a, s) => a + s.published + s.accepted, 0)] };
        }),
        unit: ' ta',
        note: `Lavozimlar kesimida maqolalar. O'quv yilining ${Math.round(yearFrac(ctx) * 100)}% o'tdi.`,
      };
    }
    if (tab === 'projects') {
      const list = ctx.projects.filter((p) => p.status === 'Jarayonda');
      return {
        series: [{ name: "Muddatdan o'tgan vaqt", color: 'var(--series-1)' }, { name: 'Bajarilish', color: 'var(--series-2)' }],
        data: list.map((p) => {
          const total = Math.max(1, daysBetween(p.start, p.end));
          const gone = Math.min(100, Math.max(0, Math.round((daysBetween(p.start, ctx.today) / total) * 100)));
          return { label: p.title.length > 16 ? `${p.title.slice(0, 15)}…` : p.title, full: p.title, values: [gone, num(p.progress)] };
        }),
        unit: '%',
        maxValue: 100,
        note: "Bajarilish vaqtdan orqada qolsa — loyiha xavf ostida.",
      };
    }
    const byKurs = [2, 3, 4].map((k) => {
      const list = gradesByGroup(ctx).filter((g) => +g.kurs === k);
      const n = list.reduce((a, g) => a + g.graded, 0) || 1;
      return { label: `${k}-kurs`, values: [Math.round(list.reduce((a, g) => a + g.pass * g.graded, 0) / n), Math.round(list.reduce((a, g) => a + g.quality * g.graded, 0) / n)] };
    });
    return {
      series: [{ name: "O'zlashtirish", color: 'var(--series-1)' }, { name: 'Sifat', color: 'var(--series-2)' }],
      data: byKurs,
      unit: '%',
      maxValue: 100,
      note: `${ctx.grades[0]?.session || "Oxirgi sessiya"} natijalari. Me'yor — 80%.`,
    };
  }, [ctx, tab]);
}

function Brief({ ctx }) {
  const { toast } = useUI();
  const key = `ka_brief|${ctx.today}|${ctx.rev}`;
  const [st, setSt] = useState(() => {
    try {
      const c = JSON.parse(localStorage.getItem('ka_brief') || 'null');
      return c && c.key === key ? { text: c.text, model: c.model, ms: c.ms } : null;
    } catch {
      return null;
    }
  });
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const ctl = useRef(null);
  async function run() {
    setBusy(true);
    setSt({ text: '' });
    ctl.current = new AbortController();
    const data = { holat: TOOLS.kafedra_holati.run(ctx), muammolar: TOOLS.ogohlantirishlar.run(ctx), muddatlar: TOOLS.muddatlar.run(ctx, { kun: 14 }) };
    try {
      const r = await askText({
        system: "Sen kafedra mudirining AI yordamchisisan. O'zbek tilida (lotin), faqat berilgan ma'lumotga tayanib yoz. Raqam va ismlarni o'zgartirma, o'ylab topma.",
        prompt: `Bugun ${fmtDate(ctx.today)}. Quyidagi ma'lumot asosida mudir uchun ertalabki brifing yoz:\n1) 2–3 jumlada umumiy holat (eng muhim raqamlar bilan);\n2) "**Bugungi 3 ta ustuvor vazifa**" — har biri bitta qator, mas'ul shaxs bilan.\n120 so'zdan oshmasin.\n\nMA'LUMOT: ${JSON.stringify(data)}`,
        maxTokens: 500,
        signal: ctl.current.signal,
        onDelta: (t) => setSt({ text: t }),
        onWait: setWait,
      });
      const v = { text: r.text, model: r.model, ms: r.ms };
      setSt(v);
      try {
        localStorage.setItem('ka_brief', JSON.stringify({ key, ...v }));
      } catch {
        /* e'tiborsiz */
      }
    } catch (e) {
      setSt(null);
      toast(errorText(e), 'bad');
    } finally {
      setBusy(false);
      setWait(0);
    }
  }
  return (
    <section className="panel" style={{ marginBottom: 16, borderColor: 'var(--accent)' }}>
      <div className="panel-h" style={{ marginBottom: st ? 10 : 0 }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="agent" size={18} />
            AI brifing
          </h2>
          {!st ? <div className="t-sub">Bir bosishda: bugungi holat va 3 ta ustuvor vazifa — barcha bo'limlar ma'lumoti asosida.</div> : null}
        </div>
        <button type="button" className="btn primary" onClick={run} disabled={busy}>
          <Icon name={st?.text ? 'refresh' : 'bolt'} />
          {busy ? 'Tayyorlanmoqda…' : st?.text ? 'Yangilash' : 'Brifing tayyorlash'}
        </button>
      </div>
      {wait ? <div className="wait-note">Groq limiti: {wait} soniyadan so'ng davom etadi…</div> : null}
      {st ? (
        st.text ? (
          <>
            <Markdown text={st.text} />
            {st.model ? <div className="msg-meta">{st.model} · {(st.ms / 1000).toFixed(1)} s · ma'lumot: kafedra holati, ogohlantirishlar, muddatlar</div> : null}
          </>
        ) : (
          <span className="thinking">
            <i />
            <i />
            <i /> Tahlil qilinmoqda…
          </span>
        )
      ) : null}
    </section>
  );
}

export default function Home() {
  const ctx = useCtx();
  const nav = useNavigate();
  const { remind } = useUI();
  const [tab, setTab] = useState('load');
  const [asTable, setAsTable] = useState(false);
  const [q, setQ] = useState('');
  const s = summary(ctx);
  const alerts = computeAlerts(ctx);
  const dl = deadlines(ctx, 30).filter((d) => !d.overdue).slice(0, 6);
  const chart = useChartData(ctx, tab);
  const kpiM = kpiOfMonth(ctx);
  const cats = kpiByCategory(ctx, kpiM);
  const top = ctx.teachers.map((t) => ({ t, s: teacherStats(ctx, t) })).sort((a, b) => b.s.score - a.s.score).slice(0, 6);
  const ask = (text) => text.trim() && nav(`/agent?q=${encodeURIComponent(text.trim())}`);
  const sem = currentSemester(ctx);

  return (
    <>
      <PageHeader
        eyebrow={[ctx.settings.university, ctx.settings.faculty].filter(Boolean).join(' · ') || 'Kafedra boshqaruv paneli'}
        title={ctx.settings.name}
        sub={
          <>
            {fmtDate(ctx.today)}, {weekdayName(ctx.today).toLowerCase()} · {ctx.settings.year} o'quv yili, {sem}-semestr
            {ctx.settings.head ? ` · Mudir: ${ctx.settings.head}` : ''}
            {s.attendance ? (
              <>
                {' · '}
                <Link className="linkbtn" to="/davomat">
                  Bugun {s.attendance.present}/{s.attendance.total} keldi{s.attendance.late ? `, ${s.attendance.late} kechikdi` : ''}
                </Link>
              </>
            ) : null}
          </>
        }
      >
        <Link className="btn" to="/hisobotlar">
          <Icon name="reports" />
          Hisobot
        </Link>
        <Link className="btn primary" to="/agent">
          <Icon name="agent" />
          AI Agentdan so'rash
        </Link>
      </PageHeader>

      <section className="tiles">
        {[
          ["O'qituvchilar", s.teachers, 'nafar', 'teachers', '/oqituvchilar', '', `${s.rates} stavka`],
          ['Talabalar', s.students, 'nafar', 'students', '/talabalar', 'good', `${s.groups} ta guruhda`],
          ['Kafedra fanlari', s.subjects, 'ta', 'subjects', '/yuklama', 'violet', `${fmtNum(s.workload.total)} soat yuklama`],
          ['Guruhlar', s.groups, 'ta', 'stwork', '/talabalar', 'warn', 'faol ish rejalar bo\'yicha'],
        ].map(([lbl, val, unit, icon, to, tone, note]) => (
          <Link key={lbl} className="tile" to={to}>
            <div className="stat">
              <div className={`ic ${tone}`}>
                <Icon name={icon} />
              </div>
              <div>
                <div className="lbl">{lbl}</div>
                <div className="val">
                  {fmtNum(val)} <small>{unit}</small>
                </div>
              </div>
            </div>
            <div className="note" style={{ marginTop: 6 }}>{note}</div>
          </Link>
        ))}
      </section>

      <section className="tiles">
        <Link className="tile" to="/kpi">
          <div className="lbl">KPI · {fmtMonth(s.month)}</div>
          <div className="val">
            {s.kpi.score}
            <small>%</small>
          </div>
          <Bar value={s.kpi.score} cls={toneOf(s.kpi.score, 80, 50)} />
          <div className="note" style={{ marginTop: 6 }}>
            {s.kpi.done}/{s.kpi.total} band bajarildi
            {s.kpi.failed ? <span style={{ color: 'var(--bad)' }}> · {s.kpi.failed} bajarilmadi</span> : null}
          </div>
        </Link>
        <Link className="tile" to="/oquv-yuklama">
          <div className="lbl">Dars soatlari bajarilishi</div>
          <div className="val">
            {s.load.pct}
            <small>%</small>
          </div>
          <Bar value={s.load.pct} cls={toneOf(s.load.pct)} />
          <div className="note" style={{ marginTop: 6 }}>
            {fmtNum(s.load.done)} / {fmtNum(s.load.expected)} kutilgan soat
          </div>
        </Link>
        <Link className="tile" to="/ilmiy">
          <div className="lbl">Ilmiy maqolalar (yillik)</div>
          <div className="val">
            {s.pubs.ok}
            <small> / {s.pubs.plan}</small>
          </div>
          <Bar value={s.pubPct} mark={s.pubs.yearPct} />
          <div className="note" style={{ marginTop: 6 }}>
            {s.pubs.overdue ? <span style={{ color: 'var(--bad)' }}>{s.pubs.overdue} ishning muddati o'tgan</span> : 'Reja bo\'yicha'}
          </div>
        </Link>
        <Link className="tile" to="/talabalar">
          <div className="lbl">Talabalar o'zlashtirishi</div>
          <div className="val">
            {s.grades.pass}
            <small>%</small>
          </div>
          <Bar value={s.grades.pass} cls={toneOf(s.grades.pass, 85, 80)} mark={80} />
          <div className="note" style={{ marginTop: 6 }}>
            sifat {s.grades.quality}% · <span style={{ color: s.grades.debtors ? 'var(--bad)' : undefined }}>{s.grades.debtors} qarzdor</span>
          </div>
        </Link>
      </section>

      <Brief ctx={ctx} />

      <section className="grid-32">
        <div className="panel">
          <div className="panel-h">
            <h2>Faoliyat ko'rsatkichlari</h2>
            <div className="h-actions">
              <Seg value={tab} onChange={setTab} label="Ko'rsatkich" options={[['load', 'Dars soatlari'], ['pubs', 'Maqolalar'], ['projects', 'Loyihalar'], ['grades', "O'zlashtirish"]]} />
              <button type="button" className="btn sm" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
                <Icon name={asTable ? 'kpi' : 'table'} />
                {asTable ? 'Grafik' : 'Jadval'}
              </button>
            </div>
          </div>
          {chart.data.length ? <BarChart data={chart.data} series={chart.series} unit={chart.unit} maxValue={chart.maxValue} table={asTable} /> : <div className="empty">Ma'lumot yo'q</div>}
          <p className="t-sub" style={{ margin: '8px 0 0' }}>{chart.note}</p>
        </div>
        <div className="panel">
          <div className="panel-h">
            <h2>
              Diqqat talab qiladi<span className="count">{alerts.length}</span>
            </h2>
            <span className="t-sub">bosing — bo'limga o'tadi</span>
          </div>
          {alerts.length ? (
            <div className="alerts">
              {alerts.slice(0, 16).map((a, i) => (
                <div key={i} className="alert">
                  <span className={`sev ${a.sev === 'bad' ? 'bad' : ''}`} />
                  <button type="button" className="a-txt" onClick={() => nav(VIEW_PATH[a.view] || '/')}>
                    {a.text}
                  </button>
                  <span className="a-side">
                    {a.who ? (
                      <button type="button" className="icon-btn" style={{ width: 26, height: 26 }} onClick={() => remind({ teacherId: a.who, subject: a.text })} aria-label="Eslatma yuborish" title="Eslatma (Telegram)">
                        <Icon name="telegram" size={15} />
                      </button>
                    ) : null}
                    <span className="a-area">{a.area}</span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">Hozircha muammo topilmadi.</div>
          )}
        </div>
      </section>

      <section className="grid-3">
        <div className="panel">
          <div className="panel-h">
            <h2>So'nggi yangiliklar</h2>
          </div>
          <div className="feed">
            {ctx.activity.slice(0, 6).map((a) => (
              <Link key={a.id} className="feed-item" to={VIEW_PATH[a.view] || '/'}>
                <span className="ic">
                  <Icon name={AREA_ICON[a.area] || 'info'} />
                </span>
                <span className="ft">{a.text}</span>
                <span className="fd">{fmtDateTime(a.at).split(' ')[0]}</span>
              </Link>
            ))}
            {!ctx.activity.length ? <div className="empty">Hali faoliyat yo'q</div> : null}
          </div>
        </div>
        <div className="panel">
          <div className="panel-h">
            <h2>Kutilayotgan muddatlar</h2>
            <span className="t-sub">30 kun</span>
          </div>
          <div className="feed">
            {dl.map((d, i) => (
              <Link key={i} className="feed-item" to={VIEW_PATH[d.view] || '/'}>
                <span className={`ic ${d.left <= 3 ? 'bad' : d.left <= 10 ? 'warn' : ''}`}>
                  <Icon name={AREA_ICON[d.area] || 'calendar'} />
                </span>
                <span className="ft">
                  {d.title}
                  {d.who ? <span className="t-sub"> · {shortName(ctx.tById.get(d.who)?.name)}</span> : null}
                </span>
                <span className="fd">
                  {fmtShort(d.date)}
                  <br />
                  {relDays(d.left)}
                </span>
              </Link>
            ))}
            {!dl.length ? <div className="empty">Yaqin muddatlar yo'q</div> : null}
          </div>
        </div>
        <div className="panel">
          <div className="panel-h">
            <h2>KafedraAgentga savol</h2>
          </div>
          <p className="lead">Agent barcha bo'limlarni ko'radi; raqamlarni o'zi to'qimaydi — tizim hisoblagan ma'lumotdan oladi.</p>
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
            <textarea
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  ask(q);
                }
              }}
              rows={2}
              style={{ flex: 1, resize: 'vertical' }}
              placeholder="Masalan: bu oy qaysi KPI bandlari bajarilmagan?"
              aria-label="Savol"
            />
            <VoiceButton onText={(t) => setQ(t)} />
            <button type="button" className="btn primary" onClick={() => ask(q)} aria-label="So'rash">
              <Icon name="send" />
            </button>
          </div>
          <div className="chips" style={{ marginTop: 12 }}>
            {QUICK.slice(0, 4).map((x) => (
              <button key={x} type="button" className="chip" onClick={() => ask(x)}>
                {x}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="grid-2">
        <div className="panel">
          <div className="panel-h">
            <h2>KPI yo'nalishlar kesimida</h2>
            <Link className="btn sm" to="/kpi">
              Barchasi
            </Link>
          </div>
          {cats.length ? (
            <div className="catbars">
              {cats.map((x) => (
                <div key={x.c} className="catbar">
                  <span>{x.c}</span>
                  <Bar value={x.score} cls={toneOf(x.score, 80, 50)} />
                  <span className="num">{x.score}%</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">{fmtMonth(s.month)} uchun KPI bandlari kiritilmagan.</div>
          )}
        </div>
        <div className="panel">
          <div className="panel-h">
            <h2>O'qituvchilar reytingi</h2>
            <Link className="btn sm" to="/oqituvchilar">
              Barchasi
            </Link>
          </div>
          <TopTeachers top={top} />
        </div>
      </section>
    </>
  );
}

function TopTeachers({ top }) {
  const { openTeacher } = useUI();
  return (
    <div className="table-wrap" style={{ border: 0 }}>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>O'qituvchi</th>
            <th>Maqola</th>
            <th>Dars</th>
            <th className="right">Ball</th>
          </tr>
        </thead>
        <tbody>
          {top.map(({ t, s }, i) => (
            <tr key={t.id} className="click" onClick={() => openTeacher(t.id)}>
              <td className="num muted">{i + 1}</td>
              <td>
                <div className="strong">{shortName(t.name)}</div>
                <div className="t-sub">{t.position}</div>
              </td>
              <td className="num">
                {s.published + s.accepted}/{s.pubPlan}
              </td>
              <td className="num">{s.expected ? `${Math.round(s.loadPace * 100)}%` : '—'}</td>
              <td className="num strong right">{s.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
