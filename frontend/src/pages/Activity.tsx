import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Pagination, Tab, Tabs } from '@heroui/react';
import { Activity as ActivityIcon } from 'lucide-react';
import { api } from '../lib/api';
import { useCompany } from '../lib/CompanyContext';
import { companyKeys } from '../lib/queryKeys';
import { ACTION_VERBS, ENTITY_ICONS, ENTITY_LABELS, type ActivityItem, type AuditEntityType } from '../lib/audit';
import { TableSkeleton } from '../components/Skeleton';
import { ErrorState } from '../components/ErrorState';

interface ActivityPage {
  items: ActivityItem[];
  total: number;
  page: number;
  pageSize: number;
}

const FILTERS: { key: string; label: string; entityType: AuditEntityType | undefined }[] = [
  { key: 'all', label: 'All', entityType: undefined },
  { key: 'snapshot', label: 'Snapshot', entityType: 'METRIC_SNAPSHOT' },
  { key: 'customer', label: 'Customer', entityType: 'CUSTOMER' },
  { key: 'invite', label: 'Invite', entityType: 'INVITE' },
  { key: 'member', label: 'Team', entityType: 'MEMBER' },
];

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const hrs = Math.round(diffMs / (1000 * 60 * 60));
  if (hrs < 1) return 'just now';
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

const PAGE_SIZE = 12;

export function Activity() {
  const { activeCompanyId } = useCompany();
  const [filter, setFilter] = useState<string>('all');
  const [page, setPage] = useState(1);

  const entityType = FILTERS.find((x) => x.key === filter)?.entityType;

  const { data, isPending, isError, error, refetch } = useQuery({
    // `audit` rather than `activity`, which the notification bell already owns
    // for the unfiltered `/audit/recent` feed. The two are different resources
    // over the same table, and one key naming both would let the bell's five
    // recent events satisfy this page's first request.
    //
    // The filter is appended rather than folded into a factory, because the
    // factory carries the page and not the entity type. Appending to a built key
    // still writes the company id exactly once, which is the part the
    // isolation rule in `queryKeys.ts` needs to be unable to lose.
    queryKey: [...companyKeys.audit(activeCompanyId, page), entityType ?? 'all'],
    // Built from the same two values as the key, so the request and the entry
    // it can populate can never disagree about which page is being asked for.
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (entityType) params.set('entityType', entityType);
      return api.get<ActivityPage>(`/audit?${params.toString()}`, signal);
    },
    // No company, no request. See the rule in `queryKeys.ts`.
    enabled: activeCompanyId !== null,
  });

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  return (
    <motion.div
      className="flex flex-col gap-6"
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
    >
      <motion.div
        variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-runway-text">Activity</h2>
          <p className="text-sm text-runway-muted mt-0.5">Audit trail of changes across this workspace.</p>
        </div>
        <Tabs
          aria-label="Activity filter"
          size="sm"
          selectedKey={filter}
          onSelectionChange={(key) => {
            setFilter(key as string);
            setPage(1);
          }}
          color="primary"
          variant="solid"
          classNames={{
            tabList: 'bg-white/[0.03] border border-runway-border/70 rounded-xl p-1',
            tab: 'text-runway-muted data-[selected=true]:text-white rounded-lg',
            cursor: 'bg-accent-gradient',
          }}
        >
          {FILTERS.map((f) => (
            <Tab key={f.key} title={f.label} />
          ))}
        </Tabs>
      </motion.div>

      <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
        <div className="runway-card overflow-hidden">
          <div className="runway-sheen" />
          <div className="relative px-4 py-2">
            {/* Not an early return, unlike the other pages: the filter tabs are
                how a user gets out of a failed load, so a full-page error state
                would take the only recovery control with it. */}
            {(activeCompanyId === null || isPending) && <TableSkeleton rows={5} />}
            {isError && <ErrorState error={error} onRetry={() => void refetch()} />}
            {data && data.items.length === 0 && (
              <div className="py-10 text-center text-sm text-runway-muted">No activity in this filter yet.</div>
            )}
            {data && data.items.length > 0 && (
              <div className="divide-y divide-runway-border/40">
                {data.items.map((item) => {
                  const Icon = ENTITY_ICONS[item.entityType] ?? ActivityIcon;
                  return (
                    <div key={item.id} className="flex items-start gap-3 py-3 px-2">
                      <span className="w-8 h-8 rounded-lg bg-runway-accent/10 border border-runway-accent/20 flex items-center justify-center shrink-0 mt-0.5">
                        <Icon size={14} className="text-runway-accent" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-runway-text leading-relaxed">
                          <span className="font-semibold">{item.changedBy}</span>{' '}
                          <span className="text-runway-muted">
                            {ACTION_VERBS[item.action] ?? item.action} {ENTITY_LABELS[item.entityType] ?? item.entityType}
                          </span>
                        </p>
                        <p className="text-[11px] text-runway-muted mt-0.5">
                          {new Date(item.changedAt).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                          {' · '}
                          {timeAgo(item.changedAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {data && data.total > PAGE_SIZE && (
            <div className="relative flex items-center justify-center py-4 border-t border-runway-border/40">
              <Pagination
                total={totalPages}
                page={page}
                onChange={setPage}
                size="sm"
                classNames={{
                  item: 'bg-white/[0.03] text-runway-muted data-[selected=true]:bg-accent-gradient data-[selected=true]:text-white rounded-lg border border-runway-border/60',
                }}
              />
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
