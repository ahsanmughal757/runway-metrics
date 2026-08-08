import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button, Card, CardBody, Input, Textarea } from '@heroui/react';
import { FileDown, Lock } from 'lucide-react';
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
  inputWrapper: 'bg-runway-charcoal border border-runway-border data-[hover=true]:bg-runway-charcoal',
  label: 'text-runway-muted',
};

export function InvestorUpdate() {
  const { role } = useCompany();
  const { push } = useToast();
  const [sections, setSections] = useState(defaultSections);
  const [periodLabel, setPeriodLabel] = useState(
    new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
  );
  const [generating, setGenerating] = useState(false);

  async function exportPdf() {
    setGenerating(true);
    try {
      const token = localStorage.getItem('runway_token');
      const demoCompanyId = localStorage.getItem('runway_demo_company_id') ?? '';
      const demoRole = localStorage.getItem('runway_demo_role') ?? '';
      const res = await fetch('/api/reports/investor-update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'X-Demo-Company-Id': demoCompanyId,
          'X-Demo-Role': demoRole,
        },
        body: JSON.stringify({ periodLabel, narrativeSections: sections }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? 'Failed to generate PDF');
      }
      const blob = await res.blob();
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

  if (role !== 'FOUNDER') {
    return (
      <EmptyState
        icon={Lock}
        title="Founder-only tool"
        description="The Investor Update Builder is Founder-only. Switch to the Founder view (top right) to generate a report."
      />
    );
  }

  return (
    <motion.div className="flex flex-col gap-6 max-w-2xl" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <div>
        <h2 className="text-lg font-medium text-runway-text">Investor Update Builder</h2>
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
        <Card key={i} className="bg-runway-surface border border-runway-border">
          <CardBody className="flex flex-col gap-2">
            <Input
              value={s.heading}
              variant="underlined"
              size="sm"
              classNames={{ input: 'text-sm font-medium text-runway-text', inputWrapper: 'border-runway-border' }}
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
          </CardBody>
        </Card>
      ))}

      <div>
        <Button color="primary" size="sm" isLoading={generating} onPress={exportPdf} startContent={!generating && <FileDown size={14} />}>
          {generating ? 'Generating…' : 'Export PDF'}
        </Button>
      </div>
    </motion.div>
  );
}
