import type { FormEvent } from 'react';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Input,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from '@heroui/react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { Download, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useCompany } from '../lib/CompanyContext';
import { useToast } from '../lib/ToastContext';
import type { DashboardResponse, Snapshot } from '../lib/types';
import { TableSkeleton } from '../components/Skeleton';
import { ErrorState } from '../components/ErrorState';
import { companyKeys } from '../lib/queryKeys';
import { chartColors } from '../components/charts/chartTheme';

const CSV_COLUMNS = [
  'month',
  'mrr',
  'newMrr',
  'expansionMrr',
  'contractionMrr',
  'churnedMrr',
  'newCustomers',
  'churnedCustomers',
  'totalCustomers',
  'burnRate',
  'cash',
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

/** Mini trend ending at this snapshot: last 6 months of MRR, no axes. */
function MrrSparkline({ series }: { series: Snapshot[] }) {
  const data = series.map((s) => ({ mrr: s.mrr }));
  return (
    <div className="w-20 h-6">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
          <Line type="monotone" dataKey="mrr" stroke={chartColors.accent} strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

const emptyForm = {
  month: new Date().toISOString().slice(0, 7),
  mrr: '',
  newMrr: '',
  expansionMrr: '',
  contractionMrr: '',
  churnedMrr: '',
  newCustomers: '',
  churnedCustomers: '',
  totalCustomers: '',
  burnRate: '',
  cash: '',
  notes: '',
};

type EditableField = 'mrr' | 'burnRate' | 'cash' | 'totalCustomers' | 'notes';

const editableFields: { key: EditableField; label: string; numeric: boolean }[] = [
  { key: 'mrr', label: 'MRR', numeric: true },
  { key: 'burnRate', label: 'Burn', numeric: true },
  { key: 'cash', label: 'Cash', numeric: true },
  { key: 'totalCustomers', label: 'Customers', numeric: true },
  { key: 'notes', label: 'Notes', numeric: false },
];

export function Metrics() {
  const { activeCompanyId, can } = useCompany();
  const { push } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<{ month: string; field: EditableField } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [deleting, setDeleting] = useState<Snapshot | null>(null);
  const canEdit = can('metrics:write');

  // `role` was a dependency of the old effect and is not one here. Which
  // snapshots exist and what they say is the same whoever is looking at them;
  // only what the buttons are allowed to do depends on the viewer, and that is
  // read at render above. Re-reading the series on a persona switch fetched
  // identical data and was the other half of a last-write-wins race against the
  // request already in flight.
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: companyKeys.dashboard(activeCompanyId),
    queryFn: ({ signal }) => api.get<DashboardResponse>('/metrics/dashboard', signal),
    // No company, no request. See the rule in `queryKeys.ts`.
    enabled: activeCompanyId !== null,
  });

  /**
   * What every write below does on success, and why it is not a `setQueryData`.
   * A snapshot's `derived` block is computed by the server across the whole
   * series, so changing March's MRR moves runway and NRR on every month after it.
   * Patching the one row this page changed would publish numbers the backend
   * never produced, and hold them until a later refetch happened to disagree.
   *
   * The company id is a parameter rather than read off the render, because the
   * invalidation has to address the company the write was made *against*. Reading
   * `activeCompanyId` in `onSuccess` would address whichever company is on screen
   * when the response lands, which after a company switch means refetching the
   * wrong tenant's numbers.
   */
  const invalidateDashboard = (companyId: string) => {
    void queryClient.invalidateQueries({ queryKey: companyKeys.dashboard(companyId) });
  };

  // No `signal`, unlike the query above: `useMutation` hands out no abort signal
  // and does not cancel on unmount, and it does not need to. A mutation writes to
  // the cache rather than to component state, so a response that lands after the
  // page has gone updates an entry nobody is rendering yet rather than
  // resurrecting a dead one.
  const createSnapshot = useMutation({
    mutationFn: (input: { companyId: string; form: typeof emptyForm }) =>
      api.post('/metrics/snapshot', {
        month: `${input.form.month}-01`,
        mrr: Number(input.form.mrr),
        newMrr: Number(input.form.newMrr),
        expansionMrr: Number(input.form.expansionMrr),
        contractionMrr: Number(input.form.contractionMrr),
        churnedMrr: Number(input.form.churnedMrr),
        newCustomers: Number(input.form.newCustomers),
        churnedCustomers: Number(input.form.churnedCustomers),
        totalCustomers: Number(input.form.totalCustomers),
        burnRate: Number(input.form.burnRate),
        cash: Number(input.form.cash),
        notes: input.form.notes || undefined,
      }),
    onSuccess: (_saved, { companyId }) => {
      setForm(emptyForm);
      push('Snapshot saved.', 'success');
      invalidateDashboard(companyId);
    },
    onError: (err: unknown) => {
      push((err as Error).message, 'error');
    },
  });

  const updateSnapshot = useMutation({
    mutationFn: (input: { companyId: string; snapshot: Snapshot; field: EditableField; value: string }) => {
      const s = input.snapshot;
      const numeric = editableFields.some((f) => f.key === input.field && f.numeric);
      // An emptied notes box means "no note" and has to go as undefined to clear
      // the column. Sending the empty string would leave a note behind that says
      // nothing, and the cell would read as a blank rather than reverting to the
      // placeholder.
      const value: string | number | undefined =
        input.field === 'notes' && input.value.trim() === '' ? undefined : numeric ? Number(input.value) : input.value;
      return api.post('/metrics/snapshot', {
        month: s.month.slice(0, 10),
        mrr: s.mrr,
        newMrr: s.newMrr,
        expansionMrr: s.expansionMrr,
        contractionMrr: s.contractionMrr,
        churnedMrr: s.churnedMrr,
        newCustomers: s.newCustomers,
        churnedCustomers: s.churnedCustomers,
        totalCustomers: s.totalCustomers,
        burnRate: s.burnRate,
        cash: s.cash,
        notes: s.notes,
        [input.field]: value,
      });
    },
    onSuccess: (_saved, { companyId }) => {
      push('Snapshot updated.', 'success');
      invalidateDashboard(companyId);
    },
    onError: (err: unknown) => {
      push((err as Error).message, 'error');
    },
  });

  const deleteSnapshot = useMutation({
    mutationFn: (input: { companyId: string; month: string }) => api.del(`/metrics/snapshot/${input.month}`),
    onSuccess: (_deleted, { companyId }) => {
      push('Snapshot deleted.', 'success');
      invalidateDashboard(companyId);
    },
    onError: (err: unknown) => {
      push((err as Error).message, 'error');
    },
  });

  // The company is checked before `isPending` because the query is disabled
  // rather than fired without one, and a disabled query sits at `isPending`
  // forever: treating that as "loading" would show a skeleton that never
  // resolves, and would leave `activeCompanyId` as `string | null` for the
  // handlers below, which have to name a company for the invalidation to be
  // tenant-correct.
  if (activeCompanyId === null || isPending) return <TableSkeleton rows={6} />;
  // This replaces an error card rendered *above* a table that kept its own
  // skeleton, so a failed first load used to leave the failure and the loading
  // state on screen together with nothing to say which one was live.
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data) return <ErrorState error={new Error('This company has no metrics yet.')} />;

  const snapshots = data.snapshots;

  // The three handlers are arrows rather than declarations so they close over
  // the narrowed company id; a hoisted declaration is analysed outside the
  // guards above and would have to widen it back to `string | null`.
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    createSnapshot.mutate({ companyId: activeCompanyId, form });
  };

  const saveEdit = (s: Snapshot) => {
    if (!editing) return;
    // The editor closes on submit, not on success. Leaving the input mounted
    // while the write is in flight means its own `onBlur` can fire and save the
    // same value a second time.
    const { field } = editing;
    setEditing(null);
    updateSnapshot.mutate({ companyId: activeCompanyId, snapshot: s, field, value: editValue });
  };

  const confirmDelete = () => {
    if (!deleting) return;
    const month = deleting.month.slice(0, 10);
    setDeleting(null);
    deleteSnapshot.mutate({ companyId: activeCompanyId, month });
  };

  const inputClassNames = {
    inputWrapper: 'bg-white/[0.02] border border-runway-border/70 data-[hover=true]:bg-white/[0.03] rounded-xl shadow-soft',
    label: 'text-runway-muted',
  };

  function cellValue(s: Snapshot, field: EditableField): string {
    switch (field) {
      case 'mrr':
        return `$${s.mrr.toLocaleString()}`;
      case 'burnRate':
        return `$${s.burnRate.toLocaleString()}`;
      case 'cash':
        return `$${s.cash.toLocaleString()}`;
      case 'totalCustomers':
        return String(s.totalCustomers);
      case 'notes':
        return s.notes ?? '';
    }
  }

  const headerCols: JSX.Element[] = [
    <TableColumn key="month">MONTH</TableColumn>,
    ...editableFields.map((f) => (
      <TableColumn key={f.key} align="end">
        {f.label.toUpperCase()}
      </TableColumn>
    )),
    <TableColumn key="runway" align="end">
      RUNWAY
    </TableColumn>,
    <TableColumn key="trend" align="end">
      TREND
    </TableColumn>,
  ];
  if (canEdit) {
    headerCols.push(
      <TableColumn key="actions" align="end">
        {' '}
      </TableColumn>,
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-runway-text">Metrics Entry / History</h2>
        <p className="text-sm text-runway-muted">
          {canEdit ? 'Add or edit monthly snapshots.' : 'Read-only in Investor view — editing is Founder-only, enforced server-side.'}
        </p>
      </div>

      {canEdit && (
        <div className="runway-card overflow-hidden">
          <div className="runway-sheen" />
          <div className="relative p-5">
            <form onSubmit={handleSubmit} className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Input
                type="month"
                label="Month"
                size="sm"
                variant="bordered"
                classNames={inputClassNames}
                value={form.month}
                onValueChange={(v) => setForm({ ...form, month: v })}
                isRequired
              />
              <Input
                type="number"
                label="MRR"
                size="sm"
                variant="bordered"
                classNames={inputClassNames}
                value={form.mrr}
                onValueChange={(v) => setForm({ ...form, mrr: v })}
                isRequired
              />
              <Input
                type="number"
                label="New MRR"
                size="sm"
                variant="bordered"
                classNames={inputClassNames}
                value={form.newMrr}
                onValueChange={(v) => setForm({ ...form, newMrr: v })}
                isRequired
              />
              <Input
                type="number"
                label="Expansion MRR"
                size="sm"
                variant="bordered"
                classNames={inputClassNames}
                value={form.expansionMrr}
                onValueChange={(v) => setForm({ ...form, expansionMrr: v })}
                isRequired
              />
              <Input
                type="number"
                label="Contraction MRR"
                size="sm"
                variant="bordered"
                classNames={inputClassNames}
                value={form.contractionMrr}
                onValueChange={(v) => setForm({ ...form, contractionMrr: v })}
                isRequired
              />
              <Input
                type="number"
                label="Churned MRR"
                size="sm"
                variant="bordered"
                classNames={inputClassNames}
                value={form.churnedMrr}
                onValueChange={(v) => setForm({ ...form, churnedMrr: v })}
                isRequired
              />
              <Input
                type="number"
                label="New Customers"
                size="sm"
                variant="bordered"
                classNames={inputClassNames}
                value={form.newCustomers}
                onValueChange={(v) => setForm({ ...form, newCustomers: v })}
                isRequired
              />
              <Input
                type="number"
                label="Churned Customers"
                size="sm"
                variant="bordered"
                classNames={inputClassNames}
                value={form.churnedCustomers}
                onValueChange={(v) => setForm({ ...form, churnedCustomers: v })}
                isRequired
              />
              <Input
                type="number"
                label="Total Customers"
                size="sm"
                variant="bordered"
                classNames={inputClassNames}
                value={form.totalCustomers}
                onValueChange={(v) => setForm({ ...form, totalCustomers: v })}
                isRequired
              />
              <Input
                type="number"
                label="Burn Rate"
                size="sm"
                variant="bordered"
                classNames={inputClassNames}
                value={form.burnRate}
                onValueChange={(v) => setForm({ ...form, burnRate: v })}
                isRequired
              />
              <Input
                type="number"
                label="Cash"
                size="sm"
                variant="bordered"
                classNames={inputClassNames}
                value={form.cash}
                onValueChange={(v) => setForm({ ...form, cash: v })}
                isRequired
              />
              <Input
                label="Notes"
                size="sm"
                variant="bordered"
                classNames={inputClassNames}
                value={form.notes}
                onValueChange={(v) => setForm({ ...form, notes: v })}
              />

              <div className="col-span-2 md:col-span-4 flex items-center gap-3 mt-1">
                <Button
                  type="submit"
                  color="primary"
                  size="sm"
                  isLoading={createSnapshot.isPending}
                  className="bg-accent-gradient font-medium"
                >
                  {createSnapshot.isPending ? 'Saving…' : 'Add snapshot'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="runway-card overflow-hidden">
        <div className="runway-sheen" />
        <div className="relative flex items-center justify-between px-5 pt-5 pb-2">
          <span className="text-sm font-semibold text-runway-text">History</span>
          {snapshots.length > 0 && (
            <Button
              size="sm"
              variant="flat"
              startContent={<Download size={14} />}
              onPress={() => downloadCsv(snapshots)}
              className="font-medium"
            >
              Export CSV
            </Button>
          )}
        </div>
        <div className="relative px-4 pb-4">
          <Table
            aria-label="Metric snapshot history"
            removeWrapper
            classNames={{
              th: 'bg-transparent text-runway-muted text-[11px] uppercase tracking-wider',
              td: 'text-runway-text py-3',
              tr: 'border-b border-runway-border/50 last:border-0',
            }}
          >
            <TableHeader>{headerCols}</TableHeader>
            <TableBody emptyContent="No snapshots yet." items={snapshots.slice().reverse()}>
              {(s) => {
                const idx = snapshots.findIndex((x) => x.month === s.month);
                const window = snapshots.slice(Math.max(0, idx - 5), idx + 1);
                const cells: JSX.Element[] = [
                  <TableCell key="month">{new Date(s.month).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</TableCell>,
                  ...editableFields.map((f) => (
                    <TableCell key={f.key} className="text-right">
                      {canEdit && editing && editing.month === s.month && editing.field === f.key ? (
                        <Input
                          size="sm"
                          variant="bordered"
                          autoFocus
                          value={editValue}
                          onValueChange={setEditValue}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEdit(s);
                            if (e.key === 'Escape') setEditing(null);
                          }}
                          onBlur={() => saveEdit(s)}
                          classNames={{ inputWrapper: 'bg-white/[0.03] border-runway-accent/40 rounded-lg' }}
                        />
                      ) : (
                        <Button
                          size="sm"
                          variant="light"
                          isDisabled={!canEdit}
                          onPress={() => {
                            if (!canEdit) return;
                            setEditing({ month: s.month, field: f.key });
                            setEditValue(f.key === 'notes' ? (s.notes ?? '') : String(s[f.key as 'mrr']));
                          }}
                          className="tabular-nums px-1.5 min-w-0 h-auto py-0.5 data-[hover=true]:text-runway-accent data-[hover=true]:bg-white/[0.04]"
                          title={canEdit ? 'Click to edit' : undefined}
                        >
                          {cellValue(s, f.key)}
                        </Button>
                      )}
                    </TableCell>
                  )),
                  <TableCell key="runway" className="text-right">
                    {s.derived.runwayMonths ?? '—'} mo
                  </TableCell>,
                  <TableCell key="trend">
                    <div className="flex justify-end">
                      <MrrSparkline series={window} />
                    </div>
                  </TableCell>,
                ];
                if (canEdit) {
                  cells.push(
                    <TableCell key="actions">
                      <div className="flex justify-end">
                        <Dropdown placement="bottom-end">
                          <DropdownTrigger>
                            <Button isIconOnly size="sm" variant="light" aria-label="Row actions" className="text-runway-muted">
                              <MoreVertical size={15} />
                            </Button>
                          </DropdownTrigger>
                          <DropdownMenu
                            aria-label="Row actions"
                            className="bg-runway-raised border border-runway-borderStrong rounded-xl text-runway-text"
                            itemClasses={{ base: 'data-[hover=true]:bg-white/[0.04] rounded-lg' }}
                          >
                            <DropdownItem
                              key="edit"
                              startContent={<Pencil size={14} />}
                              onPress={() => {
                                setEditing({ month: s.month, field: 'mrr' });
                                setEditValue(String(s.mrr));
                              }}
                            >
                              Edit
                            </DropdownItem>
                            <DropdownItem
                              key="delete"
                              startContent={<Trash2 size={14} />}
                              className="text-runway-negative"
                              onPress={() => setDeleting(s)}
                            >
                              Delete
                            </DropdownItem>
                          </DropdownMenu>
                        </Dropdown>
                      </div>
                    </TableCell>,
                  );
                }
                return <TableRow key={s.month}>{cells}</TableRow>;
              }}
            </TableBody>
          </Table>
        </div>
      </div>

      <Modal
        isOpen={deleting !== null}
        onClose={() => setDeleting(null)}
        className="bg-runway-raised border border-runway-borderStrong rounded-2xl text-runway-text"
        size="sm"
      >
        <ModalContent>
          <ModalHeader className="text-sm font-semibold">Delete snapshot?</ModalHeader>
          <ModalBody className="text-sm text-runway-muted">
            This removes the snapshot for{' '}
            <span className="text-runway-text font-medium">
              {deleting ? new Date(deleting.month).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : ''}
            </span>
            . This can't be undone.
          </ModalBody>
          <ModalFooter>
            <Button size="sm" variant="light" onPress={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button size="sm" color="danger" onPress={confirmDelete}>
              Delete
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
