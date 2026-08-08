import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard, Users, TrendingUp, Upload, FileText, Settings, UserPlus, GitCompare, Command, Rocket,
  SlidersHorizontal, UserCog, Activity, Plug, CreditCard, KeyRound,
} from 'lucide-react';

const links = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/cohorts', label: 'Cohorts', icon: Users },
  { to: '/metrics', label: 'Metrics', icon: TrendingUp },
  { to: '/import', label: 'Import', icon: Upload },
  { to: '/compare', label: 'Compare', icon: GitCompare },
  { to: '/scenarios', label: 'Scenarios', icon: SlidersHorizontal },
  { to: '/investor-update', label: 'Investor Update', icon: FileText },
];

const secondaryLinks = [
  { to: '/invites', label: 'Investor Invites', icon: UserPlus },
  { to: '/team', label: 'Team', icon: UserCog },
  { to: '/activity', label: 'Activity', icon: Activity },
  { to: '/integrations', label: 'Integrations', icon: Plug },
  { to: '/billing', label: 'Billing', icon: CreditCard },
  { to: '/api-keys', label: 'API Keys', icon: KeyRound },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const { pathname } = useLocation();

  return (
    <aside className="hidden md:flex md:w-64 flex-col shrink-0 min-h-screen bg-runway-charcoal/70 backdrop-blur-xl border-r border-runway-border/60 relative overflow-hidden">
      {/* Ambient glow bleeding through the top of the rail */}
      <div className="pointer-events-none absolute -top-24 -left-24 w-72 h-72 rounded-full bg-runway-accent/12 blur-3xl" />
      <div className="pointer-events-none absolute top-1/3 -right-16 w-48 h-48 rounded-full bg-runway-accent2/[0.07] blur-3xl" />

      {/* Logo */}
      <div className="relative flex items-center gap-3 px-5 pt-7 pb-6">
        <div className="relative">
          <div className="w-9 h-9 rounded-xl bg-accent-gradient flex items-center justify-center shadow-glow">
            <Rocket size={17} className="text-white" />
          </div>
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-runway-positive ring-2 ring-runway-charcoal" />
        </div>
        <div>
          <span className="block font-condensed text-[15px] font-bold tracking-wide text-runway-text leading-none">RUNWAY</span>
          <p className="text-[10px] text-runway-muted mt-1">Investor-grade metrics</p>
        </div>
      </div>

      {/* Primary nav */}
      <nav className="relative flex flex-col gap-1 px-3">
        {links.map((l) => (
          <NavItem key={l.to} to={l.to} label={l.label} Icon={l.icon} active={isActive(pathname, l.to)} />
        ))}
      </nav>

      {/* Secondary nav */}
      <div className="relative mt-6 px-3">
        <p className="text-micro text-runway-muted/80 uppercase px-3 mb-2">Workspace</p>
        <nav className="flex flex-col gap-1">
          {secondaryLinks.map((l) => (
            <NavItem key={l.to} to={l.to} label={l.label} Icon={l.icon} active={isActive(pathname, l.to)} />
          ))}
        </nav>
      </div>

      {/* Quick actions + profile */}
      <div className="relative mt-auto p-3 flex flex-col gap-3">
        <button
          onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
          className="group w-full flex items-center gap-2.5 text-xs text-runway-muted border border-runway-border/70 bg-white/[0.02] rounded-xl px-3 py-2.5 hover:border-runway-borderStrong hover:text-runway-text transition-all duration-200"
        >
          <Command size={13} className="transition-colors group-hover:text-runway-accent" />
          <span>Quick actions</span>
          <kbd className="ml-auto text-[10px] border border-runway-border rounded-md px-1.5 py-0.5 bg-runway-charcoal text-runway-muted">⌘K</kbd>
        </button>

        <div className="flex items-center gap-2.5 rounded-xl border border-runway-border/70 bg-runway-surface/60 px-3 py-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-runway-accent/80 to-runway-accent2/60 flex items-center justify-center text-white text-xs font-semibold shrink-0">
            DF
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-runway-text truncate">Demo Founder</p>
            <p className="text-[10px] text-runway-muted">Founder · Runway</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

function isActive(pathname: string, to: string) {
  return to === '/' ? pathname === '/' : pathname.startsWith(to);
}

function NavItem({ to, label, Icon, active }: { to: string; label: string; Icon: typeof LayoutDashboard; active: boolean }) {
  return (
    <Link to={to} className="relative block group">
      {active && (
        <motion.div
          layoutId="sidebar-active"
          className="absolute inset-0 rounded-xl bg-gradient-to-r from-runway-accent/[0.16] to-runway-accent2/[0.06] border border-runway-accent/25 shadow-glow"
          transition={{ type: 'spring', stiffness: 500, damping: 40 }}
        />
      )}
      <span
        className={`relative z-10 flex items-center gap-3 px-2.5 py-2 rounded-xl text-sm transition-colors duration-200 ${
          active ? 'text-runway-text font-medium' : 'text-runway-muted group-hover:text-runway-text'
        }`}
      >
        <span
          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200 ${
            active
              ? 'bg-accent-gradient text-white shadow-glow'
              : 'bg-white/[0.03] border border-runway-border/60 text-runway-muted group-hover:border-runway-borderStrong group-hover:text-runway-text'
          }`}
        >
          <Icon size={15} />
        </span>
        {label}
      </span>
    </Link>
  );
}
