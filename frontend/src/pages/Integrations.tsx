import { motion } from 'framer-motion';
import { Button, Card, CardBody, CardHeader, Chip } from '@heroui/react';
import { CreditCard, Landmark, Layers, Wallet, Building2, Plug } from 'lucide-react';

const integrations = [
  { key: 'stripe', name: 'Stripe', description: 'Import subscriptions, MRR, and churn from Stripe billing.', icon: CreditCard },
  { key: 'quickbooks', name: 'QuickBooks', description: 'Sync expenses and burn from QuickBooks Online.', icon: Wallet },
  { key: 'mercury', name: 'Mercury', description: 'Track cash balances and runway from Mercury accounts.', icon: Landmark },
  { key: 'plaid', name: 'Plaid', description: 'Connect bank accounts for real-time cash position.', icon: Layers },
  { key: 'xero', name: 'Xero', description: 'Keep financials in sync with Xero accounting.', icon: Building2 },
];

export function Integrations() {
  return (
    <motion.div
      className="flex flex-col gap-6"
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
    >
      <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
        <h2 className="text-xl font-semibold tracking-tight text-runway-text">Integrations</h2>
        <p className="text-sm text-runway-muted mt-0.5">Connect your tools to keep Runway up to date automatically.</p>
      </motion.div>

      <motion.div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
      >
        {integrations.map((it) => (
          <Card key={it.key} className="runway-card overflow-hidden" shadow="none">
            <CardHeader className="flex items-center gap-3 px-5 pt-5">
              <span className="w-10 h-10 rounded-xl bg-white/[0.04] border border-runway-border/60 flex items-center justify-center">
                <it.icon size={18} className="text-runway-accent" />
              </span>
              <div>
                <p className="text-sm font-semibold text-runway-text">{it.name}</p>
                <Chip size="sm" variant="flat" color="default" className="mt-0.5">
                  Coming soon
                </Chip>
              </div>
            </CardHeader>
            <CardBody className="px-5 pb-5">
              <p className="text-xs text-runway-muted leading-relaxed">{it.description}</p>
              <Button isDisabled size="sm" variant="bordered" className="mt-4 w-fit border-runway-border text-runway-muted">
                Connect
              </Button>
            </CardBody>
          </Card>
        ))}

        <Card className="runway-card overflow-hidden border-dashed" shadow="none">
          <CardBody className="flex flex-col items-center justify-center gap-2 px-5 py-8 text-center">
            <Plug size={20} className="text-runway-muted" />
            <p className="text-xs text-runway-muted">More integrations are in the pipeline.</p>
          </CardBody>
        </Card>
      </motion.div>
    </motion.div>
  );
}
