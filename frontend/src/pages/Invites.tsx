import { FormEvent, useEffect, useState } from 'react';
import { Button, Chip, Input } from '@heroui/react';
import { UserPlus } from 'lucide-react';
import { api } from '../lib/api';
import { useCompany } from '../lib/CompanyContext';
import { useToast } from '../lib/ToastContext';
import { EmptyState } from '../components/EmptyState';
import { TableSkeleton } from '../components/Skeleton';

interface Invite {
  id: string;
  email: string;
  status: string;
  createdAt: string;
}

const statusColor: Record<string, 'success' | 'warning' | 'default'> = {
  ACCEPTED: 'success',
  PENDING: 'warning',
  REVOKED: 'default',
};

export function Invites() {
  const { activeCompanyId, role } = useCompany();
  const { push } = useToast();
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const canInvite = role === 'FOUNDER';

  useEffect(() => {
    if (!activeCompanyId) return;
    setInvites(null);
    api.get<Invite[]>('/companies/invites').then(setInvites);
  }, [activeCompanyId, role]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const invite = await api.post<Invite>('/companies/invites', { email });
      setInvites((prev) => [invite, ...(prev ?? [])]);
      setEmail('');
      push(`Invite sent to ${invite.email}.`, 'success');
    } catch (err) {
      push((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-xl">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-runway-text">Investor Invites</h2>
        <p className="text-sm text-runway-muted">Give investors read-only access to the dashboard and updates.</p>
      </div>

      {canInvite && (
        <div className="runway-card p-5">
          <div className="runway-sheen" />
          <div className="relative">
            <form onSubmit={handleSubmit} className="flex items-end gap-3">
              <Input
                label="Investor email"
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
              <Button type="submit" color="primary" size="sm" isLoading={submitting} className="bg-accent-gradient font-medium">
                Send invite
              </Button>
            </form>
          </div>
        </div>
      )}

      <div className="runway-card overflow-hidden">
        <div className="runway-sheen" />
        <div className="relative px-5 pt-5 pb-5">
          <h3 className="text-sm font-semibold text-runway-text mb-3">Pending &amp; sent invites</h3>
          {invites === null && <TableSkeleton rows={3} />}
          {invites !== null && invites.length === 0 && (
            <EmptyState
              icon={UserPlus}
              title="No investors invited yet"
              description="Send your first invite above — they'll get read-only access to the dashboard and cohort table."
            />
          )}
          {invites && invites.length > 0 && (
            <div className="flex flex-col divide-y divide-runway-border/50">
              {invites.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm text-runway-text font-medium">{inv.email}</p>
                    <p className="text-[11px] text-runway-muted">{new Date(inv.createdAt).toLocaleDateString()}</p>
                  </div>
                  <Chip size="sm" variant="flat" color={statusColor[inv.status] ?? 'default'}>
                    {inv.status}
                  </Chip>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
