import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Button, Chip, Select, SelectItem, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell } from '@heroui/react';
import { Users } from 'lucide-react';
import { api } from '../lib/api';
import { useCompany } from '../lib/CompanyContext';
import { useToast } from '../lib/ToastContext';
import { TableSkeleton } from '../components/Skeleton';
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
  const [members, setMembers] = useState<Member[] | null>(null);
  const canManage = can('members:updateRole');

  useEffect(() => {
    if (!activeCompanyId) return;
    setMembers(null);
    api.get<Member[]>('/companies/members').then(setMembers);
  }, [activeCompanyId, role]);

  async function changeRole(member: Member, next: Role) {
    try {
      const updated = await api.patch<Member>(`/companies/members/${member.id}/role`, { role: next });
      setMembers((prev) => (prev ?? []).map((m) => (m.id === member.id ? updated : m)));
      push(`${member.name} is now ${ROLE_LABELS[next]}.`, 'success');
    } catch (err) {
      push((err as Error).message, 'error');
    }
  }

  async function removeMember(member: Member) {
    try {
      await api.del(`/companies/members/${member.id}`);
      setMembers((prev) => (prev ?? []).filter((m) => m.id !== member.id));
      push(`${member.name} was removed.`, 'success');
    } catch (err) {
      push((err as Error).message, 'error');
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
            {members === null && <TableSkeleton rows={4} />}
            {members !== null && (
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
                                if (typeof next === 'string' && next !== m.role) void changeRole(m, next as Role);
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
                            <Button size="sm" variant="light" color="danger" onPress={() => removeMember(m)}>
                              Remove
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  }}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
