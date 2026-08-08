import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard, Users, TrendingUp, Upload, FileText, Settings, UserPlus, GitCompare, Command,
} from 'lucide-react';

const links = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/cohorts', label: 'Cohorts', icon: Users },
  { to: '/metrics', label: 'Metrics', icon: TrendingUp },
  { to: '/import', label: 'Import', icon: Upload },
  { to: '/compare', label: 'Compare', icon: GitCompare },
  { to: '/investor-update', label: 'Investor Update', icon: FileText },
];

const secondaryLinks = [
  { to: '/invites', label: 'Investor Invites', icon: UserPlus },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const { pathname } = useLocation();

  return (
    <aside className="hidden md:flex md:w-60 flex-col shrink-0 bg-runway-charcoal border-r border-runway-border min-h-screen">
      <div className="px-5 py-6 flex items-center gap-2">
        <div className="w-7 h-7 rounded-md bg-runway-accent/15 flex items-center justify-center">
          <TrendingUp size={15} className="text-runway-accent" />
        </div>
        <div>
          <span className="text-base font-condensed font-bold tracking-wide text-runway-text leading-none block">RUNWAY</span>
          <p className="text-[10px] text-runway-muted mt-0.5">Investor-grade metrics</p>
        </div>
      </div>

      <nav className="flex flex-col gap-0.5 px-3 mt-2">
        {links.map((l) => (
          <NavItem key={l.to} to={l.to} label={l.label} Icon={l.icon} active={isActive(pathname, l.to)} />
        ))}
      </nav>

      <div className="mt-6 px-3">
        <p className="text-micro text-runway-muted uppercase px-3 mb-1.5">Workspace</p>
        <nav className="flex flex-col gap-0.5">
          {secondaryLinks.map((l) => (
            <NavItem key={l.to} to={l.to} label={l.label} Icon={l.icon} active={isActive(pathname, l.to)} />
          ))}
        </nav>
      </div>

      <div className="mt-auto p-3">
        <button
          onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
          className="w-full flex items-center gap-2 text-xs text-runway-muted border border-runway-border rounded-md px-3 py-2 hover:border-runway-borderStrong hover:text-runway-text transition-colors"
        >
          <Command size={13} />
          <span>Quick actions</span>
          <kbd className="ml-auto text-[10px] border border-runway-border rounded px-1">⌘K</kbd>
        </button>
      </div>
    </aside>
  );
}

function isActive(pathname: string, to: string) {
  return to === '/' ? pathname === '/' : pathname.startsWith(to);
}

function NavItem({ to, label, Icon, active }: { to: string; label: string; Icon: typeof LayoutDashboard; active: boolean }) {
  return (
    <Link to={to} className="relative block">
      {active && (
        <motion.div
          layoutId="sidebar-active"
          className="absolute inset-0 bg-runway-surface rounded-md"
          transition={{ type: 'spring', stiffness: 500, damping: 40 }}
        />
      )}
      <span
        className={`relative z-10 flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
          active ? 'text-runway-text font-medium' : 'text-runway-muted hover:text-runway-text'
        }`}
      >
        <Icon size={16} />
        {label}
      </span>
    </Link>
  );
}
