import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell } from 'lucide-react';
import { api } from '../lib/api';
import { companyKeys } from '../lib/queryKeys';
import { useCompany } from '../lib/CompanyContext';
import { ACTION_VERBS, ENTITY_ICONS, ENTITY_LABELS, type ActivityItem } from '../lib/audit';

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const hrs = Math.round(diffMs / (1000 * 60 * 60));
  if (hrs < 1) return 'just now';
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/**
 * The activity feed, as an ambient widget rather than a page.
 *
 * It fetches on mount and then never again: the dropdown is opened by a click, and
 * the newest events should be present by then. `refetchOnWindowFocus` (a default,
 * not set here) is what brings it back up to date when the user returns to the tab,
 * which is also the recovery path if the request failed — the badge is not
 * retryable on purpose. A bell that re-fires a request every time it is clicked
 * would hammer the audit table for something the user is only glancing at.
 */
export function NotificationsBell() {
  const { activeCompanyId } = useCompany();
  const [open, setOpen] = useState(false);

  const { data, isError } = useQuery({
    queryKey: companyKeys.activity(activeCompanyId),
    queryFn: ({ signal }) => api.get<ActivityItem[]>('/audit/recent', signal),
    enabled: activeCompanyId !== null,
  });

  // `?? []` rather than a `useState([])` initialiser, so an empty response and a
  // not-yet-arrived one are the same value and the badge cannot read "0 events"
  // before the fetch has been made.
  const items = data ?? [];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative w-9 h-9 rounded-xl border border-runway-border/70 bg-white/[0.02] flex items-center justify-center text-runway-muted hover:text-runway-text hover:border-runway-borderStrong transition-all duration-200"
      >
        <Bell size={16} />
        {items.length > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[17px] h-[17px] px-1 rounded-full bg-accent-gradient text-white text-[9px] font-semibold flex items-center justify-center ring-2 ring-runway-bg">
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
              className="absolute right-0 mt-2 w-80 overflow-hidden rounded-2xl border border-runway-borderStrong/80 bg-runway-raised/95 backdrop-blur-xl"
              style={{ boxShadow: '0 20px 56px -14px rgba(0,0,0,0.75)' }}
            >
              <div className="px-4 py-3 border-b border-runway-border/70 flex items-center justify-between">
                <p className="text-sm font-semibold text-runway-text">Activity</p>
                <span className="text-[10px] font-medium uppercase tracking-wider text-runway-muted">{items.length} events</span>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {/*
                  Three states, not one. The previous version caught every failure
                  and set the list to empty, so a server that was down rendered
                  "Nothing yet." — indistinguishable from a company that genuinely
                  has no events, and the more likely of the two to send someone
                  looking for a setting that does not exist. A failed read says so;
                  it does not masquerade as an empty one.
                */}
                {isError && <p className="text-xs text-runway-negative/90 text-center py-8">Could not load activity.</p>}
                {!isError && items.length === 0 && <p className="text-xs text-runway-muted text-center py-8">Nothing yet.</p>}
                {items.map((item) => {
                  const Icon = ENTITY_ICONS[item.entityType] ?? Bell;
                  return (
                    <div
                      key={item.id}
                      className="flex items-start gap-3 px-4 py-3 border-b border-runway-border/40 last:border-0 hover:bg-white/[0.02] transition-colors"
                    >
                      <span className="w-7 h-7 rounded-lg bg-runway-accent/10 border border-runway-accent/20 flex items-center justify-center shrink-0 mt-0.5">
                        <Icon size={13} className="text-runway-accent" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs text-runway-text leading-relaxed">
                          <span className="font-semibold">{item.changedBy}</span>{' '}
                          <span className="text-runway-muted">
                            {ACTION_VERBS[item.action] ?? item.action} {ENTITY_LABELS[item.entityType] ?? item.entityType}
                          </span>
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
