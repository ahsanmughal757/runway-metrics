import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { Button, Chip, Input, Select, SelectItem } from '@heroui/react';
import { UserPlus } from 'lucide-react';
import { api } from '../lib/api';
import { useCompany } from '../lib/CompanyContext';
import { useToast } from '../lib/ToastContext';
import { EmptyState } from '../components/EmptyState';
import { TableSkeleton } from '../components/Skeleton';
import { ErrorState } from '../components/ErrorState';
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
  const { activeCompanyId, role, can } = useCompany();
  const { push } = useToast();
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [email, setEmail] = useState('');
  const [grantRole, setGrantRole] = useState<Role>('VIEWER');
  const [submitting, setSubmitting] = useState(false);
  const canInvite = can('members:invite');

  useEffect(() => {
    if (!activeCompanyId) return;
    let cancelled = false;
    setInvites(null);
    setError(null);
    api
      .get<Invite[]>('/companies/invites')
      .then((rows) => {
        if (!cancelled) setInvites(rows);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e);
      });
    return () => {
      cancelled = true;
    };
  }, [activeCompanyId, role, attempt]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const invite = await api.post<Invite>('/companies/invites', { email, role: grantRole });
      setInvites((prev) => [invite, ...(prev ?? [])]);
      setEmail('');
      push(`Invite sent to ${invite.email} as ${ROLE_LABELS[invite.role]}.`, 'success');
    } catch (err) {
      push((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(id: string) {
    try {
      await api.del(`/companies/invites/${id}`);
      setInvites((prev) => (prev ?? []).map((i) => (i.id === id ? { ...i, status: 'REVOKED' as const } : i)));
      push('Invitation revoked.', 'success');
    } catch (err) {
      push((err as Error).message, 'error');
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-runway-text">Team invites</h2>
        <p className="text-sm text-runway-muted">
          Give a teammate access to this workspace. A Viewer is the right choice for an investor: they can read the
          dashboard, cohorts and reports, and change nothing.
        </p>
      </div>

      {error !== null && <ErrorState error={error} onRetry={() => setAttempt((n) => n + 1)} />}

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
              <Button type="submit" color="primary" size="sm" isLoading={submitting} className="bg-accent-gradient font-medium">
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
          {invites === null && <TableSkeleton rows={3} />}
          {invites !== null && invites.length === 0 && (
            <EmptyState
              icon={UserPlus}
              title="No invitations yet"
              description="Send your first invite above. They will be able to sign in with this email address."
            />
          )}
          {invites && invites.length > 0 && (
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
                        <Button size="sm" variant="light" color="danger" onPress={() => handleRevoke(inv.id)}>
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
