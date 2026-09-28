import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { CommandPalette } from './CommandPalette';
import { ShortcutsPanel } from './ShortcutsPanel';
import { ErrorBoundary } from './ErrorBoundary';
import { useCompany } from '../lib/CompanyContext';

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { error, offline } = useCompany();

  return (
    <div className="relative flex min-h-screen">
      {/* Ambient background glows that sit behind the whole app */}
      <div className="pointer-events-none fixed inset-0 z-0" aria-hidden>
        <div className="absolute -top-32 left-[12%] w-[34rem] h-[34rem] rounded-full bg-runway-accent/[0.07] blur-[120px]" />
        <div className="absolute top-[42%] -right-40 w-[30rem] h-[30rem] rounded-full bg-runway-accent2/[0.06] blur-[130px]" />
        <div className="absolute bottom-[-12rem] left-[35%] w-[28rem] h-[28rem] rounded-full bg-runway-positive/[0.05] blur-[120px]" />
      </div>

      <Sidebar />
      <div className="relative z-10 flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 max-w-[1400px] w-full mx-auto px-6 py-7">
          <ErrorBoundary>
            {error ? (
              // The message is the server's own, so it is shown rather than
              // replaced - but the *advice* is what had to change. This used to
              // say "check that the backend is running" for every failure, which
              // is actively wrong for a 401 (the backend is fine, you are signed
              // out) and for a permission failure. A dead network now says so.
              <div className="runway-card p-5 text-sm text-runway-negative border-runway-negative/30">
                Failed to load company data: {error}.{' '}
                {offline
                  ? 'The API did not respond at all - check that the backend is running (see README: demo mode needs BYPASS_AUTH=true).'
                  : 'If this persists, check that the backend is running with the settings this deployment expects.'}
              </div>
            ) : (
              <motion.div
                key={pathname}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                {children}
              </motion.div>
            )}
          </ErrorBoundary>
        </main>
      </div>
      <CommandPalette />
      <ShortcutsPanel />
    </div>
  );
}
