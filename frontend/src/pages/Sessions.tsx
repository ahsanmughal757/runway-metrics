import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Button, Chip, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell } from '@heroui/react';
import { MonitorSmartphone } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../lib/ToastContext';
import { TableSkeleton } from '../components/Skeleton';

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
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<SessionRow[]>('/auth/sessions')
      .then(setSessions)
      // In demo mode the API has no session table and refuses the route. Saying
      // "no devices are signed in" there would be a lie: the user would conclude
      // they are safe when the list was never consulted.
      .catch(() => setUnavailable(true));
  }, []);

  async function revoke(row: SessionRow) {
    setRevoking(row.id);
    try {
      await api.del(`/auth/sessions/${row.id}`);
      setSessions((prev) => (prev ?? []).filter((s) => s.id !== row.id));
      push(
        row.isCurrent
          ? 'This device was signed out. You will be asked to sign in again.'
          : 'That device was signed out.',
        'success',
      );
    } catch (err) {
      push((err as Error).message, 'error');
    } finally {
      setRevoking(null);
    }
  }

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
          Every place this account is currently signed in. Signing one out revokes its session immediately - useful if you
          do not recognise a row.
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
            {sessions === null && !unavailable && <TableSkeleton rows={3} />}
            {unavailable && (
              <p className="text-sm text-runway-muted px-1 py-6 text-center">
                Sessions are only tracked when the API runs against a database. Start it with{' '}
                <code className="text-xs bg-white/[0.03] border border-runway-border/60 rounded-md px-1.5 py-0.5">
                  ENABLE_DATABASE=true
                </code>{' '}
                to see this list.
              </p>
            )}
            {sessions !== null && (
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
                        <Button
                          size="sm"
                          variant="light"
                          color="danger"
                          isLoading={revoking === s.id}
                          onPress={() => revoke(s)}
                        >
                          {s.isCurrent ? 'Sign out' : 'Revoke'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
