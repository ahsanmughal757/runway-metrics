import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Input, Slider } from '@heroui/react';
import { useCompany } from '../lib/CompanyContext';
import { useToast } from '../lib/ToastContext';
import { api } from '../lib/api';
import { companyKeys } from '../lib/queryKeys';
import { ChartCardSkeleton } from '../components/Skeleton';
import { ErrorState } from '../components/ErrorState';

interface CompanySettings {
  id: string;
  name: string;
  runwayGreenMonths: number;
  runwayYellowMonths: number;
}

const inputClassNames = {
  inputWrapper:
    'bg-white/[0.02] border border-runway-border/70 data-[hover=true]:bg-white/[0.03] rounded-xl shadow-soft',
  label: 'text-runway-muted',
};

export function Settings() {
  const { activeCompanyId } = useCompany();
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: companyKeys.settings(activeCompanyId),
    queryFn: ({ signal }) => api.get<CompanySettings>('/companies/settings', signal),
    // No company, no request. See the rule in `queryKeys.ts`.
    enabled: activeCompanyId !== null,
  });

  // No company yet is a pending state, not a failure: the query is disabled
  // rather than fired, so it would otherwise sit at `isPending` forever and be
  // indistinguishable from a slow server. Checking the company first also narrows
  // the type for the form below, which needs to name the company to write the
  // saved value back to the right cache entry.
  if (activeCompanyId === null || isPending) return <ChartCardSkeleton height={280} />;
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data) return <ErrorState error={new Error('The company has no settings yet.')} />;

  return <SettingsForm settings={data} companyId={activeCompanyId} />;
}

/**
 * Split from the fetch so the draft can start from the server's copy.
 *
 * The form owns an editable copy of what it was handed, and keeping the fetch and
 * the draft in one component meant the draft had to be seeded by an effect. That
 * is the `set-state-in-effect` pattern this phase exists to remove, and it is
 * also the weaker of the two designs: a `key` that changes with the data gives
 * React the reinitialisation it would otherwise need an effect for.
 */
function SettingsForm({ settings, companyId }: { settings: CompanySettings; companyId: string }) {
  const { can } = useCompany();
  const { push } = useToast();
  const queryClient = useQueryClient();
  const canEdit = can('company:update');

  const [draft, setDraft] = useState(settings);
  const [seededFrom, setSeededFrom] = useState(settings);

  // A background refetch can return a different copy of the settings — another
  // admin changed the runway thresholds, or the tab regained focus and picked up
  // an edit made elsewhere. The draft has to follow it, or the user's next Save
  // silently overwrites that change with what they were looking at before.
  //
  // This is React's "adjust state when a prop changes" pattern: the comparison
  // and the setState both happen during render rather than in an effect, so React
  // discards the render and re-runs it immediately with the new state. It looks
  // unusual and it is deliberate — the alternative, an effect, costs an extra
  // render on every refetch and is the thing the lint rule is pointing at.
  if (settings !== seededFrom) {
    setSeededFrom(settings);
    setDraft(settings);
  }

  const save = useMutation({
    mutationFn: (values: CompanySettings) => api.put<CompanySettings>('/companies/settings', values),
    onSuccess: (updated) => {
      // Hand the server's answer back to the cache rather than trusting the draft
      // we sent. The server normalises, and a page that keeps showing what the
      // user typed is a page that can disagree with what was actually saved.
      queryClient.setQueryData(companyKeys.settings(companyId), updated);
      push('Settings saved.', 'success');
    },
    onError: (e: unknown) => {
      push((e as Error).message, 'error');
    },
  });

  function submit() {
    save.mutate(draft);
  }

  return (
    <div className="flex flex-col gap-6 max-w-xl">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-runway-text">Settings</h2>
        <p className="text-sm text-runway-muted">Company profile and runway zone thresholds.</p>
      </div>

      <div className="runway-card overflow-hidden">
        <div className="runway-sheen" />
        <div className="relative px-5 py-5">
          <h3 className="text-sm font-semibold text-runway-text mb-4">Company Profile</h3>
          <Input
            label="Company name"
            size="sm"
            variant="bordered"
            value={draft.name}
            onValueChange={(v) => setDraft({ ...draft, name: v })}
            isDisabled={!canEdit}
            classNames={inputClassNames}
          />
        </div>
      </div>

      <div className="runway-card overflow-hidden">
        <div className="runway-sheen" />
        <div className="relative px-5 py-5">
          <div className="flex flex-col items-start gap-0.5 mb-5">
            <span className="text-sm font-semibold text-runway-text">Runway Zone Thresholds</span>
            <span className="text-xs text-runway-muted">Controls the zone indicator on the dashboard runway card.</span>
          </div>
          <div className="flex flex-col gap-6">
            <div>
              <div className="flex justify-between text-xs text-runway-muted mb-2">
                <span>Green (healthy) at</span>
                <span className="text-runway-positive font-semibold">{draft.runwayGreenMonths} months+</span>
              </div>
              <Slider
                size="sm"
                minValue={draft.runwayYellowMonths + 1}
                maxValue={24}
                step={1}
                value={draft.runwayGreenMonths}
                onChange={(v) => setDraft({ ...draft, runwayGreenMonths: Array.isArray(v) ? v[0] : v })}
                isDisabled={!canEdit}
                color="success"
              />
            </div>
            <div>
              <div className="flex justify-between text-xs text-runway-muted mb-2">
                <span>Yellow (caution) at</span>
                <span className="text-runway-amber font-semibold">{draft.runwayYellowMonths} months+</span>
              </div>
              <Slider
                size="sm"
                minValue={0}
                maxValue={Math.max(1, draft.runwayGreenMonths - 1)}
                step={1}
                value={draft.runwayYellowMonths}
                onChange={(v) => setDraft({ ...draft, runwayYellowMonths: Array.isArray(v) ? v[0] : v })}
                isDisabled={!canEdit}
                color="warning"
              />
            </div>
            <p className="text-xs text-runway-muted">Below {draft.runwayYellowMonths} months shows red.</p>
          </div>
        </div>
      </div>

      {canEdit && (
        <Button
          color="primary"
          size="sm"
          className="w-fit bg-accent-gradient font-medium"
          isLoading={save.isPending}
          onPress={submit}
        >
          Save changes
        </Button>
      )}
    </div>
  );
}
