import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';

type ToastVariant = 'success' | 'error' | 'info';
interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  push: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const variantStyles: Record<ToastVariant, { icon: typeof CheckCircle2; color: string }> = {
  success: { icon: CheckCircle2, color: 'text-runway-positive' },
  error: { icon: XCircle, color: 'text-runway-negative' },
  info: { icon: Info, color: 'text-runway-accent' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((t) => [...t, { id, message, variant }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  const dismiss = (id: string) => setToasts((t) => t.filter((x) => x.id !== id));

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[999] flex flex-col gap-2 w-80" role="region" aria-live="polite">
        <AnimatePresence>
          {toasts.map((t) => {
            const { icon: Icon, color } = variantStyles[t.variant];
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 40 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="flex items-start gap-2.5 rounded-xl border border-runway-borderStrong/80 bg-runway-raised/90 backdrop-blur-xl px-3.5 py-3 shadow-raised"
                style={{ boxShadow: '0 16px 44px -12px rgba(0,0,0,0.7)' }}
              >
                <Icon size={17} className={`shrink-0 mt-0.5 ${color}`} />
                <p className="text-sm text-runway-text flex-1">{t.message}</p>
                <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-runway-muted hover:text-runway-text">
                  <X size={14} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
