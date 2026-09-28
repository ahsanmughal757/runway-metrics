import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Button, Input, Textarea } from '@heroui/react';
import { FileDown, Link2, Lock } from 'lucide-react';
import { api } from '../lib/api';
import { useCompany } from '../lib/CompanyContext';
import { companyKeys } from '../lib/queryKeys';
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
  const { can, activeCompanyId } = useCompany();
  const { push } = useToast();
  const queryClient = useQueryClient();
  const [sections, setSections] = useState(defaultSections);
  const [periodLabel, setPeriodLabel] = useState(
    new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
  );
  /**
   * A two-second acknowledgement of the copy, not server state. A mutation stays
   * successful for as long as the page is open, so the label has to be timed by
   * hand; deriving it from `createLink.isSuccess` would read "Link copied!" for
   * the rest of the session.
   */
  const [copied, setCopied] = useState(false);

  // No `signal` on either mutation: `useMutation` hands out no abort signal and
  // does not cancel on unmount, and it does not need to. A mutation writes to the
  // cache rather than to component state, so a response that lands after the page
  // has gone updates an entry nobody is rendering yet rather than resurrecting a
  // dead one.
  const createLink = useMutation({
    // The company rides in the variables although the URL does not name it: the
    // header carries it, but the cache write after the response has to name the
    // tenant, and reading the company off the render at that point would address
    // whichever company is on screen when the response lands.
    mutationFn: (_input: { companyId: string | null }) => api.post<{ token: string }>('/reports/share-link'),
    onSuccess: async ({ token }, { companyId }) => {
      // A token and nothing else, so there is no link row to write into the list
      // the share-links page reads: it is re-read instead. A `setQueryData` would
      // have to invent the row the endpoint declined to send.
      void queryClient.invalidateQueries({ queryKey: companyKeys.shareLinks(companyId) });
      await navigator.clipboard.writeText(`${window.location.origin}/share/${token}`);
      setCopied(true);
      push('Link copied.', 'success');
      setTimeout(() => setCopied(false), 2000);
    },
    onError: (e: unknown) => {
      push((e as Error).message, 'error');
    },
  });

  const exportPdf = useMutation({
    // No company in the variables because nothing here writes to the cache, so
    // there is no tenant to name. The PDF is rendered from the metrics and
    // changes none of them; the only trace is an audit row, which the activity
    // feed picks up on its next refetch.
    mutationFn: (input: { periodLabel: string; sections: NarrativeSection[] }) =>
      // Goes through the api client rather than a bare fetch so the PDF
      // request carries the same auth and company headers, and gets the same
      // refresh-on-401 behaviour as every other call.
      api.post<Blob>('/reports/investor-update', { periodLabel: input.periodLabel, narrativeSections: input.sections }),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'investor-update.pdf';
      a.click();
      URL.revokeObjectURL(url);
      push('Investor update generated.', 'success');
    },
    onError: (e: unknown) => {
      push((e as Error).message, 'error');
    },
  });

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
        <Button color="primary" size="sm" isLoading={exportPdf.isPending} onPress={() => exportPdf.mutate({ periodLabel, sections })} startContent={!exportPdf.isPending && <FileDown size={14} />} className="bg-accent-gradient font-medium">
          {exportPdf.isPending ? 'Generating…' : 'Export PDF'}
        </Button>
        <Button
          size="sm"
          variant="bordered"
          onPress={() => createLink.mutate({ companyId: activeCompanyId })}
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
