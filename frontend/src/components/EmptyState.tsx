import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';
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
      <Card className="bg-runway-surface border border-runway-border">
        <CardBody className="flex flex-col items-center text-center gap-3 py-14 px-8">
          <div className="w-12 h-12 rounded-full bg-runway-accent/10 flex items-center justify-center">
            <Icon size={22} className="text-runway-accent" />
          </div>
          <p className="text-runway-text font-medium">{title}</p>
          <p className="text-runway-muted text-sm max-w-sm">{description}</p>
          {action && <div className="mt-2">{action}</div>}
        </CardBody>
      </Card>
    </motion.div>
  );
}
