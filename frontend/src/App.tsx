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
const Scenarios = lazy(() => import('./pages/Scenarios').then((m) => ({ default: m.Scenarios })));
const Integrations = lazy(() => import('./pages/Integrations').then((m) => ({ default: m.Integrations })));
const Billing = lazy(() => import('./pages/Billing').then((m) => ({ default: m.Billing })));
const ApiKeys = lazy(() => import('./pages/ApiKeys').then((m) => ({ default: m.ApiKeys })));
const Sessions = lazy(() => import('./pages/Sessions').then((m) => ({ default: m.Sessions })));
const Team = lazy(() => import('./pages/Team').then((m) => ({ default: m.Team })));
const Activity = lazy(() => import('./pages/Activity').then((m) => ({ default: m.Activity })));
const Login = lazy(() => import('./pages/Login').then((m) => ({ default: m.Login })));
const Signup = lazy(() => import('./pages/Signup').then((m) => ({ default: m.Signup })));
const ShareView = lazy(() => import('./pages/ShareView').then((m) => ({ default: m.ShareView })));

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
  const isPublicRoute = pathname.startsWith('/share');

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

  if (isPublicRoute) {
    return (
      <Suspense fallback={<AuthPageFallback />}>
        <Routes>
          <Route path="/share/:token" element={<ShareView />} />
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
          <Route path="/scenarios" element={<Scenarios />} />
          <Route path="/investor-update" element={<InvestorUpdate />} />
          <Route path="/invites" element={<Invites />} />
          <Route path="/team" element={<Team />} />
          <Route path="/activity" element={<Activity />} />
          <Route path="/integrations" element={<Integrations />} />
          <Route path="/billing" element={<Billing />} />
          <Route path="/api-keys" element={<ApiKeys />} />
  <Route path="/devices" element={<Sessions />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}
