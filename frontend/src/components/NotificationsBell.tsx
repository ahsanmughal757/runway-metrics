import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, FileText, Upload as UploadIcon, UserPlus, TrendingUp } from 'lucide-react';
import { api } from '../lib/api';
import { useCompany } from '../lib/CompanyContext';

interface ActivityItem {
  id: string;
  entityType: string;
  action: string;
  changedBy: string;
  changedAt: string;
}

const iconFor: Record<string, typeof Bell> = {
  MetricSnapshot: TrendingUp,
  InvestorInvite: UserPlus,
  Report: FileText,
  Csv: UploadIcon,
};

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const hrs = Math.round(diffMs / (1000 * 60 * 60));
  if (hrs < 1) return 'just now';
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function NotificationsBell() {
  const { activeCompanyId, role } = useCompany();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!activeCompanyId) return;
    api.get<ActivityItem[]>('/audit/recent').then(setItems).catch(() => setItems([]));
  }, [activeCompanyId, role]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative w-9 h-9 rounded-md border border-runway-border bg-runway-surface flex items-center justify-center text-runway-muted hover:text-runway-text transition-colors"
      >
        <Bell size={16} />
        {items.length > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-runway-accent text-white text-[9px] flex items-center justify-center">
            {items.length}
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97 }}
              transition={{ duration: 0.14 }}
              className="absolute right-0 mt-2 w-80 bg-runway-raised border border-runway-borderStrong rounded-lg shadow-raised z-50 overflow-hidden"
            >
              <div className="px-4 py-2.5 border-b border-runway-border">
                <p className="text-sm font-medium text-runway-text">Activity</p>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {items.length === 0 && (
                  <p className="text-xs text-runway-muted text-center py-8">Nothing yet.</p>
                )}
                {items.map((item) => {
                  const Icon = iconFor[item.entityType] ?? Bell;
                  return (
                    <div key={item.id} className="flex items-start gap-2.5 px-4 py-2.5 border-b border-runway-border/50 last:border-0">
                      <Icon size={14} className="text-runway-accent mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs text-runway-text">
                          <span className="font-medium">{item.changedBy}</span> {item.action}
                        </p>
                        <p className="text-[11px] text-runway-muted mt-0.5">{timeAgo(item.changedAt)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
