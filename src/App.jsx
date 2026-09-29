import { Component, lazy, Suspense } from 'react';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { UIProvider } from './components/UIProvider.jsx';
import { StoreProvider } from './store/StoreContext.jsx';
import Home from './pages/Home.jsx';
import Agent from './pages/Agent.jsx';

// Og'irroq sahifalar birinchi ochilishda yuklanadi — bosh sahifa tezroq chiqadi
const Workload = lazy(() => import('./pages/Workload.jsx'));
const Subjects = lazy(() => import('./pages/Subjects.jsx'));
const Teachers = lazy(() => import('./pages/Teachers.jsx'));
const Attendance = lazy(() => import('./pages/Attendance.jsx'));
const Students = lazy(() => import('./pages/Students.jsx'));
const Pubs = lazy(() => import('./pages/Pubs.jsx'));
const Projects = lazy(() => import('./pages/Projects.jsx'));
const Stwork = lazy(() => import('./pages/Stwork.jsx'));
const Kpi = lazy(() => import('./pages/Kpi.jsx'));
const Reports = lazy(() => import('./pages/Reports.jsx'));
const DocScan = lazy(() => import('./pages/DocScan.jsx'));
const Quality = lazy(() => import('./pages/Quality.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));

// Bitta sahifadagi xato butun ilovani oq ekranga aylantirmasin (taqdimotda muhim)
class Boundary extends Component {
  constructor(props) {
    super(props);
    this.state = { err: null };
  }
  static getDerivedStateFromError(err) {
    return { err };
  }
  componentDidCatch(err, info) {
    console.error(err, info);
  }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="panel">
        <div className="empty">
          <strong style={{ color: 'var(--fg)' }}>Bu sahifada kutilmagan xato yuz berdi</strong>
          <span className="t-sub">{String(this.state.err?.message || this.state.err)}</span>
          <div className="chips">
            <button type="button" className="btn" onClick={() => this.setState({ err: null })}>
              Qayta urinish
            </button>
            <Link className="btn primary" to="/" onClick={() => this.setState({ err: null })}>
              Bosh sahifa
            </Link>
          </div>
        </div>
      </div>
    );
  }
}

const Loading = () => (
  <div className="empty">
    <span className="thinking">
      <i />
      <i />
      <i />
      Yuklanmoqda…
    </span>
  </div>
);

function NotFound() {
  return (
    <div className="panel">
      <div className="empty">
        <strong style={{ color: 'var(--fg)' }}>Sahifa topilmadi</strong>
        <Link className="btn primary" to="/">
          Bosh sahifaga qaytish
        </Link>
      </div>
    </div>
  );
}

const page = (El) => (
  <Boundary>
    <Suspense fallback={<Loading />}>
      <El />
    </Suspense>
  </Boundary>
);

export default function App() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <UIProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={page(Home)} />
              <Route path="agent" element={page(Agent)} />
              <Route path="hujjat" element={page(DocScan)} />
              <Route path="yuklama" element={page(Workload)} />
              <Route path="oquv-yuklama" element={page(Subjects)} />
              <Route path="oqituvchilar" element={page(Teachers)} />
              <Route path="davomat" element={page(Attendance)} />
              <Route path="talabalar" element={page(Students)} />
              <Route path="ilmiy" element={page(Pubs)} />
              <Route path="loyihalar" element={page(Projects)} />
              <Route path="talabalar-bilan-ish" element={page(Stwork)} />
              <Route path="kpi" element={page(Kpi)} />
              <Route path="hisobotlar" element={page(Reports)} />
              <Route path="sifat" element={page(Quality)} />
              <Route path="sozlamalar" element={page(Settings)} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </UIProvider>
      </BrowserRouter>
    </StoreProvider>
  );
}
