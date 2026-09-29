// Sxemaga asoslangan qo'shish/tahrirlash formasi — barcha bo'limlar uchun bitta.
import { useRef, useState } from 'react';
import Modal from './Modal.jsx';
import Icon from './Icon.jsx';
import { ConfirmButton } from './ui.jsx';
import { SCHEMA } from '../lib/constants.js';
import { shortName } from '../lib/format.js';
import { useDB, useStore } from '../store/StoreContext.jsx';
import { useUI } from './UIProvider.jsx';

export default function FormModal({ coll, id, preset, onClose }) {
  const store = useStore();
  const db = useDB();
  const { toast } = useUI();
  const sc = SCHEMA[coll];
  const doc = id ? db[coll].find((x) => x.id === id) : null;
  const v = { ...(preset || {}), ...(doc || {}) };
  const [err, setErr] = useState('');
  const formRef = useRef(null);
  const teachers = db.teachers.slice().sort((a, b) => a.name.localeCompare(b.name));
  if (!sc) return null;

  function submit(e) {
    e.preventDefault();
    const f = formRef.current;
    const out = {};
    for (const fd of sc.fields) {
      if (fd.t === 'teachers') {
        out[fd.k] = [...f.querySelectorAll(`input[name="${fd.k}"]:checked`)].map((i) => i.value);
        continue;
      }
      const el = f.elements[fd.k];
      if (!el) continue;
      let val = el.value;
      if (fd.t === 'number') val = val === '' ? 0 : Number(val);
      else val = String(val).trim();
      out[fd.k] = val;
    }
    const miss = sc.fields.find((x) => x.req && !out[x.k]);
    if (miss) {
      setErr(`«${miss.l}» maydonini to'ldiring.`);
      return;
    }
    if (coll === 'grades') {
      const sum = ['a', 'b', 'c', 'f'].reduce((a, k) => a + (out[k] || 0), 0);
      if (sum > out.students) {
        setErr(`Baholar yig'indisi (${sum}) talabalar sonidan (${out.students}) oshib ketdi.`);
        return;
      }
      // Qarzdorlar ro'yxati "qoniqarsiz" soniga mos qolsin
      if (doc?.debtors?.length > out.f) out.debtors = doc.debtors.slice(0, out.f);
      if (doc) out.kurs = doc.kurs;
    }
    try {
      if (doc) store.update(coll, doc.id, out);
      else store.insert(coll, out);
      toast('Saqlandi');
      onClose();
    } catch (ex) {
      setErr(ex.message || "Saqlab bo'lmadi");
    }
  }

  const field = (f) => {
    const val = v[f.k] ?? f.def ?? (f.t === 'month' ? new Date().toISOString().slice(0, 7) : '');
    const idA = `fm-${f.k}`;
    let input;
    if (f.t === 'select') {
      input = (
        <select id={idA} name={f.k} defaultValue={String(val || f.o[0])}>
          {f.o.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      );
    } else if (f.t === 'teacher') {
      input = (
        <select id={idA} name={f.k} defaultValue={val} required={!!f.req}>
          <option value="">— tanlang —</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      );
    } else if (f.t === 'teachers') {
      input = (
        <div className="multi">
          {teachers.length ? teachers.map((t) => (
            <label key={t.id} className="check">
              <input type="checkbox" name={f.k} value={t.id} defaultChecked={(val || []).includes(t.id)} /> {shortName(t.name)}
            </label>
          )) : <span className="t-sub">Avval o'qituvchi qo'shing</span>}
        </div>
      );
    } else {
      input = <input id={idA} name={f.k} type={f.t} step={f.step || (f.t === 'number' ? 'any' : undefined)} defaultValue={val} required={!!f.req} />;
    }
    return (
      <div key={f.k} className={`field ${f.full ? 'full' : ''}`}>
        <label htmlFor={idA}>
          {f.l}
          {f.req ? ' *' : ''}
        </label>
        {input}
      </div>
    );
  };

  return (
    <Modal onClose={onClose} label={sc.one}>
      <form ref={formRef} onSubmit={submit} noValidate>
        <div className="modal-h">
          <h2>
            {doc ? 'Tahrirlash' : 'Yangi'}: {sc.one}
          </h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Yopish">
            <Icon name="close" />
          </button>
        </div>
        <div className="form">{sc.fields.map(field)}</div>
        {err ? <div className="err" style={{ marginTop: 10 }}>{err}</div> : null}
        <div className="modal-f">
          {doc ? (
            <ConfirmButton
              onConfirm={() => {
                store.remove(coll, doc.id);
                toast("O'chirildi");
                onClose();
              }}
            >
              O'chirish
            </ConfirmButton>
          ) : <span />}
          <div className="r">
            <button type="button" className="btn" onClick={onClose}>
              Bekor qilish
            </button>
            <button type="submit" className="btn primary">
              Saqlash
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
