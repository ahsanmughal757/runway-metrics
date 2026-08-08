import { ChangeEvent, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Button, Card, CardBody } from '@heroui/react';
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
      api.post<PreviewResponse>('/metrics/import/preview', { csv: text }).then(setPreview);
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
        <h2 className="text-lg font-medium text-runway-text">CSV Import</h2>
        <p className="text-sm text-runway-muted">
          Columns required: month, mrr, newMrr, expansionMrr, contractionMrr, churnedMrr, newCustomers,
          churnedCustomers, totalCustomers, burnRate, cash.
        </p>
      </div>

      <Card
        isPressable
        onPress={() => fileInputRef.current?.click()}
        className="bg-runway-surface border border-dashed border-runway-border hover:border-runway-accent/60 transition-colors"
      >
        <CardBody className="p-10 flex flex-col items-center justify-center gap-2">
          <div className="w-11 h-11 rounded-full bg-runway-accent/10 flex items-center justify-center mb-1">
            {fileName ? <FileCheck2 size={20} className="text-runway-positive" /> : <UploadCloud size={20} className="text-runway-accent" />}
          </div>
          <span className="text-runway-text text-sm">{fileName ?? 'Drop a CSV file here or click to browse'}</span>
          <span className="text-runway-muted text-xs">Generate a sample file via scripts/generate-csv.ts on the backend</span>
        </CardBody>
      </Card>
      <input ref={fileInputRef} type="file" accept=".csv" onChange={onFile} className="hidden" />

      {preview && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="bg-runway-surface border border-runway-border">
            <CardBody className="flex flex-col gap-3">
              <h3 className="text-sm font-medium text-runway-text">
                Preview — {preview.rowCount} row(s) {preview.errors.length > 0 && `· ${preview.errors.length} error(s)`}
              </h3>
              {preview.errors.length > 0 ? (
                <ul className="text-xs text-runway-negative list-disc pl-4 space-y-0.5">
                  {preview.errors.slice(0, 10).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              ) : (
                <Button color="primary" size="sm" className="w-fit" isLoading={committing} onPress={commit}>
                  {committing ? 'Importing…' : 'Confirm & commit'}
                </Button>
              )}
            </CardBody>
          </Card>
        </motion.div>
      )}
    </motion.div>
  );
}
