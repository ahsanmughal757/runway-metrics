import { useEffect, useState } from 'react';
import { Button, Input, Slider } from '@heroui/react';
import { useCompany } from '../lib/CompanyContext';
import { useToast } from '../lib/ToastContext';
import { api } from '../lib/api';
import { ChartCardSkeleton } from '../components/Skeleton';

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
  const { activeCompanyId, role, can } = useCompany();
  const { push } = useToast();
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [saving, setSaving] = useState(false);
  const canEdit = can('company:update');

  useEffect(() => {
    if (!activeCompanyId) return;
    api.get<CompanySettings>('/companies/settings').then(setSettings);
  }, [activeCompanyId, role]);

  async function save() {
    if (!settings) return;
    setSaving(true);
    try {
      const updated = await api.put<CompanySettings>('/companies/settings', settings);
      setSettings(updated);
      push('Settings saved.', 'success');
    } catch (e) {
      push((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!settings) return <ChartCardSkeleton height={280} />;

  return (
    <div className="flex flex-col gap-6 max-w-xl">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-runway-text">Settings</h2>
        <p className="text-sm text-runway-muted">Company profile and runway zone thresholds.</p>
      </div>

      <div className="runway-card overflow-hidden">
        <div className="runway-sheen" />
        <div className="relative px-5 pt-5 pb-5">
          <h3 className="text-sm font-semibold text-runway-text mb-4">Company Profile</h3>
          <Input
            label="Company name"
            size="sm"
            variant="bordered"
            value={settings.name}
            onValueChange={(v) => setSettings({ ...settings, name: v })}
            isDisabled={!canEdit}
            classNames={inputClassNames}
          />
        </div>
      </div>

      <div className="runway-card overflow-hidden">
        <div className="runway-sheen" />
        <div className="relative px-5 pt-5 pb-5">
          <div className="flex flex-col items-start gap-0.5 mb-5">
            <span className="text-sm font-semibold text-runway-text">Runway Zone Thresholds</span>
            <span className="text-xs text-runway-muted">Controls the zone indicator on the dashboard runway card.</span>
          </div>
          <div className="flex flex-col gap-6">
            <div>
              <div className="flex justify-between text-xs text-runway-muted mb-2">
                <span>Green (healthy) at</span>
                <span className="text-runway-positive font-semibold">{settings.runwayGreenMonths} months+</span>
              </div>
              <Slider
                size="sm"
                minValue={settings.runwayYellowMonths + 1}
                maxValue={24}
                step={1}
                value={settings.runwayGreenMonths}
                onChange={(v) => setSettings({ ...settings, runwayGreenMonths: Array.isArray(v) ? v[0] : v })}
                isDisabled={!canEdit}
                color="success"
              />
            </div>
            <div>
              <div className="flex justify-between text-xs text-runway-muted mb-2">
                <span>Yellow (caution) at</span>
                <span className="text-runway-amber font-semibold">{settings.runwayYellowMonths} months+</span>
              </div>
              <Slider
                size="sm"
                minValue={0}
                maxValue={Math.max(1, settings.runwayGreenMonths - 1)}
                step={1}
                value={settings.runwayYellowMonths}
                onChange={(v) => setSettings({ ...settings, runwayYellowMonths: Array.isArray(v) ? v[0] : v })}
                isDisabled={!canEdit}
                color="warning"
              />
            </div>
            <p className="text-xs text-runway-muted">Below {settings.runwayYellowMonths} months shows red.</p>
          </div>
        </div>
      </div>

      {canEdit && (
        <Button color="primary" size="sm" className="w-fit bg-accent-gradient font-medium" isLoading={saving} onPress={save}>
          Save changes
        </Button>
      )}
    </div>
  );
}
