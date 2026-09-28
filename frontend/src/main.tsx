import React from 'react';
import ReactDOM from 'react-dom/client';
import { HeroUIProvider } from '@heroui/react';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { CompanyProvider } from './lib/CompanyContext';
import { AuthProvider } from './lib/AuthContext';
import { QueryProvider } from './lib/QueryContext';
import { ToastProvider } from './lib/ToastContext';
import './styles/globals.css';
import { applyTheme, getStoredTheme } from './lib/theme';

// Apply the persisted theme class before first paint (dark is the default).
// This is also what selects HeroUI's palette: `applyTheme` toggles the
// `runwayDark`/`runwayLight` classes that the tailwind plugin emits for the
// custom themes. `HeroUIProvider` takes no theme prop in this version.
applyTheme(getStoredTheme());

// Inside the router but outside the two providers that read from it: fetched
// data outlives a sign-in, so the cache must not be torn down and rebuilt when
// the session changes. `AuthProvider` clears it explicitly instead — see
// `clearQueryCache`.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HeroUIProvider>
      <BrowserRouter>
        <QueryProvider>
          <ToastProvider>
            <AuthProvider>
              <CompanyProvider>
                <App />
              </CompanyProvider>
            </AuthProvider>
          </ToastProvider>
        </QueryProvider>
      </BrowserRouter>
    </HeroUIProvider>
  </React.StrictMode>,
);
