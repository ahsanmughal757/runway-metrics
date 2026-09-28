import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { ChartCardSkeleton } from './components/Skeleton';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useCompany } from './lib/CompanyContext';

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
const NotFound = lazy(() => import('./pages/NotFound').then((m) => ({ default: m.NotFound })));

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

/**
 * Wraps the authenticated routes: while the identity bootstrap is in flight,
 * hold; if the server said 401, go and sign in.
 *
 * The redirect is keyed on `CompanyProvider.unauthorized` rather than on the
 * presence of a localStorage token, because demo mode has no token and is fully
 * usable - a guard built on the token would lock the demo out of every page. The
 * server's answer is the only signal that distinguishes "signed out" from "never
 * needed to sign in".
 *
 * The intended destination rides along in `state.from` so signing in returns
 * the user to the deep link they asked for. Sending everyone to `/` after login
 * is a small thing that makes bookmarked URLs feel broken.
 */
function RequireSession({ children }: { children: React.ReactNode }) {
  const { loading, unauthorized } = useCompany();
  const location = useLocation();

  // Wait for the server's answer before deciding anything.
  //
  // There is deliberately no `!isAuthenticated` shortcut here. It looks like the
  // obvious thing to check and it is wrong twice over: it redirects a signed-out
  // user to a login page whose own bootstrap then has to resolve anyway, and in
  // demo mode - where `BYPASS_AUTH=true` means there is no token to find - it
  // sends a perfectly valid session to the login screen on every single page.
  if (loading) return <PageFallback />;
  if (unauthorized) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  // Any other failure is handed to `AppShell`, which distinguishes a dead network
  // from a refusal and does not render the page behind the error.
  return <>{children}</>;
}

/**
 * Puts the scroll position back at the top on navigation.
 *
 * Without it a route change keeps the previous offset, so following a link from
 * halfway down a long metrics table lands you halfway down a short settings page
 * - or, on some browsers, past its entire content.
 */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  const { pathname } = useLocation();
  const isAuthRoute = pathname === '/login' || pathname === '/signup';
  const isPublicRoute = pathname.startsWith('/share');

  return (
    <>
      <ScrollToTop />
      {isAuthRoute ? (
        // Login and Signup had no error boundary at all: a throw in either
        // unmounted the entire React tree to a blank page, with no message and
        // no way back. Public routes had the same gap.
        <ErrorBoundary variant="full">
          <Suspense fallback={<AuthPageFallback />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      ) : isPublicRoute ? (
        <ErrorBoundary variant="full">
          <Suspense fallback={<AuthPageFallback />}>
            <Routes>
              <Route path="/share/:token" element={<ShareView />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      ) : (
        <RequireSession>
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
                {/* An unknown URL used to fall through every branch and render the
                    AppShell chrome around an empty <main> - a silent blank page
                    with a 200. This makes it a real answer, and gives the deep
                    link somewhere to go. */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </AppShell>
        </RequireSession>
      )}
    </>
  );
}
