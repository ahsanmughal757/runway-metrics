import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Pagination, Tab, Tabs } from '@heroui/react';
import { Activity as ActivityIcon, FileText, TrendingUp, UserPlus, Upload as UploadIcon } from 'lucide-react';
import { api } from '../lib/api';
import { useCompany } from '../lib/CompanyContext';

interface ActivityItem {
  id: string;
  entityType: string;
  action: string;
  changedBy: string;
  changedAt: string;
}

interface ActivityPage {
  items: ActivityItem[];
  total: number;
  page: number;
  pageSize: number;
}

const FILTERS = [
  { key: 'all', label: 'All', entityType: undefined },
  { key: 'snapshot', label: 'Snapshot', entityType: 'MetricSnapshot' },
  { key: 'invite', label: 'Invite', entityType: 'InvestorInvite' },
  { key: 'report', label: 'Report', entityType: 'Report' },
];

const iconFor: Record<string, typeof ActivityIcon> = {
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

const PAGE_SIZE = 12;

export function Activity() {
  const { activeCompanyId, role } = useCompany();
  const [data, setData] = useState<ActivityPage | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [page, setPage] = useState(1);

  const load = useCallback(
    (entityType: string | undefined, p: number) => {
      if (!activeCompanyId) return;
      const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
      if (entityType) params.set('entityType', entityType);
      api.get<ActivityPage>(`/audit?${params.toString()}`).then(setData);
    },
    [activeCompanyId],
  );

  useEffect(() => {
    const f = FILTERS.find((x) => x.key === filter);
    load(f?.entityType, page);
  }, [filter, page, load]);

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
            {!data && <div className="py-10 text-center text-sm text-runway-muted">Loading…</div>}
            {data && data.items.length === 0 && (
              <div className="py-10 text-center text-sm text-runway-muted">No activity in this filter yet.</div>
            )}
            {data && data.items.length > 0 && (
              <div className="divide-y divide-runway-border/40">
                {data.items.map((item) => {
                  const Icon = iconFor[item.entityType] ?? ActivityIcon;
                  return (
                    <div key={item.id} className="flex items-start gap-3 py-3 px-2">
                      <span className="w-8 h-8 rounded-lg bg-runway-accent/10 border border-runway-accent/20 flex items-center justify-center shrink-0 mt-0.5">
                        <Icon size={14} className="text-runway-accent" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-runway-text leading-relaxed">
                          <span className="font-semibold">{item.changedBy}</span>{' '}
                          <span className="text-runway-muted">{item.action}</span>
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
                          {' · '}
                          <span className="text-runway-muted/80">{item.entityType}</span>
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
