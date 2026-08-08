import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutDashboard, Users, TrendingUp, Upload, FileText, Settings, UserPlus, Search,
} from 'lucide-react';

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: typeof LayoutDashboard;
  action: (navigate: ReturnType<typeof useNavigate>) => void;
}

const commands: Command[] = [
  { id: 'dashboard', label: 'Go to Dashboard', icon: LayoutDashboard, action: (nav) => nav('/') },
  { id: 'cohorts', label: 'Go to Cohorts', icon: Users, action: (nav) => nav('/cohorts') },
  { id: 'metrics', label: 'Go to Metrics', icon: TrendingUp, action: (nav) => nav('/metrics') },
  { id: 'import', label: 'Go to Import', icon: Upload, action: (nav) => nav('/import') },
  { id: 'report', label: 'Build Investor Update', icon: FileText, action: (nav) => nav('/investor-update') },
  { id: 'invites', label: 'Invite an Investor', icon: UserPlus, action: (nav) => nav('/invites') },
  { id: 'compare', label: 'Compare Companies', icon: TrendingUp, action: (nav) => nav('/compare') },
  { id: 'settings', label: 'Open Settings', icon: Settings, action: (nav) => nav('/settings') },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  }, []);

  const filtered = useMemo(
    () => commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase())),
    [query],
  );

  function run(cmd: Command) {
    cmd.action(navigate);
    setOpen(false);
    setQuery('');
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[998] bg-black/60 flex items-start justify-center pt-[15vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setOpen(false)}
        >
          <motion.div
            role="dialog"
            aria-label="Command palette"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-runway-borderStrong/80 bg-runway-raised/95 backdrop-blur-xl shadow-raised"
            style={{ boxShadow: '0 24px 64px -16px rgba(0,0,0,0.8)' }}
          >
            <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-runway-border/70">
              <Search size={16} className="text-runway-accent" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Jump to a screen or action…"
                className="bg-transparent outline-none text-sm text-runway-text flex-1 placeholder:text-runway-muted"
              />
              <kbd className="text-[10px] text-runway-muted border border-runway-border rounded-md px-1.5 py-0.5 bg-runway-charcoal">ESC</kbd>
            </div>
            <div className="max-h-80 overflow-y-auto py-1.5">
              {filtered.length === 0 && (
                <p className="px-4 py-6 text-sm text-runway-muted text-center">No matching commands.</p>
              )}
              {filtered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => run(c)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-runway-text hover:bg-white/[0.04] transition-colors text-left group"
                >
                  <span className="w-7 h-7 rounded-lg bg-white/[0.03] border border-runway-border/60 flex items-center justify-center group-hover:border-runway-accent/40 group-hover:bg-runway-accent/10">
                    <c.icon size={15} className="text-runway-muted group-hover:text-runway-accent" />
                  </span>
                  {c.label}
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
