// Kichik umumiy komponentlar: sarlavha, chiziqli ko'rsatkich, holat belgisi,
// segment tugmalar, bo'sh holat, ikki bosqichli tasdiq.
import { useEffect, useState } from 'react';
import { clamp } from '../lib/format.js';
import Icon from './Icon.jsx';

export function PageHeader({ eyebrow, title, sub, children }) {
  return (
    <header className="page-h">
      <div>
        {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
        <h1>{title}</h1>
        {sub ? <p className="sub">{sub}</p> : null}
      </div>
      {children ? <div className="h-actions">{children}</div> : null}
    </header>
  );
}

export function Bar({ value, cls = '', mark }) {
  const v = Math.round(value || 0);
  return (
    <div className="bar" role="img" aria-label={`${v}%`}>
      <i className={cls} style={{ width: `${clamp(v, 0, 100)}%` }} />
      {mark != null ? <span className="mark" style={{ left: `${clamp(mark, 0, 100)}%` }} /> : null}
    </div>
  );
}

export const toneOf = (p, good = 90, warn = 75) => (p >= good ? 'good' : p >= warn ? 'warn' : 'bad');

export function Pill({ children, cls }) {
  return <span className={`pill ${cls || ''}`}>{children}</span>;
}

export function Seg({ value, options, onChange, label }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([k, l]) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>
          {l}
        </button>
      ))}
    </div>
  );
}

export function Empty({ children, action }) {
  return (
    <div className="panel">
      <div className="empty">
        <div>{children}</div>
        {action}
      </div>
    </div>
  );
}

// Xavfli amal: birinchi bosishda "Aniqmi?" so'raydi
export function ConfirmButton({ children, confirmText = "Ha, o'chirish", onConfirm, className = 'btn danger', question = 'Aniqmi?' }) {
  const [ask, setAsk] = useState(false);
  useEffect(() => {
    if (!ask) return undefined;
    const t = setTimeout(() => setAsk(false), 6000);
    return () => clearTimeout(t);
  }, [ask]);
  if (!ask) {
    return (
      <button type="button" className={className} onClick={() => setAsk(true)}>
        {children}
      </button>
    );
  }
  return (
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <span className="t-sub">{question}</span>
      <button type="button" className="btn danger solid sm" onClick={() => { setAsk(false); onConfirm(); }}>
        {confirmText}
      </button>
      <button type="button" className="btn sm" onClick={() => setAsk(false)}>
        Bekor
      </button>
    </span>
  );
}

export function Sev({ sev }) {
  return <span className={`sev ${sev === 'bad' ? 'bad' : ''}`} aria-label={sev === 'bad' ? 'jiddiy' : 'diqqat'} />;
}

export function IconBtn({ icon, label, onClick, className = 'icon-btn', ...rest }) {
  return (
    <button type="button" className={className} onClick={onClick} aria-label={label} title={label} {...rest}>
      <Icon name={icon} />
    </button>
  );
}
