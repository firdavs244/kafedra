// Ctrl+K: sahifalar, o'qituvchilar, ilmiy ishlar, loyihalar, fanlar bo'yicha tezkor qidiruv
// va har qanday matnni to'g'ridan-to'g'ri AI agentga yuborish.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from './Modal.jsx';
import Icon from './Icon.jsx';
import { useUI } from './UIProvider.jsx';
import { useDB } from '../store/StoreContext.jsx';
import { NAV } from './nav.js';
import { norm, shortName } from '../lib/format.js';

export default function CommandPalette({ onClose }) {
  const db = useDB();
  const nav = useNavigate();
  const { openTeacher } = useUI();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);

  const results = useMemo(() => {
    const n = norm(q);
    const has = (s) => !n || norm(s).includes(n);
    const out = [];
    const pages = NAV.filter((x) => x.path && has(x.label)).slice(0, n ? 5 : 8);
    pages.forEach((p) => out.push({ group: 'Sahifalar', icon: p.icon, label: p.label, run: () => nav(p.path) }));
    if (n) {
      db.teachers.filter((t) => has(t.name)).slice(0, 5).forEach((t) => out.push({ group: "O'qituvchilar", icon: 'teachers', label: t.name, sub: t.position, run: () => openTeacher(t.id) }));
      db.pubs.filter((p) => has(p.title)).slice(0, 4).forEach((p) => out.push({ group: 'Ilmiy ishlar', icon: 'pubs', label: p.title, sub: p.status, run: () => nav(`/ilmiy?q=${encodeURIComponent(p.title)}`) }));
      db.projects.filter((p) => has(p.title)).slice(0, 3).forEach((p) => out.push({ group: 'Loyihalar', icon: 'projects', label: p.title, sub: p.status, run: () => nav('/loyihalar') }));
      const subj = [...new Set(db.subjects.map((s) => s.name))].filter(has).slice(0, 3);
      subj.forEach((s) => out.push({ group: 'Fanlar', icon: 'subjects', label: s, run: () => nav(`/oquv-yuklama?q=${encodeURIComponent(s)}`) }));
      const g = [...new Set(db.grades.map((x) => x.group))].filter(has).slice(0, 3);
      g.forEach((s) => out.push({ group: 'Guruhlar', icon: 'students', label: s, run: () => nav(`/talabalar?guruh=${encodeURIComponent(s)}`) }));
      out.push({ group: 'AI agent', icon: 'agent', label: `AI'dan so'rash: «${q}»`, run: () => nav(`/agent?q=${encodeURIComponent(q)}`) });
    }
    return out;
  }, [q, db, nav, openTeacher]);

  const run = (r) => {
    onClose();
    r?.run();
  };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => Math.min(results.length - 1, s + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => Math.max(0, s - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(results[sel]);
    }
  };

  let lastGroup = '';
  return (
    <Modal onClose={onClose} className="palette" label="Qidiruv">
      <div className="palette-in">
        <Icon name="search" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
          }}
          onKeyDown={onKey}
          placeholder="O'qituvchi, maqola, fan, guruh yoki savol…"
          aria-label="Qidiruv"
        />
        <kbd>Esc</kbd>
      </div>
      <div className="palette-list" role="listbox">
        {results.map((r, i) => {
          const head = r.group !== lastGroup ? <div className="palette-group">{r.group}</div> : null;
          lastGroup = r.group;
          return (
            <div key={`${r.group}-${r.label}-${i}`}>
              {head}
              <button type="button" role="option" aria-selected={i === sel} className={`palette-item ${i === sel ? 'on' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => run(r)}>
                <Icon name={r.icon} />
                <span>{r.group === "O'qituvchilar" ? shortName(r.label) : r.label}</span>
                {r.sub ? <span className="pi-sub">{r.sub}</span> : null}
              </button>
            </div>
          );
        })}
        {!results.length ? <div className="empty">Hech narsa topilmadi</div> : null}
      </div>
    </Modal>
  );
}
