import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Chip, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell } from '@heroui/react';
import { Users } from 'lucide-react';
import { api } from '../lib/api';
import { useCompany } from '../lib/CompanyContext';
import { TableSkeleton } from '../components/Skeleton';

interface Member {
  id: string;
  name: string;
  email: string;
  role: 'FOUNDER' | 'INVESTOR';
  joinedAt: string;
}

export function Team() {
  const { activeCompanyId, role } = useCompany();
  const [members, setMembers] = useState<Member[] | null>(null);

  useEffect(() => {
    if (!activeCompanyId) return;
    setMembers(null);
    api.get<Member[]>('/companies/members').then(setMembers);
  }, [activeCompanyId, role]);

  return (
    <motion.div
      className="flex flex-col gap-6"
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
    >
      <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
        <h2 className="text-xl font-semibold tracking-tight text-runway-text">Team</h2>
        <p className="text-sm text-runway-muted mt-0.5">
          Founders and investors with access to this workspace.
        </p>
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
                  <TableColumn>NAME</TableColumn>
                  <TableColumn>EMAIL</TableColumn>
                  <TableColumn>ROLE</TableColumn>
                  <TableColumn>JOINED</TableColumn>
                </TableHeader>
                <TableBody emptyContent="No members yet." items={members}>
                  {(m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell className="text-runway-muted">{m.email}</TableCell>
                      <TableCell>
                        <Chip size="sm" variant="flat" color={m.role === 'FOUNDER' ? 'primary' : 'default'}>
                          {m.role === 'FOUNDER' ? 'Founder' : 'Investor'}
                        </Chip>
                      </TableCell>
                      <TableCell className="text-runway-muted text-xs">
                        {new Date(m.joinedAt).toLocaleDateString('en-US', { dateStyle: 'medium' })}
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
