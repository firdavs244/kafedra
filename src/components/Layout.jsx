import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import Icon from './Icon.jsx';
import { NAV } from './nav.js';
import { useUI } from './UIProvider.jsx';
import { useCtx } from '../store/StoreContext.jsx';
import { computeAlerts } from '../lib/analytics.js';
import { health } from '../ai/client.js';

function useTheme() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('ka_theme') || 'system';
    } catch {
      return 'system';
    }
  });
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    try {
      if (theme === 'system') localStorage.removeItem('ka_theme');
      else localStorage.setItem('ka_theme', theme);
    } catch {
      /* e'tiborsiz */
    }
  }, [theme]);
  return [theme, setTheme];
}

function useAIStatus() {
  const [st, setSt] = useState({ state: 'checking' });
  useEffect(() => {
    let alive = true;
    health()
      .then((h) => alive && setSt({ state: h.keyConfigured || h.usingOwnKey ? 'ok' : 'nokey' }))
      .catch(() => alive && setSt({ state: 'offline' }));
    return () => {
      alive = false;
    };
  }, []);
  return st;
}

export default function Layout() {
  const ctx = useCtx();
  const loc = useLocation();
  const { openPalette } = useUI();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useTheme();
  const ai = useAIStatus();
  const alerts = computeAlerts(ctx);
  const badges = useMemo(() => {
    const m = {};
    alerts.filter((a) => a.sev === 'bad').forEach((a) => {
      m[a.view] = (m[a.view] || 0) + 1;
    });
    return m;
  }, [alerts]);

  useEffect(() => {
    setOpen(false);
    window.scrollTo(0, 0);
  }, [loc.pathname]);

  const nextTheme = { system: 'light', light: 'dark', dark: 'system' }[theme];
  const themeLabel = { system: 'Tizim mavzusi', light: "Yorug' mavzu", dark: "Qorong'i mavzu" }[theme];
  const aiText = { checking: 'AI tekshirilmoqda…', ok: 'AI ulangan (Groq)', nokey: "AI kaliti yo'q", offline: 'AI serveri javob bermadi' }[ai.state];
  const kafedra = ctx.settings.name && ctx.settings.name !== 'Kafedra' ? ctx.settings.name : 'Kafedra mudiri yordamchisi';

  return (
    <div className="app">
      <div className="topbar">
        <button type="button" className="icon-btn" onClick={() => setOpen(true)} aria-label="Menyu">
          <Icon name="menu" />
        </button>
        <Link to="/" className="brand">
          <div className="brand-mark">KA</div>
          <div>
            <b>KafedraAgent</b>
          </div>
        </Link>
        <span className="grow" />
        <button type="button" className="icon-btn" onClick={openPalette} aria-label="Qidiruv">
          <Icon name="search" />
        </button>
        <Link to="/agent" className="icon-btn" aria-label="AI Agent">
          <Icon name="agent" />
        </Link>
      </div>
      <div className={`scrim-nav ${open ? 'open' : ''}`} onClick={() => setOpen(false)} />
      <aside className={`side ${open ? 'open' : ''}`} aria-label="Asosiy menyu">
        <Link to="/" className="brand">
          <div className="brand-mark">KA</div>
          <div>
            <b>KafedraAgent</b>
            <small>{kafedra}</small>
          </div>
        </Link>
        <button type="button" className="side-search" onClick={openPalette}>
          <Icon name="search" />
          Qidirish…
          <kbd>Ctrl K</kbd>
        </button>
        <nav className="nav" aria-label="Bo'limlar">
          {NAV.map((n, i) =>
            n.sep ? (
              <div key={`s${i}`} className="nav-sep">
                {n.sep}
              </div>
            ) : (
              <NavLink key={n.key} to={n.path} end={n.path === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
                <Icon name={n.icon} />
                <span>{n.label}</span>
                {badges[n.key] ? <span className="badge">{badges[n.key]}</span> : n.isNew ? <span className="new">AI</span> : null}
              </NavLink>
            ),
          )}
        </nav>
        <div className="side-foot">
          <div>
            <span className={`dot ${ai.state === 'ok' ? '' : ai.state === 'checking' ? 'off' : 'bad'}`} />
            {aiText}
          </div>
          {ctx.meta?.demo ? (
            <div>
              <span className="demo-badge">
                <Icon name="info" size={13} />
                Namuna ma'lumotlar
              </span>
            </div>
          ) : null}
          <div className="row">
            <span>{ctx.settings.year} o'quv yili</span>
            <button type="button" className="icon-btn" onClick={() => setTheme(nextTheme)} aria-label={themeLabel} title={themeLabel}>
              <Icon name={theme === 'dark' ? 'moon' : theme === 'light' ? 'sun' : 'eye'} />
            </button>
          </div>
        </div>
      </aside>
      <main id="main">
        <Outlet />
      </main>
    </div>
  );
}
