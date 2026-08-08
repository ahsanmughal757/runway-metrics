import { useEffect, useState } from 'react';
import { Button, Card, CardBody, CardHeader, Input, Slider } from '@heroui/react';
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
  inputWrapper: 'bg-runway-charcoal border border-runway-border data-[hover=true]:bg-runway-charcoal',
  label: 'text-runway-muted',
};

export function Settings() {
  const { activeCompanyId, role } = useCompany();
  const { push } = useToast();
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [saving, setSaving] = useState(false);
  const canEdit = role === 'FOUNDER';

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
        <h2 className="text-lg font-medium text-runway-text">Settings</h2>
        <p className="text-sm text-runway-muted">Company profile and runway zone thresholds.</p>
      </div>

      <Card className="bg-runway-surface border border-runway-border">
        <CardHeader className="text-sm font-medium text-runway-text">Company Profile</CardHeader>
        <CardBody className="flex flex-col gap-4">
          <Input
            label="Company name"
            size="sm"
            variant="bordered"
            value={settings.name}
            onValueChange={(v) => setSettings({ ...settings, name: v })}
            isDisabled={!canEdit}
            classNames={inputClassNames}
          />
        </CardBody>
      </Card>

      <Card className="bg-runway-surface border border-runway-border">
        <CardHeader className="flex flex-col items-start gap-0.5">
          <span className="text-sm font-medium text-runway-text">Runway Zone Thresholds</span>
          <span className="text-xs text-runway-muted">Controls the 🟢/🟡/🔴 indicator on the dashboard runway card.</span>
        </CardHeader>
        <CardBody className="flex flex-col gap-6 pt-2">
          <div>
            <div className="flex justify-between text-xs text-runway-muted mb-1.5">
              <span>Green (healthy) at</span>
              <span className="text-runway-positive">{settings.runwayGreenMonths} months+</span>
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
            <div className="flex justify-between text-xs text-runway-muted mb-1.5">
              <span>Yellow (caution) at</span>
              <span className="text-runway-amber">{settings.runwayYellowMonths} months+</span>
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
        </CardBody>
      </Card>

      {canEdit && (
        <Button color="primary" size="sm" className="w-fit" isLoading={saving} onPress={save}>
          Save changes
        </Button>
      )}
    </div>
  );
}
