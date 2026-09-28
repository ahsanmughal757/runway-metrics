import type { ChangeEvent} from 'react';
import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Button } from '@heroui/react';
import { UploadCloud, FileCheck2 } from 'lucide-react';
import { api } from '../lib/api';
import { useCompany } from '../lib/CompanyContext';
import { companyKeys } from '../lib/queryKeys';
import { useToast } from '../lib/ToastContext';

interface PreviewResponse {
  rows: unknown[];
  errors: string[];
  rowCount: number;
}

export function Import() {
  const { push } = useToast();
  const { activeCompanyId } = useCompany();
  const queryClient = useQueryClient();
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // A preview is the answer to one file rather than a resource with an identity:
  // there is no URL to name it by and no key that would mean anything to another
  // page, and it is worthless the moment the operator picks a different file. A
  // mutation holds it exactly as long as this page does and hands back whichever
  // call was last, which is the lifetime a preview actually has.
  //
  // No `signal` on either mutation: `useMutation` hands out no abort signal and
  // does not cancel on unmount, and it does not need to. A mutation writes to the
  // cache rather than to component state, so a response that lands after the
  // page has gone updates an entry nobody is rendering yet rather than
  // resurrecting a dead one.
  const previewCsv = useMutation({
    mutationFn: (csv: string) => api.post<PreviewResponse>('/metrics/import/preview', { csv }),
    onError: (e: unknown) => {
      push((e as Error).message, 'error');
    },
  });

  const commitImport = useMutation({
    // The company rides in the variables because an import has to be attributed
    // to a tenant: switching company between the click and the response would
    // otherwise refresh the dashboard of whoever is on screen by then.
    mutationFn: (input: { companyId: string | null; csv: string }) =>
      api.post<{ committed: number; errors: string[] }>('/metrics/import/commit', { csv: input.csv }),
    onSuccess: (res, { companyId }) => {
      // A file with a bad row commits nothing: the backend parses and validates
      // the whole file first and returns before the transaction, so `committed`
      // is 0 and no month was touched. The preview therefore stays on screen -
      // it is the operator's only record of which cells the server objected to -
      // and there is no cache to refresh on this path.
      if (res.errors.length > 0) {
        push(`${res.errors.length} row(s) failed.`, 'error');
        return;
      }
      push(`Imported ${res.committed} snapshot(s).`, 'success');
      // Every row landed, so the series the metrics, dashboard and scenarios
      // pages read is stale. It is invalidated rather than written: a commit
      // answers with a count, and the dashboard's rows carry a `derived` block
      // the server recomputes across the whole series. A `null` company matches
      // no cache entry, which is consistent - without one the request carried no
      // `X-Company-Id` and the server refused it before writing a row.
      void queryClient.invalidateQueries({ queryKey: companyKeys.dashboard(companyId) });
      previewCsv.reset();
      setFileName(null);
    },
    onError: (e: unknown) => {
      push((e as Error).message, 'error');
    },
  });

  const preview = previewCsv.data;

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      setCsvText(text);
      // The previous file's rows and error count are dropped before the new file
      // is parsed, not after: the dropzone has already claimed the new name, and
      // leaving the old card up would attribute one file's parse to another's.
      previewCsv.reset();
      previewCsv.mutate(text);
    };
    reader.readAsText(file);
  }

  const confirmCommit = () => {
    commitImport.mutate({ companyId: activeCompanyId, csv: csvText });
  };

  return (
    <motion.div className="flex flex-col gap-6" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-runway-text">CSV Import</h2>
        <p className="text-sm text-runway-muted">
          Columns required: month, mrr, newMrr, expansionMrr, contractionMrr, churnedMrr, newCustomers,
          churnedCustomers, totalCustomers, burnRate, cash.
        </p>
      </div>

      <div
        className="runway-card cursor-pointer transition-all duration-300 hover:border-runway-accent/40 hover:shadow-glow"
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
      >
        <div className="runway-sheen" />
        <div className="relative p-12 flex flex-col items-center justify-center gap-3">
          <div className="relative">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-runway-accent/[0.16] to-runway-accent2/[0.08] border border-runway-accent/20 flex items-center justify-center">
              {fileName ? <FileCheck2 size={22} className="text-runway-positive" /> : <UploadCloud size={22} className="text-runway-accent" />}
            </div>
            <div className="absolute inset-0 rounded-2xl bg-runway-accent/10 blur-xl -z-10" />
          </div>
          <span className="text-runway-text text-sm font-medium">{fileName ?? 'Drop a CSV file here or click to browse'}</span>
          <span className="text-runway-muted text-xs">Generate a sample file via scripts/generate-csv.ts on the backend</span>
        </div>
      </div>
      <input ref={fileInputRef} type="file" accept=".csv" onChange={onFile} className="hidden" />

      {previewCsv.isPending && <p className="text-xs text-runway-muted">Parsing {fileName}…</p>}

      {preview && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <div className="runway-card p-5">
            <div className="runway-sheen" />
            <div className="relative flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-runway-text">
                Preview — {preview.rowCount} row(s) {preview.errors.length > 0 && `· ${preview.errors.length} error(s)`}
              </h3>
              {preview.errors.length > 0 ? (
                <ul className="text-xs text-runway-negative list-disc pl-4 space-y-0.5">
                  {preview.errors.slice(0, 10).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              ) : (
                <Button color="primary" size="sm" className="w-fit bg-accent-gradient font-medium" isLoading={commitImport.isPending} onPress={confirmCommit}>
                  {commitImport.isPending ? 'Importing…' : 'Confirm & commit'}
                </Button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
