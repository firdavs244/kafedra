// Global UI: bildirishnomalar (toast), forma/profil oynalari, Ctrl+K qidiruv,
// Telegram eslatma oynasi. Istalgan sahifadan useUI() orqali chaqiriladi.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import FormModal from './FormModal.jsx';
import TeacherModal from './TeacherModal.jsx';
import CommandPalette from './CommandPalette.jsx';
import Modal from './Modal.jsx';
import Icon from './Icon.jsx';
import { useDB } from '../store/StoreContext.jsx';
import { copyText, reminderText, telegramUrl } from '../lib/remind.js';

const UICtx = createContext(null);

function ReminderModal({ teacherId, subject, when, onClose, toast }) {
  const db = useDB();
  const teacher = db.teachers.find((t) => t.id === teacherId);
  const [text, setText] = useState(() => reminderText({ teacher, subject, when, head: db.settings.head, kafedra: db.settings.name }));
  return (
    <Modal onClose={onClose} label="Eslatma">
      <div className="modal-h">
        <div>
          <div className="eyebrow">Eslatma yuborish</div>
          <h2 style={{ marginTop: 4 }}>{teacher ? teacher.name : 'Mas\'ul shaxs'}</h2>
          {teacher?.telegram ? <div className="t-sub">Telegram: {teacher.telegram}</div> : null}
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Yopish">
          <Icon name="close" />
        </button>
      </div>
      <p className="lead">Matnni tahrirlashingiz mumkin. «Telegram'da ochish» tugmasi Telegram'ni tayyor matn bilan ochadi — qabul qiluvchini o'zingiz tanlaysiz, hech narsa avtomatik yuborilmaydi.</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={9} style={{ width: '100%' }} aria-label="Eslatma matni" />
      <div className="modal-f">
        <span className="t-sub">{text.length} belgi</span>
        <div className="r">
          <button
            type="button"
            className="btn"
            onClick={async () => {
              toast((await copyText(text)) ? 'Nusxa olindi' : "Nusxa olib bo'lmadi");
            }}
          >
            <Icon name="copy" />
            Nusxa olish
          </button>
          <a className="btn primary" href={telegramUrl(text)} target="_blank" rel="noreferrer" onClick={onClose}>
            <Icon name="telegram" />
            Telegram'da ochish
          </a>
        </div>
      </div>
    </Modal>
  );
}

export function UIProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [modal, setModal] = useState(null);
  const [palette, setPalette] = useState(false);

  const toast = useCallback((text, kind) => {
    if (!text) return;
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-2), { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'bad' ? 5000 : 2800);
  }, []);
  const close = useCallback(() => setModal(null), []);

  const api = useMemo(
    () => ({
      toast,
      openForm: (coll, id, preset) => setModal({ type: 'form', coll, id, preset }),
      openTeacher: (id) => setModal({ type: 'teacher', id }),
      remind: (p) => setModal({ type: 'remind', ...p }),
      openPalette: () => setPalette(true),
      close,
    }),
    [toast, close],
  );

  useEffect(() => {
    const on = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  return (
    <UICtx.Provider value={api}>
      {children}
      {modal?.type === 'form' ? <FormModal key={`${modal.coll}-${modal.id}`} coll={modal.coll} id={modal.id} preset={modal.preset} onClose={close} /> : null}
      {modal?.type === 'teacher' ? <TeacherModal id={modal.id} onClose={close} /> : null}
      {modal?.type === 'remind' ? <ReminderModal {...modal} onClose={close} toast={toast} /> : null}
      {palette ? <CommandPalette onClose={() => setPalette(false)} /> : null}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind || ''}`}>
            {t.text}
          </div>
        ))}
      </div>
    </UICtx.Provider>
  );
}

export const useUI = () => useContext(UICtx);
