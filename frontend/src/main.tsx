import React from 'react';
import ReactDOM from 'react-dom/client';
import { HeroUIProvider } from '@heroui/react';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { CompanyProvider } from './lib/CompanyContext';
import { AuthProvider } from './lib/AuthContext';
import { ToastProvider } from './lib/ToastContext';
import './styles/globals.css';

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
