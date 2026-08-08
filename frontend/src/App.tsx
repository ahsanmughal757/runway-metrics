import { lazy, Suspense } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { ChartCardSkeleton } from './components/Skeleton';

// Route-level code splitting — each page ships as its own chunk.
const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const Cohorts = lazy(() => import('./pages/Cohorts').then((m) => ({ default: m.Cohorts })));
const Metrics = lazy(() => import('./pages/Metrics').then((m) => ({ default: m.Metrics })));
const Import = lazy(() => import('./pages/Import').then((m) => ({ default: m.Import })));
const InvestorUpdate = lazy(() => import('./pages/InvestorUpdate').then((m) => ({ default: m.InvestorUpdate })));
const Compare = lazy(() => import('./pages/Compare').then((m) => ({ default: m.Compare })));
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));
const Invites = lazy(() => import('./pages/Invites').then((m) => ({ default: m.Invites })));
const Login = lazy(() => import('./pages/Login').then((m) => ({ default: m.Login })));
const Signup = lazy(() => import('./pages/Signup').then((m) => ({ default: m.Signup })));

function PageFallback() {
  return (
    <div className="flex flex-col gap-6">
      <ChartCardSkeleton height={260} />
    </div>
  );
}

function AuthPageFallback() {
  return <div className="min-h-screen bg-runway-bg" />;
}

export default function App() {
  const { pathname } = useLocation();
  const isAuthRoute = pathname === '/login' || pathname === '/signup';

  if (isAuthRoute) {
    return (
      <Suspense fallback={<AuthPageFallback />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <AppShell>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/cohorts" element={<Cohorts />} />
          <Route path="/metrics" element={<Metrics />} />
          <Route path="/import" element={<Import />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/investor-update" element={<InvestorUpdate />} />
          <Route path="/invites" element={<Invites />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}
