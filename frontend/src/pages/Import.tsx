import type { ChangeEvent} from 'react';
import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@heroui/react';
import { UploadCloud, FileCheck2 } from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../lib/ToastContext';

interface PreviewResponse {
  rows: unknown[];
  errors: string[];
  rowCount: number;
}

export function Import() {
  const { push } = useToast();
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [committing, setCommitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      setCsvText(text);
      api
        .post<PreviewResponse>('/metrics/import/preview', { csv: text })
        .then(setPreview)
        .catch((e) => push((e as Error).message, 'error'));
    };
    reader.readAsText(file);
  }

  async function commit() {
    setCommitting(true);
    try {
      const res = await api.post<{ committed: number; errors: string[] }>('/metrics/import/commit', { csv: csvText });
      if (res.errors.length > 0) {
        push(`${res.errors.length} row(s) failed.`, 'error');
      } else {
        push(`Imported ${res.committed} snapshot(s).`, 'success');
        setPreview(null);
        setFileName(null);
      }
    } catch (e) {
      push((e as Error).message, 'error');
    } finally {
      setCommitting(false);
    }
  }

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
                <Button color="primary" size="sm" className="w-fit bg-accent-gradient font-medium" isLoading={committing} onPress={commit}>
                  {committing ? 'Importing…' : 'Confirm & commit'}
                </Button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
