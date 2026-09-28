import type { FormEvent } from 'react';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Chip, Input, Select, SelectItem } from '@heroui/react';
import { UserPlus } from 'lucide-react';
import { api } from '../lib/api';
import { useCompany } from '../lib/CompanyContext';
import { useToast } from '../lib/ToastContext';
import { EmptyState } from '../components/EmptyState';
import { TableSkeleton } from '../components/Skeleton';
import { ErrorState } from '../components/ErrorState';
import { companyKeys } from '../lib/queryKeys';
import { ROLE_LABELS, ROLES, type Role } from '../lib/permissions';

interface Invite {
  id: string;
  email: string;
  role: Role;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
  expiresAt: string;
  createdAt: string;
  respondedAt: string | null;
  invitedBy: string;
  isExpired: boolean;
}

const statusColor: Record<Invite['status'], 'success' | 'warning' | 'default' | 'danger'> = {
  ACCEPTED: 'success',
  PENDING: 'warning',
  REVOKED: 'default',
  EXPIRED: 'danger',
};

/**
 * Roles an owner may hand out. An owner inviting another owner is possible but
 * is almost always a mistake, so the common path is the other three.
 */
const GRANTABLE: Role[] = ROLES.filter((r) => r !== 'OWNER');

export function Invites() {
  // `role` is not read here. The old effect listed it as a dependency, so a demo
  // persona switch re-fetched the list to recompute nothing: which invites exist
  // and what they may be does not depend on who is looking.
  const { activeCompanyId, can } = useCompany();
  const { push } = useToast();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [grantRole, setGrantRole] = useState<Role>('VIEWER');
  const canInvite = can('members:invite');

  const { data: invites, isPending, isError, error, refetch } = useQuery({
    queryKey: companyKeys.invites(activeCompanyId),
    queryFn: ({ signal }) => api.get<Invite[]>('/companies/invites', signal),
    // No company, no request. See the rule in `queryKeys.ts`.
    enabled: activeCompanyId !== null,
  });

  const createInvite = useMutation({
    mutationFn: (input: { companyId: string; email: string; role: Role }) =>
      api.post<Invite>('/companies/invites', { email: input.email, role: input.role }),
    onSuccess: (invite, { companyId }) => {
      // Company from the variables, not from the render: the caller can switch
      // company while the request is in flight, and prepending this company's
      // invite to the new company's list is the cross-tenant leak the key design
      // exists to prevent. The invite itself is the server's copy, so `status`
      // and `expiresAt` are the server's values rather than a local guess.
      queryClient.setQueryData<Invite[]>(companyKeys.invites(companyId), (prev) => (prev ? [invite, ...prev] : [invite]));
      setEmail('');
      push(`Invite sent to ${invite.email} as ${ROLE_LABELS[invite.role]}.`, 'success');
    },
    onError: (e: unknown) => {
      push((e as Error).message, 'error');
    },
  });

  const revoke = useMutation({
    // `companyId` is not in the URL - the client sends it as `X-Company-Id` -
    // but it travels in the variables so `onSuccess` can address the entry the
    // revoke was made against rather than whichever is current by then.
    mutationFn: ({ id }: { companyId: string; id: string }) => api.del(`/companies/invites/${id}`),
    onSuccess: (_result, { companyId, id }) => {
      // The endpoint answers `{ revoked: true }` rather than the updated invite,
      // so the status is flipped here instead. It is the only field that moves,
      // and a background refetch reconciles anything the server did besides.
      queryClient.setQueryData<Invite[]>(companyKeys.invites(companyId), (prev) => prev?.map((i) => (i.id === id ? { ...i, status: 'REVOKED' as const } : i)));
      push('Invitation revoked.', 'success');
    },
    onError: (e: unknown) => {
      push((e as Error).message, 'error');
    },
  });

  // No company yet is a pending state, not a failure: the query is disabled
  // rather than fired, so `isPending` alone would show a skeleton that never
  // resolves. Checking the company first also narrows the id to `string`, which
  // the mutations above need to address the right cache entry.
  if (activeCompanyId === null || isPending) return <TableSkeleton rows={3} />;
  // Previously this sat above the list while the list kept its own skeleton,
  // because a rejected fetch left the invite list null - the error and the
  // loading state on screen at once, with nothing to say which was live.
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;
  // "No invitations" is a claim about the company. Rendering it because the
  // query has no answer yet would be the `null`-means-loading conflation, and
  // here it would also hide the form, which is the only thing on the page the
  // reader could act on.
  if (!invites) return <ErrorState error={new Error('The invitation list did not load.')} />;

  // An arrow rather than a declaration so the `activeCompanyId === null` guard
  // above still narrows inside it; a hoisted function body is analysed without
  // that narrowing and `activeCompanyId` comes back as `string | null`.
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    createInvite.mutate({ companyId: activeCompanyId, email, role: grantRole });
  };

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-runway-text">Team invites</h2>
        <p className="text-sm text-runway-muted">
          Give a teammate access to this workspace. A Viewer is the right choice for an investor: they can read the
          dashboard, cohorts and reports, and change nothing.
        </p>
      </div>

      {canInvite ? (
        <div className="runway-card p-5">
          <div className="runway-sheen" />
          <div className="relative">
            <form onSubmit={handleSubmit} className="flex items-end gap-3">
              <Input
                label="Email address"
                type="email"
                size="sm"
                variant="bordered"
                value={email}
                onValueChange={setEmail}
                isRequired
                className="flex-1"
                classNames={{
                  inputWrapper:
                    'bg-white/[0.02] border border-runway-border/70 data-[hover=true]:bg-white/[0.03] rounded-xl shadow-soft',
                  label: 'text-runway-muted',
                }}
              />
              <Select
                aria-label="Role"
                size="sm"
                variant="bordered"
                selectedKeys={[grantRole]}
                onSelectionChange={(keys) => {
                  const next = Array.from(keys)[0];
                  if (typeof next === 'string') setGrantRole(next as Role);
                }}
                className="w-40"
                classNames={{
                  trigger: 'bg-white/[0.02] border border-runway-border/70 rounded-xl h-9 min-h-9',
                  label: 'text-runway-muted',
                }}
              >
                {GRANTABLE.map((r) => (
                  <SelectItem key={r}>{ROLE_LABELS[r]}</SelectItem>
                ))}
              </Select>
              <Button type="submit" color="primary" size="sm" isLoading={createInvite.isPending} className="bg-accent-gradient font-medium">
                Send invite
              </Button>
            </form>
            <p className="mt-2 text-[11px] text-runway-muted">Invitations expire after 14 days.</p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-runway-muted">You can see invitations but not send them.</p>
      )}

      <div className="runway-card overflow-hidden">
        <div className="runway-sheen" />
        <div className="relative px-5 pt-5 pb-5">
          <h3 className="text-sm font-semibold text-runway-text mb-3">Invitations</h3>
          {invites.length === 0 && (
            <EmptyState
              icon={UserPlus}
              title="No invitations yet"
              description="Send your first invite above. They will be able to sign in with this email address."
            />
          )}
          {invites.length > 0 && (
            <div className="flex flex-col divide-y divide-runway-border/50">
              {invites.map((inv) => {
                const pending = inv.status === 'PENDING' && !inv.isExpired;
                return (
                  <div key={inv.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-sm text-runway-text font-medium truncate">{inv.email}</p>
                      <p className="text-[11px] text-runway-muted">
                        {ROLE_LABELS[inv.role]} &middot; invited by {inv.invitedBy} on{' '}
                        {new Date(inv.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Chip size="sm" variant="flat" color={statusColor[inv.status]}>
                        {inv.isExpired && inv.status === 'PENDING' ? 'EXPIRED' : inv.status}
                      </Chip>
                      {canInvite && pending && (
                        <Button size="sm" variant="light" color="danger" onPress={() => revoke.mutate({ companyId: activeCompanyId, id: inv.id })}>
                          Revoke
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
