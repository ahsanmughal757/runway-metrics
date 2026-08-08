import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Keyboard } from 'lucide-react';

const SHORTCUTS = [
  { keys: ['⌘', 'K'], label: 'Open command palette' },
  { keys: ['?'], label: 'Show keyboard shortcuts' },
  { keys: ['Esc'], label: 'Close modals / palette' },
  { keys: ['⌘', 'Enter'], label: 'Submit focused form' },
];

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export function ShortcutsPanel() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey && !isEditableTarget(e.target)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  }, []);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[998] bg-black/60 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setOpen(false)}
        >
          <motion.div
            role="dialog"
            aria-label="Keyboard shortcuts"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm overflow-hidden rounded-2xl border border-runway-borderStrong/80 bg-runway-raised/95 backdrop-blur-xl shadow-raised"
            style={{ boxShadow: '0 24px 64px -16px rgba(0,0,0,0.8)' }}
          >
            <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-runway-border/70">
              <Keyboard size={16} className="text-runway-accent" />
              <p className="text-sm font-semibold text-runway-text">Keyboard shortcuts</p>
            </div>
            <div className="py-2">
              {SHORTCUTS.map((s) => (
                <div key={s.label} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="text-runway-muted">{s.label}</span>
                  <span className="flex items-center gap-1">
                    {s.keys.map((k) => (
                      <kbd
                        key={k}
                        className="text-[10px] text-runway-text border border-runway-border rounded-md px-1.5 py-0.5 bg-runway-charcoal"
                      >
                        {k}
                      </kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
