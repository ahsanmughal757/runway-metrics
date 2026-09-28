/**
 * The provider chain, for tests.
 *
 * This is `main.tsx` copied, deliberately including the nesting. A test that
 * builds its own smaller chain passes in a shape the app never runs, and the
 * ordering here is load-bearing rather than incidental:
 *
 * - `QueryProvider` sits *inside* the router but *outside* `AuthProvider`, so
 *   signing in and out does not tear down the cache. A harness that put the
 *   query client below the auth provider would rebuild it on every session
 *   change, which is the exact bug the production tree avoids.
 * - `AuthProvider` clears the cache itself on sign-out, so the client has to
 *   outlive it.
 *
 * `HeroUIProvider` is included even though most tests pass without it, so that a
 * component depending on HeroUI's plugin context behaves in the harness the way
 * it behaves in the app. If a test ever needs a chain that differs from this,
 * that is a signal worth investigating rather than a reason to edit this file.
 */
import { render, type RenderOptions } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HeroUIProvider } from '@heroui/react';
import type { ReactElement } from 'react';
import { QueryProvider } from '../lib/QueryContext';
import { AuthProvider } from '../lib/AuthContext';
import { CompanyProvider } from '../lib/CompanyContext';
import { ToastProvider } from '../lib/ToastContext';

export interface ProviderOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Initial history entry. Pages that read route params need it. */
  route?: string;
}

export function renderWithProviders(ui: ReactElement, { route = '/', ...options }: ProviderOptions = {}) {
  return render(ui, {
    ...options,
    wrapper: ({ children }) => (
      <HeroUIProvider>
        <MemoryRouter initialEntries={[route]}>
          <QueryProvider>
            <ToastProvider>
              <AuthProvider>
                <CompanyProvider>{children}</CompanyProvider>
              </AuthProvider>
            </ToastProvider>
          </QueryProvider>
        </MemoryRouter>
      </HeroUIProvider>
    ),
  });
}
