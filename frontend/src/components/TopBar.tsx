import { Avatar, Select, SelectItem, Tab, Tabs } from '@heroui/react';
import { Command } from 'lucide-react';
import { useCompany } from '../lib/CompanyContext';
import { NotificationsBell } from './NotificationsBell';

export function TopBar() {
  const { companies, activeCompanyId, setActiveCompanyId, role, setRole } = useCompany();

  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-runway-border bg-runway-bg/80 backdrop-blur sticky top-0 z-30">
      <div className="flex items-center gap-3 w-64">
        {companies.length >= 2 ? (
          <Select
            aria-label="Company switcher"
            size="sm"
            variant="bordered"
            selectedKeys={activeCompanyId ? [activeCompanyId] : []}
            onSelectionChange={(keys) => {
              const id = Array.from(keys)[0] as string | undefined;
              if (id) setActiveCompanyId(id);
            }}
            classNames={{ trigger: 'border-runway-border bg-runway-surface' }}
          >
            {companies.map((c) => (
              <SelectItem key={c.id}>{c.name}</SelectItem>
            ))}
          </Select>
        ) : (
          <span className="text-sm text-runway-text font-medium">{companies[0]?.name}</span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
          className="hidden lg:flex items-center gap-1.5 text-xs text-runway-muted border border-runway-border rounded-md px-2.5 py-1.5 hover:text-runway-text transition-colors"
        >
          <Command size={12} /> <span>⌘K</span>
        </button>

        {/* Demo-only viewpoint toggle. The server enforces role via RolesGuard
            regardless of this switch — see auth/bypass-auth.guard.ts. */}
        <Tabs
          aria-label="Viewpoint"
          size="sm"
          selectedKey={role}
          onSelectionChange={(key) => setRole(key as 'FOUNDER' | 'INVESTOR')}
          color="primary"
          variant="solid"
          classNames={{ tabList: 'bg-runway-surface border border-runway-border' }}
        >
          <Tab key="FOUNDER" title="Founder" />
          <Tab key="INVESTOR" title="Investor" />
        </Tabs>

        <NotificationsBell />
        <Avatar name="Demo Founder" size="sm" className="bg-runway-surface text-runway-muted" />
      </div>
    </header>
  );
}
