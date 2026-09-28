import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Button,
  Checkbox,
  Input,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
} from '@heroui/react';
import { KeyRound, Lock, Plus, Trash2 } from 'lucide-react';
import { useToast } from '../lib/ToastContext';
import { api, ApiError } from '../lib/api';
import { useCompany } from '../lib/CompanyContext';
import { companyKeys } from '../lib/queryKeys';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
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
  const queryClient = useQueryClient();
  const canManage = can('apiKeys:manage');

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>([]);
  const [revoking, setRevoking] = useState<ApiKeySummary | null>(null);
  /** The one and only time the secret exists in the browser. */
  const [fresh, setFresh] = useState<CreatedKey | null>(null);

  const { data: keys, isPending, isError, error, refetch } = useQuery({
    queryKey: companyKeys.apiKeys(activeCompanyId),
    queryFn: ({ signal }) => api.get<ApiKeySummary[]>('/companies/api-keys', signal),
    // The list is `apiKeys:manage` on the server, so a role without it could
    // only ever earn a 403. The permission is that viewer's answer, not a load
    // that failed, and not firing keeps the two apart.
    enabled: activeCompanyId !== null && canManage,
  });

  // No `signal` on either mutation: `useMutation` hands out no abort signal and
  // does not cancel on unmount, and it does not need to. A mutation writes to the
  // cache rather than to component state, so a response that lands after the
  // page has gone updates an entry nobody is rendering yet rather than
  // resurrecting a dead one.
  const createKey = useMutation({
    mutationFn: (input: { companyId: string; name: string; scopes: string[] }) =>
      api.post<CreatedKey>('/companies/api-keys', { name: input.name, scopes: input.scopes }),
    onSuccess: (created, { companyId }) => {
      // Only the summary goes into the cache. The secret stays in the `fresh`
      // state above, because a cache entry outlives the component that wrote it
      // and is the one place a live credential could be read back out of by
      // something other than the modal deliberately showing it once.
      queryClient.setQueryData<ApiKeySummary[]>(companyKeys.apiKeys(companyId), (prev) =>
        prev ? [created.key, ...prev] : [created.key],
      );
      setCreating(false);
      setName('');
      setScopes([]);
      setFresh(created);
    },
    onError: (e: unknown) => {
      push(e instanceof ApiError ? e.message : 'The key could not be created.', 'error');
    },
  });

  const revokeKey = useMutation({
    // The company travels in the variables although it is not in the URL: the
    // cache entry it invalidates is tenant-scoped, and a company switch between
    // the click and the response must not re-read the wrong company's keys.
    mutationFn: (input: { companyId: string; row: ApiKeySummary }) => api.del(`/companies/api-keys/${input.row.id}`),
    onSuccess: (_result, { companyId, row }) => {
      // The endpoint answers `{ revoked: true }` and not the updated row, so
      // there is no server state to write. The old code stamped `revokedAt` from
      // the browser clock, which is a fact about the browser and not about the
      // key: an operator reading it would be told when *this machine* decided,
      // which can be hours away from when the credential actually died.
      void queryClient.invalidateQueries({ queryKey: companyKeys.apiKeys(companyId) });
      setRevoking(null);
      push(`${row.name} revoked.`, 'success');
    },
    onError: (e: unknown) => {
      // Not swallowed into the table: a revocation that silently fails leaves
      // the operator believing a leaked key is dead. The dialog stays open for
      // the same reason - the row it is about is still live.
      push(e instanceof ApiError ? e.message : 'The key could not be revoked.', 'error');
    },
  });

  // A disabled query is pending for as long as the page is open, so `isPending`
  // is only a real load once both gates above are open. The company and the
  // permission are checked first for that reason, and the company first again
  // because it is what narrows the id to a `string` the two mutations above can
  // be told about.
  if (activeCompanyId === null) return <TableSkeleton rows={3} />;
  // The old effect wrote an empty list for a role without the permission, which
  // rendered "No keys yet." - a viewer with keys was told they had none. A
  // permission is not a load that came back empty, and the page has to say which
  // of the two it is.
  if (!canManage) {
    return (
      <EmptyState
        icon={Lock}
        title="You cannot manage API keys"
        description="Issuing and revoking keys needs the Manage API keys permission, which is not part of any role below Founder. Ask one to create the key for you."
      />
    );
  }
  if (isPending) return <TableSkeleton rows={3} />;
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!keys) return <ErrorState error={new Error('The API keys did not load.')} />;

  const submitCreate = () => {
    createKey.mutate({ companyId: activeCompanyId, name, scopes });
  };

  const confirmRevoke = () => {
    if (!revoking) return;
    revokeKey.mutate({ companyId: activeCompanyId, row: revoking });
  };

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
              <TableBody emptyContent="No keys yet." items={keys}>
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
            <Button size="sm" color="primary" className="bg-accent-gradient" isDisabled={name.trim() === '' || scopes.length === 0} isLoading={createKey.isPending} onPress={submitCreate}>
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
            <Button size="sm" color="danger" onPress={confirmRevoke}>
              Revoke
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </motion.div>
  );
}
