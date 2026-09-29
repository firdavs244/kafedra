import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createStore } from './db.js';
import { makeCtx } from '../lib/analytics.js';
import { nowHM, todayISO } from '../lib/dates.js';

// Bitta ombor butun ilova uchun (modul darajasida — StrictMode'da ikki marta yaratilmaydi)
export const store = createStore();

const StoreCtx = createContext(store);
const ClockCtx = createContext({ today: todayISO(), now: nowHM() });

export function StoreProvider({ children }) {
  const [clock, setClock] = useState(() => ({ today: todayISO(), now: nowHM() }));
  useEffect(() => {
    const id = setInterval(() => {
      const next = { today: todayISO(), now: nowHM() };
      setClock((c) => (c.today === next.today && c.now === next.now ? c : next));
      store.tick();
    }, 30_000);
    return () => clearInterval(id);
  }, []);
  return (
    <StoreCtx.Provider value={store}>
      <ClockCtx.Provider value={clock}>{children}</ClockCtx.Provider>
    </StoreCtx.Provider>
  );
}

export const useStore = () => useContext(StoreCtx);
export const useClock = () => useContext(ClockCtx);

export function useDB() {
  const s = useStore();
  return useSyncExternalStore(s.subscribe, s.getState);
}

// Joriy ma'lumot + sana ustida hisoblash konteksti (analytics, AI vositalari uchun)
export function useCtx() {
  const state = useDB();
  const clock = useClock();
  return useMemo(() => makeCtx(state, clock), [state, clock]);
}
