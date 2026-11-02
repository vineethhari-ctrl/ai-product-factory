import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Cpu, FileText, Globe, Layers, LayoutDashboard, ShieldAlert, Users } from 'lucide-react';
import type { ProductDefinition, ScreenDefinition, ScreenUISpec } from '../types';
import { AppShell, type ShellNavItem } from '../components/AppShell';
import { ScreenCanvas } from '../components/ScreenCanvas';
import { themeFor } from '../components/UIBlocks';
import { isReadOnlyRole, prototypeRoles, prototypeScreens, sampleUserFor, shellActionFor } from '../services/prototypeModel';

const SCREEN_ICONS = [LayoutDashboard, Users, Activity, ShieldAlert, FileText, Globe, Cpu, Layers];

/**
 * The stand-alone prototype: the finished application as the business would see it, view only. Same frame and screens as the
 * Interactive Prototype step (AppShell + ScreenCanvas), none of the factory's controls, nothing that needs a server.
 */
export const PrototypeViewer: React.FC<{ definition: ProductDefinition }> = ({ definition }) => {
  const screens = useMemo(() => prototypeScreens(definition), [definition]);
  const roles = useMemo(() => prototypeRoles(definition), [definition]);
  const [screenIdx, setScreenIdx] = useState(0);
  const [roleIdx, setRoleIdx] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  const screen = screens[screenIdx] ?? screens[0];
  const role = roles[roleIdx] ?? roles[0];
  const readOnly = isReadOnlyRole(role);
  const withUi = (screen as ScreenDefinition).ui ? (screen as ScreenDefinition & { ui: ScreenUISpec }) : null;
  const action = shellActionFor(withUi as ScreenDefinition | null ?? undefined);
  const nav: ShellNavItem[] = useMemo(() => screens.map((s, i) => ({ id: s.id, label: s.name, group: s.module || 'Application', icon: SCREEN_ICONS[i % SCREEN_ICONS.length] })), [screens]);

  useEffect(() => { document.title = `${definition.productName} (prototype)`; }, [definition.productName]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }, [toast]);
  useEffect(() => setToast(null), [screenIdx]);

  return (
    <div className="min-h-screen bg-slate-200/70 flex flex-col font-sans">
      <div className="bg-slate-900 text-white px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800">
        <div className="flex items-center gap-3 min-w-0">
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 shrink-0">PROTOTYPE</span>
          <span className="text-xs text-slate-300 truncate">
            {definition.productName} <span className="font-mono text-indigo-300 font-semibold">{definition.version}</span>
            <span className="hidden md:inline text-slate-400"> · view only, sample data, nothing is saved</span>
          </span>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700 text-xs">
          <span className="text-slate-400 text-[11px]">Role:</span>
          <select aria-label="Role" value={roleIdx} onChange={(e) => setRoleIdx(Number(e.target.value))} className="bg-transparent text-white font-medium focus:outline-hidden text-xs cursor-pointer">
            {roles.map((r, i) => (
              <option key={i} value={i} className="bg-slate-900 text-white">{r.name} ({r.role})</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 max-w-[1600px] w-full mx-auto p-3 sm:p-5">
        <AppShell
          productName={definition.productName}
          tagline={definition.businessUnit}
          nav={nav}
          activeId={screen.id}
          onNavigate={(id) => { const i = screens.findIndex((s) => s.id === id); if (i >= 0) setScreenIdx(i); }}
          userName={sampleUserFor(roleIdx)}
          userRole={role.name}
          groupLabel={screen.module}
          title={screen.name}
          subtitle={screen.purpose}
          badge={readOnly ? 'View only' : undefined}
          theme={themeFor(definition.productName, definition.uiTheme)}
          primaryAction={action ? { label: action, disabled: readOnly, onClick: () => setToast(`${action} (simulated)`) } : undefined}
        >
          {toast && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800">{toast}</div>}
          {withUi ? (
            <ScreenCanvas key={withUi.id} screen={withUi} readOnly={readOnly} entities={definition.dataEntities} actionInHeader={!!action} />
          ) : (
            <div className="py-16 text-center text-sm text-slate-500">This screen has no design yet.</div>
          )}
        </AppShell>
        <p className="text-center text-[11px] text-slate-500 mt-3">An illustrative prototype: the people, records and figures are sample data, and no action here changes anything.</p>
      </div>
    </div>
  );
};
