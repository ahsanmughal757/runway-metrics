import { motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Chip, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell } from '@heroui/react';
import { MonitorSmartphone } from 'lucide-react';
import { ApiError, api } from '../lib/api';
import { useToast } from '../lib/ToastContext';
import { TableSkeleton } from '../components/Skeleton';
import { ErrorState } from '../components/ErrorState';
import { authKeys } from '../lib/queryKeys';

interface SessionRow {
  id: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
  ip: string | null;
  userAgent: string | null;
  isCurrent: boolean;
}

const COLUMNS = ['DEVICE', 'IP ADDRESS', 'LAST ACTIVE', 'EXPIRES', 'ACTIONS'];

function formatWhen(iso: string): string {
  const date = new Date(iso);
  const days = Math.round((date.getTime() - Date.now()) / 86_400_000);
  // A device list is read for "how long have I got", not for a calendar date.
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 30) return `in ${days} days`;
  return date.toLocaleDateString('en-US', { dateStyle: 'medium' });
}

function activeLabel(row: SessionRow): string {
  if (!row.lastUsedAt) return 'Signed in, not used yet';
  const mins = Math.round((Date.now() - new Date(row.lastUsedAt).getTime()) / 60_000);
  if (mins < 1) return 'Active now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/**
 * The raw user agent, or a stand-in.
 *
 * The string is whatever the client sent, so it is shown rather than parsed:
 * "Mozilla/5.0 (Macintosh...)" is noise, but a wrong guess at someone's device
 * ("iPhone" for a desktop Safari) is worse than no guess. Unknown simply reads
 * as unknown.
 */
function describeAgent(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device';
  const browser = /Firefox\/[\d.]+/.test(userAgent)
    ? 'Firefox'
    : /Edg\//.test(userAgent)
      ? 'Edge'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : 'Browser';
  const platform = /Windows/.test(userAgent)
    ? 'Windows'
    : /iPhone|iPad|iPod/.test(userAgent)
      ? 'iOS'
      : /Mac OS X|Macintosh/.test(userAgent)
        ? 'macOS'
        : /Android/.test(userAgent)
          ? 'Android'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : '';
  return platform ? `${browser} on ${platform}` : browser;
}

export function Sessions() {
  const { push } = useToast();
  const queryClient = useQueryClient();

  const {
    data: sessions,
    isPending,
    isError,
    error,
    refetch,
  } = useQuery({
    // `authKeys`, not `companyKeys`: `/auth/sessions` carries `AuthGuard` and no
    // `CompanyScopeGuard`, and answers from the caller's own sessions, so the
    // company is not part of what this request depends on. A company-scoped key
    // would refetch an identical list every time the user switched company.
    //
    // There is consequently no `enabled` guard here, and that is the point rather
    // than an omission: the rule it enforces is "a query that needs a company must
    // not run without one", and this query does not need one. Gating it on the
    // bootstrap would delay the page for a dependency it never had.
    queryKey: authKeys.sessions(),
    queryFn: ({ signal }) => api.get<SessionRow[]>('/auth/sessions', signal),
  });

  // In demo mode the API has no session table and refuses the route. Saying
  // "no devices are signed in" there would be a lie: the user would conclude
  // they are safe when the list was never consulted.
  //
  // Only a refusal earns that explanation. An unreachable API or a 500 is a
  // different failure, and it used to land here too - which meant a backend that
  // was merely down told the reader to go and enable the database. Derived from
  // the query's error rather than stored in a flag, so it cannot survive the
  // error it was describing: a successful retry that lands on a 403 resets
  // nothing, because there is nothing to reset.
  const unavailable = error instanceof ApiError && (error.status === 403 || error.status === 404);

  const revoke = useMutation({
    mutationFn: (row: SessionRow) => api.del<void>(`/auth/sessions/${row.id}`),
    onSuccess: (_result, row) => {
      // 204, so the cache is edited in place rather than refetched: the row is
      // gone, or the request would have thrown. The key names the account rather
      // than a tenant, so there is no company to capture in the variables here —
      // which is what makes this safe to fire without threading one through.
      queryClient.setQueryData<SessionRow[]>(authKeys.sessions(), (prev) => prev?.filter((s) => s.id !== row.id));
      push(row.isCurrent ? 'This device was signed out. You will be asked to sign in again.' : 'That device was signed out.', 'success');
    },
    onError: (e: unknown) => {
      push((e as Error).message, 'error');
    },
  });

  if (isPending) return <TableSkeleton rows={3} />;
  // The database message is a different claim from "this failed", and it is only
  // true for a refusal - so it is chosen by the status, never by the fact of
  // having an error at all.
  if (unavailable) {
    return (
      <p className="text-sm text-runway-muted px-1 py-6 text-center">
        Sessions are only tracked when the API runs against a database. Start it with{' '}
        <code className="text-xs bg-white/[0.03] border border-runway-border/60 rounded-md px-1.5 py-0.5">ENABLE_DATABASE=true</code> to see
        this list.
      </p>
    );
  }
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;
  // An empty table is a claim about the account, and this account is signed in -
  // so "none" and "not loaded" cannot be rendered as the same thing.
  if (!sessions) return <ErrorState error={new Error('The device list did not load.')} />;

  return (
    <motion.div
      className="flex flex-col gap-6"
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
    >
      <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
        <h2 className="text-xl font-semibold tracking-tight text-runway-text">Signed-in devices</h2>
        <p className="text-sm text-runway-muted mt-0.5">
          Every place this account is currently signed in. Signing one out revokes its session immediately - useful if you do not recognise
          a row.
        </p>
      </motion.div>

      <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
        <div className="runway-card overflow-hidden">
          <div className="runway-sheen" />
          <div className="relative flex items-center gap-2 px-5 pt-5 pb-2">
            <MonitorSmartphone size={16} className="text-runway-accent" />
            <span className="text-sm font-semibold text-runway-text">Devices</span>
          </div>
          <div className="relative px-4 pb-4">
            <Table
              aria-label="Signed-in devices"
              removeWrapper
              classNames={{
                th: 'bg-transparent text-runway-muted text-[11px] uppercase tracking-wider',
                td: 'text-runway-text py-3',
                tr: 'border-b border-runway-border/50 last:border-0',
              }}
            >
              <TableHeader>
                {COLUMNS.map((c) => (
                  <TableColumn key={c}>{c}</TableColumn>
                ))}
              </TableHeader>
              <TableBody emptyContent="No other devices are signed in." items={sessions}>
                {(s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <span>{describeAgent(s.userAgent)}</span>
                        {s.isCurrent && (
                          <Chip size="sm" variant="flat" color="primary">
                            This device
                          </Chip>
                        )}
                      </div>
                      <div className="text-[11px] text-runway-muted font-normal mt-0.5">
                        Signed in {new Date(s.createdAt).toLocaleDateString('en-US', { dateStyle: 'medium' })}
                      </div>
                    </TableCell>
                    <TableCell className="text-runway-muted text-xs font-mono">
                      {s.ip ?? <span className="font-sans">Unknown</span>}
                    </TableCell>
                    <TableCell className="text-runway-muted text-xs">{activeLabel(s)}</TableCell>
                    <TableCell className="text-runway-muted text-xs">{formatWhen(s.expiresAt)}</TableCell>
                    <TableCell>
                      {/* The row being revoked is read off the mutation rather
                          than from a `revoking` state variable: the id has to
                          travel with the request, and a second flag tracking it
                          separately is a second thing that can disagree. */}
                      <Button
                        size="sm"
                        variant="light"
                        color="danger"
                        isLoading={revoke.isPending && revoke.variables?.id === s.id}
                        onPress={() => revoke.mutate(s)}
                      >
                        {s.isCurrent ? 'Sign out' : 'Revoke'}
                      </Button>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
