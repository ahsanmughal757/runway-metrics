import { Avatar, Select, SelectItem, Tab, Tabs } from '@heroui/react';
import { Command } from 'lucide-react';
import { useCompany } from '../lib/CompanyContext';
import { NotificationsBell } from './NotificationsBell';

export function TopBar() {
  const { companies, activeCompanyId, setActiveCompanyId, role, setRole } = useCompany();

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between px-6 py-3 bg-runway-bg/60 backdrop-blur-xl border-b border-runway-border/60">
      <div className="flex items-center gap-3 w-72">
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
            classNames={{
              trigger:
                'bg-white/[0.02] border-runway-border/70 hover:border-runway-borderStrong data-[hover=true]:border-runway-borderStrong rounded-xl shadow-soft',
              popoverContent: 'bg-runway-raised border border-runway-borderStrong rounded-xl shadow-raised',
              listbox: 'text-runway-text',
            }}
          >
            {companies.map((c) => (
              <SelectItem key={c.id} classNames={{ base: 'data-[selected=true]:bg-runway-accent/15' }}>
                {c.name}
              </SelectItem>
            ))}
          </Select>
        ) : (
          <span className="text-sm text-runway-text font-medium">{companies[0]?.name}</span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
          className="hidden lg:flex items-center gap-1.5 text-xs text-runway-muted border border-runway-border/70 bg-white/[0.02] rounded-xl px-3 py-2 hover:text-runway-text hover:border-runway-borderStrong transition-all duration-200"
        >
          <Command size={12} /> <span>Search</span>
          <kbd className="ml-1 text-[10px] border border-runway-border rounded-md px-1 py-0.5 bg-runway-charcoal">⌘K</kbd>
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
          classNames={{
            tabList: 'bg-white/[0.03] border border-runway-border/70 rounded-xl p-1',
            tab: 'text-runway-muted data-[selected=true]:text-white rounded-lg',
            cursor: 'bg-accent-gradient shadow-glow',
          }}
        >
          <Tab key="FOUNDER" title="Founder" />
          <Tab key="INVESTOR" title="Investor" />
        </Tabs>

        <NotificationsBell />
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-runway-accent/80 to-runway-accent2/60 flex items-center justify-center text-white text-xs font-semibold shadow-glow ring-1 ring-white/10">
          DF
        </div>
      </div>
    </header>
  );
}
