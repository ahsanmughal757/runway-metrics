import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { Card, CardBody } from '@heroui/react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { CommandPalette } from './CommandPalette';
import { ErrorBoundary } from './ErrorBoundary';
import { useCompany } from '../lib/CompanyContext';

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { error } = useCompany();

  return (
    <div className="flex min-h-screen bg-runway-bg">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 max-w-[1400px] w-full mx-auto px-6 py-6">
          <ErrorBoundary>
            {error ? (
              <Card className="bg-runway-surface border border-runway-border">
                <CardBody className="text-runway-negative text-sm">
                  Failed to load company data: {error}. Check that the backend is running (see README: demo mode needs
                  BYPASS_AUTH=true).
                </CardBody>
              </Card>
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
    </div>
  );
}
