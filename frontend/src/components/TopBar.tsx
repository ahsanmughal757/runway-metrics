import { useState } from 'react';
import { Dropdown, DropdownItem, DropdownMenu, DropdownTrigger, Select, SelectItem, Switch, Tab, Tabs } from '@heroui/react';
import { Command, Moon, Sun, UserRound, Building2, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../lib/CompanyContext';
import { useAuth } from '../lib/AuthContext';
import { ROLE_LABELS, ROLES, type Role } from '../lib/permissions';
import type { AppTheme } from '../lib/theme';
import { applyTheme, getStoredTheme, setStoredTheme } from '../lib/theme';
import { NotificationsBell } from './NotificationsBell';
import { DataAsOf } from './DataAsOf';

export function TopBar() {
  const { companies, activeCompanyId, setActiveCompanyId, role, setRole, demo } = useCompany();
  const navigate = useNavigate();
  const auth = useAuth();
  const [dark, setDark] = useState(() => getStoredTheme() === 'dark');

  // checked = light (Switch shows Sun when selected).
  function handleThemeChange(checked: boolean) {
    const next: AppTheme = checked ? 'light' : 'dark';
    setDark(next === 'dark');
    setStoredTheme(next);
    applyTheme(next, true);
  }

  function handleLogout() {
    void auth.logout();
  }

  // Built as an array rather than written inline as JSX children. HeroUI types a
  // collection's children as `CollectionElement`, which admits neither `false`
  // nor a JSX comment - so a conditional item, and even the comment explaining
  // it, are type errors there. The rejected alternatives were `demo ? <Item/> :
  // null`, which the same type also rejects, and hiding the item behind
  // `disabled`, which leaves a control in the menu that does nothing.
  //
  // "Log out" is gated on the inverse of the viewpoint toggle, and for the
  // opposite reason: `logout()` ends a session by revoking the refresh cookie,
  // and demo mode has no session and no cookie - so the click clears nothing,
  // `isAuthenticated` was already false, and the app stays fully populated. A
  // sign-out that visibly does not sign you out is worse than none, because it
  // implies the session model works when it does not.
  const accountActions = [
    <DropdownItem key="profile" startContent={<UserRound size={14} />} onPress={() => navigate('/settings')}>
      Profile
    </DropdownItem>,
    <DropdownItem key="workspace" startContent={<Building2 size={14} />} onPress={() => navigate('/settings')}>
      Workspace
    </DropdownItem>,
    ...(!demo
      ? [
          <DropdownItem key="logout" startContent={<LogOut size={14} />} className="text-runway-negative" onPress={handleLogout}>
            Log out
          </DropdownItem>,
        ]
      : []),
  ];

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

        {/* Demo-only viewpoint toggle. The server re-derives permissions from
            whichever role is assumed, so this cannot show a capability the real
            product would refuse - see auth/bypass-auth.guard.ts.

            Hidden outside demo mode rather than disabled, and that is the point.
            `X-Demo-Role` is read by BypassAuthGuard alone, so against a real
            session the server ignores it and returns the real role: the tab you
            clicked springs back. Left visible, it is a role selector that a
            reviewer could reasonably read as "this is what ADMIN sees" - and in a
            real deployment the answer is that the role came from the database,
            not from this control. */}
        {demo && (
          <Tabs
            aria-label="Viewpoint"
            size="sm"
            selectedKey={role}
            onSelectionChange={(key) => setRole(key as Role)}
            color="primary"
            variant="solid"
            classNames={{
              tabList: 'bg-white/[0.03] border border-runway-border/70 rounded-xl p-1',
              tab: 'text-runway-muted data-[selected=true]:text-white rounded-lg text-xs',
              cursor: 'bg-accent-gradient shadow-glow',
            }}
          >
            {ROLES.map((r) => (
              <Tab key={r} title={ROLE_LABELS[r]} />
            ))}
          </Tabs>
        )}

        <NotificationsBell />
        <DataAsOf />

        <Switch
          aria-label="Theme toggle"
          size="sm"
          isSelected={!dark}
          onChange={(e) => handleThemeChange(e.target.checked)}
          thumbIcon={({ isSelected, className }) =>
            isSelected ? <Sun className={className} size={12} /> : <Moon className={className} size={12} />
          }
          classNames={{
            wrapper: 'group-data-[selected=true]:bg-runway-accent',
          }}
        />

        <Dropdown placement="bottom-end">
          <DropdownTrigger>
            <button
              aria-label="Account menu"
              className="w-9 h-9 rounded-xl bg-gradient-to-br from-runway-accent/80 to-runway-accent2/60 flex items-center justify-center text-white text-xs font-semibold shadow-glow ring-1 ring-white/10 hover:ring-white/25 transition-all duration-200 cursor-pointer"
            >
              DF
            </button>
          </DropdownTrigger>
          <DropdownMenu
            aria-label="Account actions"
            className="bg-runway-raised border border-runway-borderStrong rounded-xl text-runway-text"
            itemClasses={{ base: 'data-[hover=true]:bg-white/[0.04] rounded-lg' }}
          >
            {accountActions}
          </DropdownMenu>
        </Dropdown>
      </div>
    </header>
  );
}
