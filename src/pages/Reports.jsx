import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { ConfirmButton, Empty, PageHeader, Seg } from '../components/ui.jsx';
import { useUI } from '../components/UIProvider.jsx';
import { useCtx, useStore } from '../store/StoreContext.jsx';
import { buildReport, REPORT_KINDS, reportDigest, reportFromMarkdown } from '../lib/reports.js';
import { fmtDateTime, fmtMonth } from '../lib/dates.js';
import { askText } from '../ai/agent.js';
import { errorText } from '../ai/client.js';
import { TOOLS } from '../ai/tools.js';
import { reportHTML } from '../export/html.js';
import { downloadDocx, downloadHTML, printReport, reportToXlsx } from '../export/files.js';

function ExportBar({ rep, toast, extra }) {
  const run = (fn) => Promise.resolve(fn()).catch((e) => toast(e.message || "Faylni yaratib bo'lmadi", 'bad'));
  return (
    <div className="h-actions">
      <button type="button" className="btn" onClick={() => run(() => downloadDocx(rep))}>
        <Icon name="word" />
        Word
      </button>
      <button type="button" className="btn" onClick={() => run(() => reportToXlsx(rep))}>
        <Icon name="excel" />
        Excel
      </button>
      <button type="button" className="btn" onClick={() => printReport(rep)}>
        <Icon name="pdf" />
        PDF / chop etish
      </button>
      <button type="button" className="btn ghost" onClick={() => downloadHTML(rep)} title="HTML fayl (brauzerda ochiladi)">
        <Icon name="download" />
      </button>
      {extra}
    </div>
  );
}

export default function Reports() {
  const ctx = useCtx();
  const store = useStore();
  const { toast } = useUI();
  const [params] = useSearchParams();
  const [tab, setTab] = useState('new');
  const [kind, setKind] = useState(params.get('tur') || 'monthly');
  const [month, setMonth] = useState(ctx.today.slice(0, 7));
  const [teacher, setTeacher] = useState(params.get('arg') || ctx.teachers[0]?.id || '');
  const [ai, setAi] = useState(null);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState(null);
  const ctl = useRef(null);
  const meta = REPORT_KINDS.find((k) => k.id === kind) || REPORT_KINDS[0];
  const arg = meta.needs === 'month' ? month : meta.needs === 'teacher' ? teacher : null;
  const base = useMemo(() => buildReport(ctx, kind, arg), [ctx, kind, arg]);
  const rep = useMemo(() => (base && ai?.key === `${kind}|${arg}` ? { ...base, sections: [...base.sections, { heading: 'AI xulosasi va tavsiyalar', ai: true, model: ai.model, blocks: ai.blocks }] } : base), [base, ai, kind, arg]);
  const months = [...new Set(ctx.kpi.map((k) => k.period).concat(ctx.attendance.map((a) => a.month)).concat(ctx.today.slice(0, 7)))].filter(Boolean).sort().reverse();

  async function addAI() {
    if (!base) return;
    setBusy(true);
    ctl.current = new AbortController();
    try {
      const r = await askText({
        system: "Sen kafedra mudirining tahliliy yordamchisisan. O'zbek tilida (lotin), rasmiy-ishchan uslubda yoz. Faqat berilgan hisobot raqamlariga tayan, yangi raqam o'ylab topma.",
        prompt: `Quyidagi hisobot uchun "Xulosa" yoz: 1 paragraf (3–4 jumla) umumiy baho, so'ng 3–4 ta aniq tavsiya ro'yxat ko'rinishida (har biri mas'ul shaxs bilan). 170 so'zdan oshmasin, sarlavha yozma.\n\n${reportDigest(base)}`,
        maxTokens: 650,
        signal: ctl.current.signal,
      });
      const { mdBlocks } = await import('../lib/markdown.js');
      setAi({ key: `${kind}|${arg}`, blocks: mdBlocks(r.text), model: r.model });
      toast("AI xulosasi qo'shildi");
    } catch (e) {
      toast(errorText(e), 'bad');
    } finally {
      setBusy(false);
    }
  }

  async function agenda() {
    setBusy(true);
    try {
      const data = { holat: TOOLS.kafedra_holati.run(ctx), muammolar: TOOLS.ogohlantirishlar.run(ctx), muddatlar: TOOLS.muddatlar.run(ctx, { kun: 30 }) };
      const r = await askText({
        system: "Sen kafedra mudirining yordamchisisan. O'zbek tilida (lotin), rasmiy uslubda yoz. Faqat berilgan ma'lumotga tayan.",
        prompt: `Navbatdagi kafedra majlisi uchun kun tartibi tuz: 4–5 ta masala (har biri: masala nomi, ma'ruzachi, muhokama uchun 1–2 savol) va oxirida "Qaror loyihasi" (3 band). Markdown: "## " sarlavhalar va ro'yxatlar. 260 so'zdan oshmasin.\n\nMA'LUMOT: ${JSON.stringify(data)}`,
        maxTokens: 900,
      });
      const repA = reportFromMarkdown(ctx, 'Kafedra majlisi kun tartibi (loyiha)', r.text, '');
      repA.subtitle = `${fmtMonth(ctx.today.slice(0, 7))} · AI tayyorlagan loyiha, mudir tomonidan tasdiqlanadi`;
      store.insert('history', { kind: 'agenda', title: repA.title, report: repA, model: r.model, at: new Date().toISOString() });
      setTab('history');
      toast('Kun tartibi loyihasi tayyor — Tarix bo\'limida');
    } catch (e) {
      toast(errorText(e), 'bad');
    } finally {
      setBusy(false);
    }
  }

  function save() {
    store.insert('history', { kind: 'report', title: rep.title, report: rep, at: new Date().toISOString() });
    toast('Hisobot tarixga saqlandi');
  }

  const history = ctx.history.slice().sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const opened = history.find((h) => h.id === openId);
  const openedRep = opened ? opened.report || reportFromMarkdown(ctx, opened.title, opened.text || '', opened.question) : null;

  return (
    <>
      <PageHeader eyebrow="Hujjatlar" title="Hisobotlar va tarix" sub="Rasmiy hisobotlar raqamlari tizim tomonidan hisoblanadi; AI faqat xulosa qismini yozadi va u alohida belgilanadi.">
        <Seg value={tab} onChange={setTab} label="Bo'lim" options={[['new', 'Yangi hisobot'], ['history', `Tarix (${history.length})`]]} />
        <button type="button" className="btn" onClick={agenda} disabled={busy}>
          <Icon name="agent" />
          Majlis kun tartibi (AI)
        </button>
      </PageHeader>

      {tab === 'new' ? (
        <>
          <div className="rep-kinds" role="group" aria-label="Hisobot turi">
            {REPORT_KINDS.map((k) => (
              <button key={k.id} type="button" className="rep-kind" aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>
                <b>{k.title}</b>
                <span>{k.desc}</span>
              </button>
            ))}
          </div>
          <div className="filters">
            {meta.needs === 'month' ? (
              <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Oy">
                {months.map((m) => (
                  <option key={m} value={m}>
                    {fmtMonth(m)}
                  </option>
                ))}
              </select>
            ) : null}
            {meta.needs === 'teacher' ? (
              <select value={teacher} onChange={(e) => setTeacher(e.target.value)} aria-label="O'qituvchi">
                {ctx.teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            ) : null}
            <button type="button" className="btn primary" onClick={addAI} disabled={busy || !base}>
              <Icon name="agent" />
              {busy ? 'AI yozmoqda…' : ai?.key === `${kind}|${arg}` ? 'AI xulosasini yangilash' : "AI xulosasi qo'shish"}
            </button>
            <span style={{ marginLeft: 'auto' }}>
              {rep ? (
                <ExportBar
                  rep={rep}
                  toast={toast}
                  extra={
                    <button type="button" className="btn" onClick={save}>
                      <Icon name="history" />
                      Tarixga saqlash
                    </button>
                  }
                />
              ) : null}
            </span>
          </div>
          {busy ? <div className="progress indet" style={{ marginBottom: 12 }}><i /></div> : null}
          {rep ? <div dangerouslySetInnerHTML={{ __html: reportHTML(rep) }} /> : <Empty>Hisobot uchun ma'lumot topilmadi.</Empty>}
        </>
      ) : opened ? (
        <>
          <div className="filters">
            <button type="button" className="btn" onClick={() => setOpenId(null)}>
              ‹ Tarixga qaytish
            </button>
            <span style={{ marginLeft: 'auto' }}>
              <ExportBar rep={openedRep} toast={toast} />
            </span>
          </div>
          {opened.kind === 'ai' && !opened.report ? (
            <div className="panel" style={{ marginBottom: 12 }}>
              <div className="t-sub">So'rov: {opened.question}</div>
            </div>
          ) : null}
          <div dangerouslySetInnerHTML={{ __html: reportHTML(openedRep) }} />
        </>
      ) : history.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Sana</th>
                <th>Mavzu</th>
                <th>Turi</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {history.map((h, i) => (
                <tr key={h.id} className="click" onClick={() => setOpenId(h.id)}>
                  <td className="num muted">{i + 1}</td>
                  <td className="num">{fmtDateTime(h.at)}</td>
                  <td className="t-title">{h.title}</td>
                  <td>
                    <span className="tag">{{ ai: 'AI javobi', report: 'Hisobot', agenda: 'Majlis kun tartibi', scan: 'Hujjat tahlili', bench: 'Sifat o\'lchovi' }[h.kind] || h.kind}</span>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="btn sm" onClick={() => setOpenId(h.id)}>
                      <Icon name="eye" />
                      Ko'rish
                    </button>{' '}
                    <ConfirmButton className="icon-btn" confirmText="O'chirish" onConfirm={() => store.remove('history', h.id)}>
                      <Icon name="trash" />
                    </ConfirmButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>
          Hali saqlangan tahlil yo'q. AI javoblarini «Tarixga saqlash» tugmasi bilan, hisobotlarni esa «Yangi hisobot» bo'limidan saqlang.
        </Empty>
      )}
    </>
  );
}
