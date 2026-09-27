import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Button,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
} from '@heroui/react';
import { KeyRound, RefreshCw, Plus } from 'lucide-react';
import { useToast } from '../lib/ToastContext';

interface ApiKeyRow {
  id: string;
  name: string;
  masked: string;
  createdAt: string;
}

const seedKeys: ApiKeyRow[] = [
  { id: 'k1', name: 'Data export', masked: 'rw_live_••••••••4f2a', createdAt: 'Jan 12, 2026' },
];

function makeMasked() {
  const hex = Array.from({ length: 8 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
  return `rw_live_••••••••${hex.slice(0, 4)}`;
}

export function ApiKeys() {
  const { push } = useToast();
  const [keys, setKeys] = useState<ApiKeyRow[]>(seedKeys);
  const [confirming, setConfirming] = useState<ApiKeyRow | null>(null);

  function createKey() {
    const row: ApiKeyRow = {
      id: `k${Date.now()}`,
      name: `API key ${keys.length + 1}`,
      masked: makeMasked(),
      createdAt: new Date().toLocaleDateString('en-US', { dateStyle: 'medium' }),
    };
    setKeys((prev) => [row, ...prev]);
    push('API key created (demo).', 'success');
  }

  function regenerate(row: ApiKeyRow) {
    setKeys((prev) => prev.map((k) => (k.id === row.id ? { ...k, masked: makeMasked() } : k)));
    setConfirming(null);
    push('Key regenerated.', 'success');
  }

  return (
    <motion.div
      className="flex flex-col gap-6"
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
    >
      <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
        <h2 className="text-xl font-semibold tracking-tight text-runway-text">API Keys</h2>
        <p className="text-sm text-runway-muted mt-0.5">
          Keys for the Runway API. Demo only — keys are not persisted or functional.
        </p>
      </motion.div>

      <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
        <div className="runway-card overflow-hidden">
          <div className="runway-sheen" />
          <div className="relative flex items-center justify-between px-5 pt-5 pb-2">
            <div className="flex items-center gap-2">
              <KeyRound size={16} className="text-runway-accent" />
              <span className="text-sm font-semibold text-runway-text">Keys</span>
            </div>
            <Button size="sm" color="primary" startContent={<Plus size={14} />} onPress={createKey} className="bg-accent-gradient font-medium">
              Create new key
            </Button>
          </div>
          <div className="relative px-4 pb-4">
            <Table
              aria-label="API keys"
              removeWrapper
              classNames={{
                th: 'bg-transparent text-runway-muted text-[11px] uppercase tracking-wider',
                td: 'text-runway-text py-3',
                tr: 'border-b border-runway-border/50 last:border-0',
              }}
            >
              <TableHeader>
                <TableColumn>NAME</TableColumn>
                <TableColumn>KEY</TableColumn>
                <TableColumn>CREATED</TableColumn>
                <TableColumn align="end">ACTIONS</TableColumn>
              </TableHeader>
              <TableBody emptyContent="No keys yet." items={keys}>
                {(k) => (
                  <TableRow key={k.id}>
                    <TableCell className="font-medium">{k.name}</TableCell>
                    <TableCell>
                      <code className="text-xs text-runway-muted bg-white/[0.03] border border-runway-border/60 rounded-md px-2 py-1">{k.masked}</code>
                    </TableCell>
                    <TableCell className="text-runway-muted text-xs">{k.createdAt}</TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <Button size="sm" variant="light" startContent={<RefreshCw size={13} />} onPress={() => setConfirming(k)}>
                          Regenerate
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </motion.div>

      <Modal isOpen={confirming !== null} onClose={() => setConfirming(null)} className="bg-runway-raised border border-runway-borderStrong rounded-2xl text-runway-text" size="sm">
        <ModalContent>
          <ModalHeader className="text-sm font-semibold">Regenerate key?</ModalHeader>
          <ModalBody className="text-sm text-runway-muted">
            The old key for <span className="text-runway-text font-medium">{confirming?.name}</span> will stop working.
          </ModalBody>
          <ModalFooter>
            <Button size="sm" variant="light" onPress={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button size="sm" color="danger" onPress={() => confirming && regenerate(confirming)}>
              Regenerate
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </motion.div>
  );
}
