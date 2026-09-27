import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { Card, CardBody } from '@heroui/react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <Card className="rounded-2xl border border-dashed border-runway-borderStrong/60 bg-runway-surface/50 shadow-soft">
        <CardBody className="flex flex-col items-center text-center gap-3.5 py-16 px-8">
          <div className="relative">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-runway-accent/[0.16] to-runway-accent2/[0.08] border border-runway-accent/20 flex items-center justify-center shadow-glow">
              <Icon size={24} className="text-runway-accent" />
            </div>
            <div className="absolute inset-0 rounded-2xl bg-runway-accent/10 blur-xl -z-10" />
          </div>
          <p className="text-runway-text font-semibold">{title}</p>
          <p className="text-runway-muted text-sm max-w-sm leading-relaxed">{description}</p>
          {action && <div className="mt-2">{action}</div>}
        </CardBody>
      </Card>
    </motion.div>
  );
}
