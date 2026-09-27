import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button, Input, Textarea } from '@heroui/react';
import { FileDown, Link2, Lock } from 'lucide-react';
import { api } from '../lib/api';
import { useCompany } from '../lib/CompanyContext';
import { useToast } from '../lib/ToastContext';
import { EmptyState } from '../components/EmptyState';

interface NarrativeSection {
  heading: string;
  body: string;
}

const defaultSections: NarrativeSection[] = [
  { heading: 'Highlights', body: 'Summarize the biggest wins this period — new logos, key hires, product launches.' },
  { heading: 'Challenges', body: "Be candid about what's not working. Investors trust founders who surface problems early." },
  { heading: 'Asks', body: 'Specific ways investors can help — intros, hires, feedback on a decision.' },
];

const inputClassNames = {
  inputWrapper:
    'bg-white/[0.02] border border-runway-border/70 data-[hover=true]:bg-white/[0.03] rounded-xl shadow-soft',
  label: 'text-runway-muted',
};

export function InvestorUpdate() {
  const { can } = useCompany();
  const { push } = useToast();
  const [sections, setSections] = useState(defaultSections);
  const [periodLabel, setPeriodLabel] = useState(
    new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
  );
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyInvestorLink() {
    try {
      const { token } = await api.post<{ token: string }>('/reports/share-link');
      const url = `${window.location.origin}/share/${token}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      push('Link copied.', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      push((e as Error).message, 'error');
    }
  }

  async function exportPdf() {
    setGenerating(true);
    try {
      // Goes through the api client rather than a bare fetch so the PDF
      // request carries the same auth and company headers, and gets the same
      // refresh-on-401 behaviour as every other call.
      const blob = await api.post<Blob>('/reports/investor-update', {
        periodLabel,
        narrativeSections: sections,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'investor-update.pdf';
      a.click();
      URL.revokeObjectURL(url);
      push('Investor update generated.', 'success');
    } catch (e) {
      push((e as Error).message, 'error');
    } finally {
      setGenerating(false);
    }
  }

  if (!can('reports:generate')) {
    return (
      <EmptyState
        icon={Lock}
        title="Not available for your role"
        description="Generating an investor update needs the reports:generate permission. An Analyst or above can do this; a Viewer cannot."
      />
    );
  }

  return (
    <motion.div className="flex flex-col gap-6 max-w-2xl" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-runway-text">Investor Update Builder</h2>
        <p className="text-sm text-runway-muted">
          The dashboard is the input; this PDF is the product investors actually read.
        </p>
      </div>

      <Input
        label="Period label"
        size="sm"
        variant="bordered"
        className="max-w-xs"
        classNames={inputClassNames}
        value={periodLabel}
        onValueChange={setPeriodLabel}
      />

      {sections.map((s, i) => (
        <div key={i} className="runway-card p-5">
          <div className="runway-sheen" />
          <div className="relative flex flex-col gap-2">
            <Input
              value={s.heading}
              variant="underlined"
              size="sm"
              classNames={{ input: 'text-sm font-semibold text-runway-text', inputWrapper: 'border-runway-border' }}
              onValueChange={(v) => {
                const next = [...sections];
                next[i] = { ...next[i], heading: v };
                setSections(next);
              }}
            />
            <Textarea
              value={s.body}
              variant="bordered"
              minRows={3}
              classNames={inputClassNames}
              onValueChange={(v) => {
                const next = [...sections];
                next[i] = { ...next[i], body: v };
                setSections(next);
              }}
            />
          </div>
        </div>
      ))}

      <div>
        <Button color="primary" size="sm" isLoading={generating} onPress={exportPdf} startContent={!generating && <FileDown size={14} />} className="bg-accent-gradient font-medium">
          {generating ? 'Generating…' : 'Export PDF'}
        </Button>
        <Button
          size="sm"
          variant="bordered"
          onPress={copyInvestorLink}
          startContent={<Link2 size={14} />}
          className="ml-2 border-runway-border text-runway-text"
        >
          {copied ? 'Link copied!' : 'Copy investor link'}
        </Button>
        <p className="text-[11px] text-runway-muted mt-2">
          Share link opens a read-only view of KPI cards and the MRR chart — no login required, token expires in 7 days.
        </p>
      </div>
    </motion.div>
  );
}
