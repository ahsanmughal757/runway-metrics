import React from 'react';
import ReactDOM from 'react-dom/client';
import { HeroUIProvider } from '@heroui/react';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { CompanyProvider } from './lib/CompanyContext';
import { AuthProvider } from './lib/AuthContext';
import { ToastProvider } from './lib/ToastContext';
import './styles/globals.css';
import { applyTheme, getStoredTheme } from './lib/theme';

// Apply the persisted theme class before first paint (dark is the default).
applyTheme(getStoredTheme());

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HeroUIProvider>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <CompanyProvider>
              <App />
            </CompanyProvider>
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </HeroUIProvider>
  </React.StrictMode>,
);
