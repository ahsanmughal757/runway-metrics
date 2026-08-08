import { motion } from 'framer-motion';
import { Button, Card, CardBody, Chip } from '@heroui/react';
import { CreditCard, Users, CheckCircle2 } from 'lucide-react';

export function Billing() {
  const renewalDate = 'Dec 1, 2026';

  return (
    <motion.div
      className="flex flex-col gap-6"
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
    >
      <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
        <h2 className="text-xl font-semibold tracking-tight text-runway-text">Billing</h2>
        <p className="text-sm text-runway-muted mt-0.5">Plan, usage, and payment details for your workspace.</p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
          <Card className="runway-card overflow-hidden" shadow="none">
            <CardBody className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-runway-muted">Workspace plan</p>
                  <p className="text-lg font-semibold text-runway-text mt-1">Growth</p>
                  <p className="text-xs text-runway-muted mt-1">Renews {renewalDate}</p>
                </div>
                <Chip size="sm" variant="flat" color="primary" startContent={<CheckCircle2 size={13} />} className="mt-1">
                  Active
                </Chip>
              </div>
              <Button
                isDisabled
                size="sm"
                variant="bordered"
                className="mt-5 w-fit border-runway-border text-runway-muted"
                title="Contact your workspace admin"
              >
                Manage billing
              </Button>
              <p className="text-[11px] text-runway-muted mt-2">
                Billing changes require a workspace admin. Reach out to them to upgrade or change plans.
              </p>
            </CardBody>
          </Card>
        </motion.div>

        <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
          <Card className="runway-card overflow-hidden" shadow="none">
            <CardBody className="p-5">
              <p className="text-[11px] uppercase tracking-wider text-runway-muted">Usage</p>
              <div className="mt-3 flex items-center gap-3">
                <span className="w-9 h-9 rounded-xl bg-runway-accent/10 border border-runway-accent/20 flex items-center justify-center">
                  <Users size={16} className="text-runway-accent" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-runway-text">3 of 5 seats used</p>
                  <p className="text-xs text-runway-muted">Two seats remaining on the Growth plan</p>
                </div>
              </div>
              <div className="mt-4 h-2 rounded-full bg-runway-border/60 overflow-hidden">
                <div className="h-full w-3/5 rounded-full bg-accent-gradient" />
              </div>
              <p className="text-[11px] text-runway-muted mt-2">
                Demo view — usage data is illustrative and not tied to a real billing system.
              </p>
            </CardBody>
          </Card>
        </motion.div>

        <motion.div
          variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
          className="lg:col-span-2 flex items-center gap-2 rounded-xl border border-runway-border/70 bg-white/[0.02] px-4 py-3"
        >
          <CreditCard size={14} className="text-runway-muted shrink-0" />
          <p className="text-xs text-runway-muted">
            No card on file in the demo. Payment processing isn't wired up — this page is a static preview.
          </p>
        </motion.div>
      </div>
    </motion.div>
  );
}
