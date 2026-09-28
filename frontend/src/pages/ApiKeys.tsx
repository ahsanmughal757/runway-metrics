import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Button,
  Checkbox,
  Input,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
} from '@heroui/react';
import { KeyRound, Plus, Trash2 } from 'lucide-react';
import { useToast } from '../lib/ToastContext';
import { api, ApiError } from '../lib/api';
import { useCompany } from '../lib/CompanyContext';
import { ErrorState } from '../components/ErrorState';
import { TableSkeleton } from '../components/Skeleton';

interface ApiKeySummary {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  isRevoked: boolean;
}

interface CreatedKey {
  secret: string;
  key: ApiKeySummary;
}

const date = (iso: string) => new Date(iso).toLocaleDateString('en-US', { dateStyle: 'medium' });

/** Plain labels for the scope vocabulary, which is a permission name on the wire. */
const SCOPE_LABELS: Record<string, string> = {
  'company:read': 'Read company settings',
  'company:update': 'Update company settings',
  'company:delete': 'Delete the company',
  'members:read': 'Read members',
  'members:invite': 'Invite members',
  'members:updateRole': "Change members' roles",
  'members:remove': 'Remove members',
  'metrics:read': 'Read metrics',
  'metrics:write': 'Write metrics',
  'customers:read': 'Read customers',
  'customers:write': 'Write customers',
  'reports:read': 'Read reports',
  'reports:generate': 'Generate reports',
  'reports:share': 'Create share links',
  'audit:read': 'Read the audit log',
  // Never offered. Listed so the page can say why the checkbox is missing
  // rather than leaving a reader to wonder what a key deliberately cannot do.
  'apiKeys:manage': 'Manage API keys (not available to keys)',
};

export function ApiKeys() {
  const { push } = useToast();
  const { can, activeCompanyId } = useCompany();
  const canManage = can('apiKeys:manage');

  const [keys, setKeys] = useState<ApiKeySummary[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [revoking, setRevoking] = useState<ApiKeySummary | null>(null);
  /** The one and only time the secret exists in the browser. */
  const [fresh, setFresh] = useState<CreatedKey | null>(null);

  useEffect(() => {
    if (!canManage || !activeCompanyId) {
      // Nothing to fetch and nothing honest to show. The absence of the table
      // is the permission being enforced, not a failure to load.
      setKeys([]);
      return;
    }
    let cancelled = false;
    setKeys(null);
    setError(null);
    api
      .get<ApiKeySummary[]>('/companies/api-keys')
      .then((rows) => {
        if (!cancelled) setKeys(rows);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e);
      });
    return () => {
      cancelled = true;
    };
  }, [activeCompanyId, attempt, canManage]);

  async function createKey() {
    setSubmitting(true);
    try {
      const created = await api.post<CreatedKey>('/companies/api-keys', { name, scopes });
      setKeys((prev) => [created.key, ...(prev ?? [])]);
      setCreating(false);
      setName('');
      setScopes([]);
      setFresh(created);
    } catch (e) {
      push(e instanceof ApiError ? e.message : 'The key could not be created.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function revokeKey(row: ApiKeySummary) {
    try {
      await api.del(`/companies/api-keys/${row.id}`);
      setKeys((prev) => (prev ?? []).map((k) => (k.id === row.id ? { ...k, isRevoked: true, revokedAt: new Date().toISOString() } : k)));
      setRevoking(null);
      push(`${row.name} revoked.`, 'success');
    } catch (e) {
      // Not swallowed into the table: a revocation that silently fails leaves
      // the operator believing a leaked key is dead.
      push(e instanceof ApiError ? e.message : 'The key could not be revoked.', 'error');
    }
  }

  const SCOPES = Object.entries(SCOPE_LABELS).filter(([scope]) => scope !== 'apiKeys:manage');

  return (
    <motion.div
      className="flex flex-col gap-6"
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
    >
      <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
        <h2 className="text-xl font-semibold tracking-tight text-runway-text">API Keys</h2>
        <p className="text-sm text-runway-muted mt-0.5">
          Machine credentials for the Runway API. Send one as the <code className="text-xs">X-Api-Key</code> header. The secret is shown once
          and is never retrievable afterwards.
        </p>
      </motion.div>

      {error !== null && <ErrorState error={error} onRetry={() => setAttempt((n) => n + 1)} />}

      <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
        <div className="runway-card overflow-hidden">
          <div className="runway-sheen" />
          <div className="relative flex items-center justify-between px-5 pt-5 pb-2">
            <div className="flex items-center gap-2">
              <KeyRound size={16} className="text-runway-accent" />
              <span className="text-sm font-semibold text-runway-text">Keys</span>
            </div>
            {canManage && (
              <Button size="sm" color="primary" startContent={<Plus size={14} />} onPress={() => setCreating(true)} className="bg-accent-gradient font-medium">
                Create new key
              </Button>
            )}
          </div>
          <div className="relative px-4 pb-4">
            {keys === null && !error ? (
              <TableSkeleton rows={3} />
            ) : (
              <Table
                aria-label="API keys"
                removeWrapper
                classNames={{
                  th: 'bg-transparent text-runway-muted text-[11px] uppercase tracking-wider',
                  td: 'text-runway-text py-3',
                  tr: 'border-b border-runway-border/50 last:border-0',
                }}
              >
                <TableHeader>
                  <TableColumn>NAME</TableColumn>
                  <TableColumn>KEY</TableColumn>
                  <TableColumn>SCOPES</TableColumn>
                  <TableColumn>CREATED</TableColumn>
                  <TableColumn>LAST USED</TableColumn>
                  <TableColumn align="end">ACTIONS</TableColumn>
                </TableHeader>
                <TableBody emptyContent="No keys yet." items={keys ?? []}>
                  {(k) => (
                    <TableRow key={k.id} className={k.isRevoked ? 'opacity-50' : undefined}>
                      <TableCell className="font-medium">
                        {k.name}
                        {k.isRevoked && <span className="ml-2 text-[10px] uppercase tracking-wider text-runway-negative">revoked</span>}
                        {k.expiresAt && !k.isRevoked && (
                          <span className="block text-[11px] text-runway-muted">expires {date(k.expiresAt)}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <code className="text-xs text-runway-muted bg-white/[0.03] border border-runway-border/60 rounded-md px-2 py-1">
                          {k.prefix}…
                        </code>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {k.scopes.map((s) => (
                            <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.04] text-runway-muted">
                              {SCOPE_LABELS[s] ?? s}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-runway-muted text-xs whitespace-nowrap">{date(k.createdAt)}</TableCell>
                      <TableCell className="text-runway-muted text-xs whitespace-nowrap">{k.lastUsedAt ? date(k.lastUsedAt) : 'Never'}</TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          {/* No "regenerate": a secret cannot be re-read, so
                              regenerating would mean minting a replacement and
                              silently leaving the old key live. Revoke, then
                              create, and make the operator do both. */}
                          {!k.isRevoked && canManage && (
                            <Button size="sm" variant="light" color="danger" startContent={<Trash2 size={13} />} onPress={() => setRevoking(k)}>
                              Revoke
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      </motion.div>

      <Modal isOpen={creating} onClose={() => setCreating(false)} className="bg-runway-raised border border-runway-borderStrong rounded-2xl text-runway-text" size="lg">
        <ModalContent>
          <ModalHeader className="text-sm font-semibold">Create an API key</ModalHeader>
          <ModalBody className="text-sm text-runway-muted flex flex-col gap-4">
            <Input label="Name" labelPlacement="outside" placeholder="Nightly export to S3" value={name} onValueChange={setName} maxLength={80} />
            <div className="flex flex-col gap-2">
              <span className="text-xs text-runway-text font-medium">Scopes</span>
              {/* A key holds only what it needs. Defaulting to everything would
                  make the scope list a formality, and a formality is not a
                  control. */}
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {SCOPES.map(([scope, label]) => (
                  <Checkbox
                    key={scope}
                    size="sm"
                    isSelected={scopes.includes(scope)}
                    onValueChange={(on) => setScopes((prev) => (on ? [...prev, scope] : prev.filter((s) => s !== scope)))}
                  >
                    {label}
                  </Checkbox>
                ))}
              </div>
              <p className="text-[11px] text-runway-muted">
                A key cannot be given “Manage API keys”. It would be able to mint a replacement for itself with every scope, which turns revoking
                one into a race.
              </p>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button size="sm" variant="light" onPress={() => setCreating(false)}>
              Cancel
            </Button>
            <Button size="sm" color="primary" className="bg-accent-gradient" isDisabled={name.trim() === '' || scopes.length === 0} isLoading={submitting} onPress={() => void createKey()}>
              Create key
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={fresh !== null} onClose={() => setFresh(null)} className="bg-runway-raised border border-runway-borderStrong rounded-2xl text-runway-text" size="lg">
        <ModalContent>
          <ModalHeader className="text-sm font-semibold">Copy this key now</ModalHeader>
          <ModalBody className="text-sm text-runway-muted flex flex-col gap-3">
            <p>
              The secret for <span className="text-runway-text font-medium">{fresh?.key.name}</span> is shown here and nowhere else. It is stored
              as a hash, so it cannot be displayed again — if you lose it, revoke this key and create another.
            </p>
            <code className="text-xs text-runway-text bg-white/[0.03] border border-runway-border/60 rounded-md px-3 py-2 break-all">
              {fresh?.secret}
            </code>
          </ModalBody>
          <ModalFooter>
            <Button
              size="sm"
              color="primary"
              className="bg-accent-gradient"
              onPress={() => {
                if (fresh) void navigator.clipboard.writeText(fresh.secret).then(() => push('Key copied.', 'success'));
                setFresh(null);
              }}
            >
              Copy and close
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={revoking !== null} onClose={() => setRevoking(null)} className="bg-runway-raised border border-runway-borderStrong rounded-2xl text-runway-text" size="sm">
        <ModalContent>
          <ModalHeader className="text-sm font-semibold">Revoke this key?</ModalHeader>
          <ModalBody className="text-sm text-runway-muted">
            Anything using <span className="text-runway-text font-medium">{revoking?.name}</span> will start getting 401s. This cannot be undone, and
            the secret cannot be recovered — you would have to create a new key.
          </ModalBody>
          <ModalFooter>
            <Button size="sm" variant="light" onPress={() => setRevoking(null)}>
              Cancel
            </Button>
            <Button size="sm" color="danger" onPress={() => revoking && void revokeKey(revoking)}>
              Revoke
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </motion.div>
  );
}
