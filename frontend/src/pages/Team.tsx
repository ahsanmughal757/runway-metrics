import { motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Chip, Select, SelectItem, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell } from '@heroui/react';
import { Users } from 'lucide-react';
import { api } from '../lib/api';
import { useCompany } from '../lib/CompanyContext';
import { useToast } from '../lib/ToastContext';
import { TableSkeleton } from '../components/Skeleton';
import { ErrorState } from '../components/ErrorState';
import { companyKeys } from '../lib/queryKeys';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES, type Role } from '../lib/permissions';

interface Member {
  id: string;
  name: string;
  email: string;
  role: Role;
  joinedAt: string;
  isSelf: boolean;
}

const rank: Record<Role, number> = { VIEWER: 0, ANALYST: 1, ADMIN: 2, OWNER: 3 };

/** Always five columns: HeroUI derives the row shape from the header, and a
 *  conditionally omitted column leaves the last cell unlabelled. */
const COLUMNS = ['NAME', 'EMAIL', 'ROLE', 'JOINED', 'MANAGE'];

export function Team() {
  const { activeCompanyId, role, can } = useCompany();
  const { push } = useToast();
  const queryClient = useQueryClient();
  const canManage = can('members:updateRole');

  const {
    data: members,
    isPending,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: companyKeys.members(activeCompanyId),
    queryFn: ({ signal }) => api.get<Member[]>('/companies/members', signal),
    // No company, no request. See the rule in `queryKeys.ts`.
    enabled: activeCompanyId !== null,
  });

  const changeRole = useMutation({
    mutationFn: ({ member, next }: { companyId: string; member: Member; next: Role }) =>
      api.patch<Member>(`/companies/members/${member.id}/role`, { role: next }),
    onSuccess: (updated, { companyId, member, next }) => {
      // The company is read out of the variables, not out of the render that
      // happened to be on screen when the button was pressed. The caller can
      // switch company while this request is in flight, and writing the old
      // company's members under the new company's key is the cross-tenant leak
      // the key design exists to prevent.
      //
      // The server's copy of the member rather than a local guess at the new
      // role: it is the only thing that knows what it actually stored.
      queryClient.setQueryData<Member[]>(companyKeys.members(companyId), (prev) => prev?.map((m) => (m.id === member.id ? updated : m)));
      push(`${member.name} is now ${ROLE_LABELS[next]}.`, 'success');
    },
    onError: (e: unknown) => {
      push((e as Error).message, 'error');
    },
  });

  const removeMember = useMutation({
    // No `signal`, unlike the query above: `useMutation` hands out no abort
    // signal and does not cancel on unmount, and it does not need to. A mutation
    // writes to the cache rather than to component state, so a response that
    // lands after the page has gone updates an entry nobody is rendering yet
    // rather than resurrecting a dead one.
    mutationFn: ({ member }: { companyId: string; member: Member }) => api.del<void>(`/companies/members/${member.id}`),
    onSuccess: (_result, { companyId, member }) => {
      // The delete answers 204, so there is no list to hand back and the cache is
      // edited in place. Invalidating instead would spend a round trip to learn
      // something already known: the row is gone, or the request would have
      // thrown and the toast below would be the error one.
      queryClient.setQueryData<Member[]>(companyKeys.members(companyId), (prev) => prev?.filter((m) => m.id !== member.id));
      push(`${member.name} was removed.`, 'success');
    },
    onError: (e: unknown) => {
      push((e as Error).message, 'error');
    },
  });

  // No company yet is a pending state, not a failure: the query is disabled
  // rather than fired, so `isPending` alone would show a skeleton that never
  // resolves. Checking the company first also narrows the id to `string`, which
  // the mutations below need to address the right cache entry.
  if (activeCompanyId === null || isPending) return <TableSkeleton rows={4} />;
  // This used to be a card rendered *above* the table while the table kept its
  // own skeleton, because a rejected fetch left the member list null. The error
  // and the loading state were on screen together with nothing to say which was
  // live; returning here is what makes them exclusive.
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;
  // An empty list is a claim about the company. Rendering one because the query
  // has not produced an answer says "you have no teammates" when it means "I do
  // not know yet", which is the `null`-means-loading conflation this page had.
  if (!members) return <ErrorState error={new Error('The member list did not load.')} />;

  return (
    <motion.div
      className="flex flex-col gap-6"
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
    >
      <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
        <h2 className="text-xl font-semibold tracking-tight text-runway-text">Team</h2>
        <p className="text-sm text-runway-muted mt-0.5">Everyone with access to this workspace, and what they can do.</p>
      </motion.div>

      <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
        <div className="runway-card overflow-hidden">
          <div className="runway-sheen" />
          <div className="relative flex items-center gap-2 px-5 pt-5 pb-2">
            <Users size={16} className="text-runway-accent" />
            <span className="text-sm font-semibold text-runway-text">Members</span>
          </div>
          <div className="relative px-4 pb-4">
            <Table
              aria-label="Team members"
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
              <TableBody emptyContent="No members yet." items={members}>
                {(m) => {
                  // A member can only be given a role at or below their own.
                  // Without this, an admin could promote a colleague above
                  // themselves and take privileges the admin does not have.
                  //
                  // Read at render rather than being a reason to refetch: the
                  // caller's role decides what they may *hand out*, not who is
                  // *listed*, and the old effect re-fetched the list on every
                  // persona switch in demo mode to recompute this - which is also
                  // where the last-write-wins race came from.
                  const assignable = ROLES.filter((r) => rank[r] <= rank[role]);
                  const manageable = canManage && !m.isSelf;
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">
                        {m.name}
                        {m.isSelf && <span className="ml-1.5 text-[11px] text-runway-muted">(you)</span>}
                      </TableCell>
                      <TableCell className="text-runway-muted">{m.email}</TableCell>
                      <TableCell>
                        {manageable ? (
                          <Select
                            aria-label={`Role for ${m.name}`}
                            size="sm"
                            variant="bordered"
                            selectedKeys={[m.role]}
                            onSelectionChange={(keys) => {
                              const next = Array.from(keys)[0];
                              if (typeof next === 'string' && next !== m.role)
                                changeRole.mutate({ companyId: activeCompanyId, member: m, next: next as Role });
                            }}
                            className="w-40"
                            classNames={{ trigger: 'bg-white/[0.02] border border-runway-border/70 rounded-lg h-8 min-h-8' }}
                          >
                            {assignable.map((r) => (
                              <SelectItem key={r} description={ROLE_DESCRIPTIONS[r]}>
                                {ROLE_LABELS[r]}
                              </SelectItem>
                            ))}
                          </Select>
                        ) : (
                          <Chip size="sm" variant="flat" color={m.role === 'OWNER' ? 'primary' : 'default'}>
                            {ROLE_LABELS[m.role]}
                          </Chip>
                        )}
                      </TableCell>
                      <TableCell className="text-runway-muted text-xs">
                        {new Date(m.joinedAt).toLocaleDateString('en-US', { dateStyle: 'medium' })}
                      </TableCell>
                      {/* Rendered unconditionally so the row always has the
                          same cell count as the header. */}
                      <TableCell>
                        {manageable && (
                          <Button
                            size="sm"
                            variant="light"
                            color="danger"
                            onPress={() => removeMember.mutate({ companyId: activeCompanyId, member: m })}
                          >
                            Remove
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                }}
              </TableBody>
            </Table>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
