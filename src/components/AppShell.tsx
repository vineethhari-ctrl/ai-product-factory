import React, { useMemo, useState } from 'react';
import { Bell, ChevronDown, ChevronRight, HelpCircle, Layers, LogOut, Menu, Search, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface ShellNavItem {
  id: string;
  label: string;
  group: string;
  icon: LucideIcon;
}

interface AppShellProps {
  productName: string;
  /** Short line under the product name in the sidebar, e.g. the business unit. */
  tagline?: string;
  nav: ShellNavItem[];
  activeId: string;
  onNavigate: (id: string) => void;
  userName: string;
  userRole: string;
  /** Page title and one-line description shown above the screen. */
  title: string;
  subtitle?: string;
  groupLabel?: string;
  /** Main action of the page, shown top right (e.g. "New Check In"). */
  primaryAction?: { label: string; disabled?: boolean; onClick: () => void };
  /** Small amber chip next to the title when something is read-only or locked. */
  badge?: string;
  children: React.ReactNode;
}

const initialsOf = (s: string) =>
  s.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';

/**
 * The prototype frame: how the finished application looks to its users. A left menu grouped by module,
 * a top bar with search, notifications and the signed-in user, then the screen. No factory controls in here.
 */
export const AppShell: React.FC<AppShellProps> = ({
  productName, tagline, nav, activeId, onNavigate, userName, userRole, title, subtitle, groupLabel, primaryAction, badge, children,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const out: Array<{ name: string; items: ShellNavItem[] }> = [];
    for (const item of nav) {
      const g = out.find((x) => x.name === item.group);
      if (g) g.items.push(item);
      else out.push({ name: item.group, items: [item] });
    }
    return out;
  }, [nav]);

  // One-screen modules would make a header per link; show headers only when modules hold several screens.
  const showGroups = groups.length > 1 && groups.length <= nav.length / 2;

  const matches = query.trim()
    ? nav.filter((n) => n.label.toLowerCase().includes(query.trim().toLowerCase()))
    : [];

  const sidebar = (
    <div className="h-full flex flex-col bg-slate-900 text-slate-300">
      <div className="px-4 py-4 flex items-center gap-3 border-b border-slate-800">
        <div className="w-9 h-9 rounded-xl bg-indigo-500 text-white flex items-center justify-center font-bold shrink-0">
          {initialsOf(productName).slice(0, 1) || <Layers className="w-4 h-4" />}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-bold text-white truncate">{productName}</div>
          {tagline && <div className="text-[11px] text-slate-400 truncate">{tagline}</div>}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-4">
        {groups.map((g) => (
          <div key={g.name}>
            {showGroups && (
              <div className="px-2.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 truncate">{g.name}</div>
            )}
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const active = it.id === activeId;
                const Icon = it.icon;
                return (
                  <li key={it.id}>
                    <button
                      onClick={() => { onNavigate(it.id); setMenuOpen(false); }}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-left transition-colors cursor-pointer ${
                        active ? 'bg-indigo-500/20 text-white font-semibold' : 'hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-indigo-300' : 'text-slate-500'}`} />
                      <span className="truncate">{it.label}</span>
                      {active && <ChevronRight className="w-3.5 h-3.5 ml-auto text-indigo-300" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="px-3 py-3 border-t border-slate-800 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full bg-slate-700 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
          {initialsOf(userName)}
        </div>
        <div className="min-w-0">
          <div className="text-xs font-semibold text-white truncate">{userName}</div>
          <div className="text-[11px] text-slate-400 truncate">{userRole}</div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex bg-white rounded-xl border border-slate-300 shadow-xl overflow-hidden min-h-[720px]">
      <aside className="hidden lg:block w-64 shrink-0">{sidebar}</aside>

      {menuOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="w-64 max-w-[80%]">{sidebar}</div>
          <button aria-label="Close menu" className="flex-1 bg-slate-900/50" onClick={() => setMenuOpen(false)} />
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col bg-slate-50">
        <header className="h-14 shrink-0 bg-white border-b border-slate-200 px-4 flex items-center gap-3">
          <button className="lg:hidden p-1.5 rounded-md hover:bg-slate-100 cursor-pointer" onClick={() => setMenuOpen(true)} aria-label="Open menu">
            <Menu className="w-5 h-5 text-slate-600" />
          </button>
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search screens and records"
              className="w-full pl-9 pr-8 py-2 rounded-lg bg-slate-100 border border-transparent text-xs focus:outline-hidden focus:bg-white focus:border-indigo-300"
            />
            {query && (
              <button className="absolute right-2.5 top-2.5 cursor-pointer" onClick={() => setQuery('')} aria-label="Clear search">
                <X className="w-3.5 h-3.5 text-slate-400" />
              </button>
            )}
            {matches.length > 0 && (
              <ul className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg py-1">
                {matches.map((m) => (
                  <li key={m.id}>
                    <button
                      onClick={() => { onNavigate(m.id); setQuery(''); }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 cursor-pointer flex items-center gap-2"
                    >
                      <m.icon className="w-3.5 h-3.5 text-slate-400" /> {m.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <button className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer" aria-label="Help"><HelpCircle className="w-[18px] h-[18px]" /></button>
            <button className="relative p-2 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer" aria-label="Notifications">
              <Bell className="w-[18px] h-[18px]" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 border-2 border-white" />
            </button>
            <div className="relative">
              <button
                onClick={() => setUserOpen((o) => !o)}
                className="flex items-center gap-2 pl-1.5 pr-2 py-1 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <span className="w-7 h-7 rounded-full bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center">{initialsOf(userName)}</span>
                <span className="hidden sm:block text-left leading-tight">
                  <span className="block text-xs font-semibold text-slate-800">{userName}</span>
                  <span className="block text-[10px] text-slate-500">{userRole}</span>
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>
              {userOpen && (
                <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-slate-200 bg-white shadow-lg py-1 text-xs">
                  <div className="px-3 py-2 text-slate-500 border-b border-slate-100">Signed in as {userRole}</div>
                  <button onClick={() => setUserOpen(false)} className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 cursor-pointer">
                    <LogOut className="w-3.5 h-3.5 text-slate-400" /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 min-w-0 px-5 sm:px-7 py-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              {groupLabel && <div className="text-[11px] font-semibold text-slate-400 mb-1">{groupLabel} <span className="mx-1">/</span> {title}</div>}
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
                {badge && <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-semibold">{badge}</span>}
              </div>
              {subtitle && <p className="text-sm text-slate-500 mt-1 max-w-3xl">{subtitle}</p>}
            </div>
            {primaryAction && (
              <button
                onClick={primaryAction.onClick}
                disabled={primaryAction.disabled}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-xs disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed cursor-pointer"
              >
                {primaryAction.label}
              </button>
            )}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
};
