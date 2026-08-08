import { FormEvent, useEffect, useState } from 'react';
import {
  Button, Card, CardBody, CardHeader, Input,
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
} from '@heroui/react';
import { Download } from 'lucide-react';
import { api } from '../lib/api';
import { useCompany } from '../lib/CompanyContext';
import { useToast } from '../lib/ToastContext';
import { DashboardResponse, Snapshot } from '../lib/types';
import { TableSkeleton } from '../components/Skeleton';

const CSV_COLUMNS = [
  'month', 'mrr', 'newMrr', 'expansionMrr', 'contractionMrr', 'churnedMrr',
  'newCustomers', 'churnedCustomers', 'totalCustomers', 'burnRate', 'cash',
] as const;

function toCsv(snapshots: Snapshot[]): string {
  const header = CSV_COLUMNS.join(',');
  const rows = snapshots.map((s) => CSV_COLUMNS.map((c) => (c === 'month' ? s.month.slice(0, 10) : s[c])).join(','));
  return [header, ...rows].join('\n');
}

function downloadCsv(snapshots: Snapshot[]) {
  const blob = new Blob([toCsv(snapshots)], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'runway-metrics.csv';
  a.click();
  URL.revokeObjectURL(url);
}

const emptyForm = {
  month: new Date().toISOString().slice(0, 7),
  mrr: '', newMrr: '', expansionMrr: '', contractionMrr: '', churnedMrr: '',
  newCustomers: '', churnedCustomers: '', totalCustomers: '', burnRate: '', cash: '', notes: '',
};

export function Metrics() {
  const { activeCompanyId, role } = useCompany();
  const { push } = useToast();
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const canEdit = role === 'FOUNDER';

  useEffect(() => {
    if (!activeCompanyId) return;
    setSnapshots(null);
    api.get<DashboardResponse>('/metrics/dashboard').then((d) => setSnapshots(d.snapshots));
  }, [activeCompanyId, role]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/metrics/snapshot', {
        month: `${form.month}-01`,
        mrr: Number(form.mrr), newMrr: Number(form.newMrr), expansionMrr: Number(form.expansionMrr),
        contractionMrr: Number(form.contractionMrr), churnedMrr: Number(form.churnedMrr),
        newCustomers: Number(form.newCustomers), churnedCustomers: Number(form.churnedCustomers),
        totalCustomers: Number(form.totalCustomers), burnRate: Number(form.burnRate), cash: Number(form.cash),
        notes: form.notes || undefined,
      });
      push('Snapshot saved.', 'success');
      setForm(emptyForm);
      const d = await api.get<DashboardResponse>('/metrics/dashboard');
      setSnapshots(d.snapshots);
    } catch (err) {
      push((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  const inputClassNames = {
    inputWrapper: 'bg-runway-charcoal border border-runway-border data-[hover=true]:bg-runway-charcoal',
    label: 'text-runway-muted',
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-medium text-runway-text">Metrics Entry / History</h2>
        <p className="text-sm text-runway-muted">
          {canEdit ? 'Add or edit monthly snapshots.' : 'Read-only in Investor view — editing is Founder-only, enforced server-side.'}
        </p>
      </div>

      {canEdit && (
        <Card className="bg-runway-surface border border-runway-border">
          <CardBody>
            <form onSubmit={handleSubmit} className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Input type="month" label="Month" size="sm" variant="bordered" classNames={inputClassNames}
                value={form.month} onValueChange={(v) => setForm({ ...form, month: v })} isRequired />
              <Input type="number" label="MRR" size="sm" variant="bordered" classNames={inputClassNames}
                value={form.mrr} onValueChange={(v) => setForm({ ...form, mrr: v })} isRequired />
              <Input type="number" label="New MRR" size="sm" variant="bordered" classNames={inputClassNames}
                value={form.newMrr} onValueChange={(v) => setForm({ ...form, newMrr: v })} isRequired />
              <Input type="number" label="Expansion MRR" size="sm" variant="bordered" classNames={inputClassNames}
                value={form.expansionMrr} onValueChange={(v) => setForm({ ...form, expansionMrr: v })} isRequired />
              <Input type="number" label="Contraction MRR" size="sm" variant="bordered" classNames={inputClassNames}
                value={form.contractionMrr} onValueChange={(v) => setForm({ ...form, contractionMrr: v })} isRequired />
              <Input type="number" label="Churned MRR" size="sm" variant="bordered" classNames={inputClassNames}
                value={form.churnedMrr} onValueChange={(v) => setForm({ ...form, churnedMrr: v })} isRequired />
              <Input type="number" label="New Customers" size="sm" variant="bordered" classNames={inputClassNames}
                value={form.newCustomers} onValueChange={(v) => setForm({ ...form, newCustomers: v })} isRequired />
              <Input type="number" label="Churned Customers" size="sm" variant="bordered" classNames={inputClassNames}
                value={form.churnedCustomers} onValueChange={(v) => setForm({ ...form, churnedCustomers: v })} isRequired />
              <Input type="number" label="Total Customers" size="sm" variant="bordered" classNames={inputClassNames}
                value={form.totalCustomers} onValueChange={(v) => setForm({ ...form, totalCustomers: v })} isRequired />
              <Input type="number" label="Burn Rate" size="sm" variant="bordered" classNames={inputClassNames}
                value={form.burnRate} onValueChange={(v) => setForm({ ...form, burnRate: v })} isRequired />
              <Input type="number" label="Cash" size="sm" variant="bordered" classNames={inputClassNames}
                value={form.cash} onValueChange={(v) => setForm({ ...form, cash: v })} isRequired />

              <div className="col-span-2 md:col-span-4 flex items-center gap-3 mt-1">
                <Button type="submit" color="primary" size="sm" isLoading={submitting}>
                  {submitting ? 'Saving…' : 'Add snapshot'}
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      <Card className="bg-runway-surface border border-runway-border">
        <CardHeader className="flex items-center justify-between">
          <span className="text-sm font-medium text-runway-text">History</span>
          {snapshots && snapshots.length > 0 && (
            <Button
              size="sm"
              variant="flat"
              startContent={<Download size={14} />}
              onPress={() => downloadCsv(snapshots)}
            >
              Export CSV
            </Button>
          )}
        </CardHeader>
        <CardBody>
          {snapshots === null && <TableSkeleton rows={6} />}
          {snapshots !== null && (
          <Table
            aria-label="Metric snapshot history"
            removeWrapper
            classNames={{
              th: 'bg-runway-charcoal text-runway-muted',
              td: 'text-runway-text',
            }}
          >
            <TableHeader>
              <TableColumn>MONTH</TableColumn>
              <TableColumn align="end">MRR</TableColumn>
              <TableColumn align="end">BURN</TableColumn>
              <TableColumn align="end">CASH</TableColumn>
              <TableColumn align="end">CUSTOMERS</TableColumn>
              <TableColumn align="end">RUNWAY</TableColumn>
            </TableHeader>
            <TableBody emptyContent="No snapshots yet." items={snapshots.slice().reverse()}>
              {(s) => (
                <TableRow key={s.month}>
                  <TableCell>{new Date(s.month).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</TableCell>
                  <TableCell className="text-right">${s.mrr.toLocaleString()}</TableCell>
                  <TableCell className="text-right">${s.burnRate.toLocaleString()}</TableCell>
                  <TableCell className="text-right">${s.cash.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{s.totalCustomers}</TableCell>
                  <TableCell className="text-right">{s.derived.runwayMonths ?? '—'} mo</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
