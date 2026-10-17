import React, { useState, useMemo } from 'react';
import { ProductDefinition } from '../types';
import { 
  LayoutDashboard, 
  Activity, 
  Users, 
  ShieldAlert, 
  MessageSquarePlus, 
  ChevronRight, 
  Sparkles, 
  CheckCircle2, 
  FileText, 
  Layers, 
  Search, 
  LayoutGrid,
  Monitor,
  Eye,
  Send,
  User,
  Zap,
  Globe,
  Cpu,
  Rocket,
  Settings2,
} from 'lucide-react';

import { ChangeImpactAnalysis, ScreenDefinition, ScreenUISpec } from '../types';
import { ScreenCanvas } from './ScreenCanvas';
import { PrototypeDesignBar } from './PrototypeDesignBar';
import { AppShell, ShellNavItem } from './AppShell';
import { themeFor } from './UIBlocks';

interface PrototypeScreenProps {
  definition: ProductDefinition;
  isGeneratingPrototype?: boolean;
  onRequestChangeClick: () => void;
  onProceedToEngineering: () => void;
  onAnalyzeChange?: (changeRequest: string) => Promise<ChangeImpactAnalysis>;
  onApplyChange?: (analysis: ChangeImpactAnalysis) => void;
  /** Optional screenshot the AI follows for layout (data URL). */
  referenceImage?: string | null;
  setReferenceImage?: (dataUrl: string | null) => void;
  /** Has the AI design every screen again (with the reference screen, if any). */
  onRedesign?: () => void;
}

/** Icon set for screen tabs — cycles through these for visual variety. */
const SCREEN_ICONS = [LayoutDashboard, Users, Activity, ShieldAlert, FileText, Globe, Cpu, Layers];

export const PrototypeScreen: React.FC<PrototypeScreenProps> = ({
  definition,
  isGeneratingPrototype = false,
  onRequestChangeClick,
  onProceedToEngineering,
  onAnalyzeChange,
  onApplyChange,
  referenceImage = null,
  setReferenceImage,
  onRedesign,
}) => {
  const [activeProtoScreenIdx, setActiveProtoScreenIdx] = useState<number>(0);
  const [selectedRoleIdx, setSelectedRoleIdx] = useState<number>(0);
  const [showTools, setShowTools] = useState(false);
  const [actionToast, setActionToast] = useState<string | null>(null);
  
  // View mode toggle: 'visual' (Visual UI Screen Mockup) vs 'grid' (Data & Schema Grid)
  const [viewMode, setViewMode] = useState<'visual' | 'grid'>('visual');

  // Reset local indices when the underlying product definition changes (e.g. new project)
  React.useEffect(() => {
    setActiveProtoScreenIdx(0);
    setSelectedRoleIdx(0);
    setViewMode('visual');
  }, [definition.id]);

  // Instant UI Change Bar State
  const [instantChangeText, setInstantChangeText] = useState('');
  const [isApplyingInstant, setIsApplyingInstant] = useState(false);

  const handleInstantApply = async (textToApply?: string) => {
    const promptText = textToApply || instantChangeText;
    if (!promptText.trim() || !onAnalyzeChange || !onApplyChange) return;

    setIsApplyingInstant(true);
    try {
      const analysis = await onAnalyzeChange(promptText);
      onApplyChange(analysis);
      setInstantChangeText('');
    } catch (err) {
      console.error('Failed to apply instant UI change:', err);
    } finally {
      setIsApplyingInstant(false);
    }
  };

  // Auto-switch to newly created screen tab whenever definition.screens or changeHistory updates
  const prevChangeCount = React.useRef(definition.changeHistory?.length || 0);
  const prevScreensLength = React.useRef(definition.screens?.length || 0);
  React.useEffect(() => {
    const currentChangeCount = definition.changeHistory?.length || 0;
    const currentLen = definition.screens?.length || 0;
    if (currentChangeCount > prevChangeCount.current || currentLen > prevScreensLength.current) {
      if (currentLen > 0) {
        setActiveProtoScreenIdx(currentLen - 1);
      }
    }
    prevChangeCount.current = currentChangeCount;
    prevScreensLength.current = currentLen;
  }, [definition.changeHistory, definition.screens]);

  // Derive dynamic screens from definition
  const screens = useMemo(() => {
    if (definition?.screens && definition.screens.length > 0) {
      return definition.screens;
    }
    if (definition?.modules && definition.modules.length > 0) {
      return definition.modules.map((m, idx) => ({
        id: `scr-derived-${idx}`,
        name: m.name,
        module: m.name,
        layoutType: 'dashboard' as const,
        components: [
          `${m.name} Header & Metrics`,
          'Status Allocation Grid',
          'Priority Alerts Stream',
          'Interactive Workbench'
        ],
        purpose: m.description,
        confidence: (m.confidence || 'CONFIRMED') as any,
        evidence: [] as string[],
      }));
    }
    return [
      {
        id: 'scr-main',
        name: `${definition.productName || 'Product'} Dashboard`,
        module: 'Core Module',
        layoutType: 'dashboard' as const,
        components: ['Status Overview Panel', 'Primary Data Grid', 'Action Toolbar', 'Notifications Feed'],
        purpose: `Primary operational dashboard for ${definition.productName || 'the product'}`,
        confidence: 'INFERRED' as const,
        evidence: [] as string[],
      }
    ];
  }, [definition]);

  const activeScreenObj = screens[activeProtoScreenIdx] || screens[0];

  // All screens are rendered through ScreenCanvas when they have a UI spec
  const benchmarkScreen = (activeScreenObj as ScreenDefinition).ui
    ? (activeScreenObj as ScreenDefinition & { ui: ScreenUISpec })
    : null;

  // Derive personas/roles from definition
  const roles = useMemo(() => {
    if (definition?.personas && definition.personas.length > 0) {
      return definition.personas.map(p => ({
        name: p.name,
        role: p.role,
        permissions: p.permissions || ['Standard Access']
      }));
    }
    return [
      { name: 'Primary User', role: 'Operator', permissions: ['Standard Access', 'Workflow Execution'] },
      { name: 'Manager / Supervisor', role: 'Manager', permissions: ['Managerial Review', 'Escalations'] },
      { name: 'Audit & Compliance', role: 'Auditor', permissions: ['Read Only Audit Logs'] }
    ];
  }, [definition]);

  const selectedRole = roles[selectedRoleIdx] || roles[0];
  const isReadOnlyRole = selectedRole.permissions.some(p => p.toLowerCase().includes('read only') || p.toLowerCase().includes('auditor'));

  const navItems: ShellNavItem[] = useMemo(
    () => screens.map((s, i) => ({ id: s.id, label: s.name, group: s.module || 'Application', icon: SCREEN_ICONS[i % SCREEN_ICONS.length] })),
    [screens],
  );
  // A sample person for the signed-in user: the prototype is not about the BA using the factory.
  const userDisplayName = ['Priya Raman', 'Marcus Chen', 'Elena García', 'Samuel Okafor', 'Hannah Weber', 'Diego Alvarez'][selectedRoleIdx % 6];
  // Form and phone screens carry their own main button; the page header would repeat it.
  const shellAction = benchmarkScreen && benchmarkScreen.layoutType !== 'form-wizard' && benchmarkScreen.ui.device !== 'phone' ? benchmarkScreen.ui.primaryActions[0] : undefined;
  React.useEffect(() => {
    if (!actionToast) return;
    const t = setTimeout(() => setActionToast(null), 3000);
    return () => clearTimeout(t);
  }, [actionToast]);
  React.useEffect(() => setActionToast(null), [activeProtoScreenIdx]);

  // Derive primary data entity for grid view
  const primaryEntity = useMemo(() => {
    return definition?.dataEntities?.[0] || {
      id: 'de-primary',
      name: `${definition.productName || 'Core'} Record`,
      description: `Primary data entity for ${definition.productName || 'the product'}`,
      fields: [
        { name: 'id', type: 'string', required: true, notes: 'Primary Identifier' },
        { name: 'name', type: 'string', required: true, notes: 'Record Name' },
        { name: 'status', type: 'enum(ACTIVE, PENDING, CLOSED)', required: true, notes: 'Current Status' },
        { name: 'updatedAt', type: 'timestamp', required: false, notes: 'Last Modified' }
      ]
    };
  }, [definition]);

  // Generate sample records for grid view
  const sampleRecords = useMemo(() => {
    const entity = definition?.dataEntities?.[0];
    const fields = entity?.fields || primaryEntity.fields || [];
    const entityName = entity?.name || primaryEntity.name || 'Record';

    return Array.from({ length: 4 }, (_, idx) => {
      const record: Record<string, string> = {};
      record['__id'] = `${entityName.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)}-${1001 + idx}`;
      for (const field of fields.slice(0, 6)) {
        const fname = field.name;
        if (fname.toLowerCase().includes('id')) {
          record[fname] = `${fname.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3)}-${2001 + idx}`;
        } else if (fname.toLowerCase().includes('name') || fname.toLowerCase().includes('title')) {
          record[fname] = `${entityName} ${String.fromCharCode(65 + idx)}`;
        } else if (fname.toLowerCase().includes('status')) {
          record[fname] = ['Active', 'Pending Review', 'In Progress', 'Completed'][idx];
        } else if (fname.toLowerCase().includes('date') || fname.toLowerCase().includes('time') || fname.toLowerCase().includes('at')) {
          record[fname] = new Date(Date.now() - idx * 86400000).toLocaleDateString();
        } else if (field.type?.toLowerCase().includes('number') || field.type?.toLowerCase().includes('numeric')) {
          record[fname] = String(Math.floor(Math.random() * 9000 + 1000));
        } else if (field.type?.toLowerCase().includes('bool')) {
          record[fname] = idx % 2 === 0 ? 'Yes' : 'No';
        } else {
          record[fname] = `${fname.charAt(0).toUpperCase() + fname.slice(1)} Value ${idx + 1}`;
        }
      }
      return record;
    });
  }, [definition, primaryEntity]);

  return (
    <div className="min-h-screen bg-slate-200/70 flex flex-col font-sans">
      {/* Top Banner: Application Controls & Role Switcher */}
      <div className="bg-slate-900 text-white px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-md border-b border-slate-800">
        <div className="flex items-center gap-3">
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            {isGeneratingPrototype ? 'AI THINKING...' : 'PROTOTYPE'}
          </span>
          <span className="text-xs text-slate-300 hidden md:inline truncate max-w-md">
            Product Definition <span className="font-mono text-indigo-300 font-semibold">{definition.version}</span>
          </span>
        </div>

        {/* View Mode Toggle + Role Switcher & Request Change */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* View Mode Segmented Control */}
          <div className="bg-slate-800 p-1 rounded-lg border border-slate-700 flex items-center gap-1">
            <button
              onClick={() => setViewMode('visual')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'visual'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>Application view</span>
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Data & schema</span>
            </button>
          </div>

          <button
            onClick={() => setShowTools((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer ${
              showTools ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
            }`}
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span>Design tools</span>
            {definition.screens.some((sc) => sc.ui?.origin !== 'AI') && <span className="w-2 h-2 rounded-full bg-amber-400" title="Some screens were made by the offline engine" />}
          </button>

          <div className="flex items-center gap-1.5 bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700 text-xs">
            <span className="text-slate-400 text-[11px]">Role:</span>
            <select
              value={selectedRoleIdx}
              onChange={(e) => setSelectedRoleIdx(Number(e.target.value))}
              className="bg-transparent text-white font-medium focus:outline-hidden text-xs cursor-pointer"
            >
              {roles.map((r, idx) => (
                <option key={idx} value={idx} className="bg-slate-900 text-white">
                  {r.name} ({r.role})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={onRequestChangeClick}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow-xs transition-all cursor-pointer"
          >
            <MessageSquarePlus className="w-4 h-4" />
            <span>Request Change</span>
          </button>

          <button
            onClick={onProceedToEngineering}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition-colors cursor-pointer"
          >
            <span>Engineering Pkg</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 max-w-[1600px] w-full mx-auto p-3 sm:p-5 flex flex-col gap-4">
        {showTools && (
          <div className="flex flex-col gap-3">
            {onRedesign && setReferenceImage && (
              <PrototypeDesignBar
                definition={definition}
                referenceImage={referenceImage}
                setReferenceImage={setReferenceImage}
                onRedesign={onRedesign}
                isGenerating={isGeneratingPrototype}
              />
            )}
            <div className="bg-white border border-slate-200 rounded-xl p-2 flex flex-col sm:flex-row items-center gap-2 shadow-2xs">
              <div className="flex items-center gap-2 text-indigo-600 text-xs font-bold pl-2 shrink-0">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>Instant UI Customizer:</span>
              </div>
              <input
                type="text"
                value={instantChangeText}
                onChange={(e) => setInstantChangeText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleInstantApply(); }}
                placeholder="Type any UI change (e.g. 'Add a Cost Calculator screen', 'Add an Emergency button')..."
                className="flex-1 w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 font-medium focus:outline-hidden focus:border-indigo-500"
              />
              <button
                disabled={isApplyingInstant || !instantChangeText.trim()}
                onClick={() => handleInstantApply()}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shrink-0 ${
                  isApplyingInstant || !instantChangeText.trim()
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs cursor-pointer'
                }`}
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isApplyingInstant ? 'Applying…' : 'Apply UI Change'}</span>
              </button>
            </div>
          </div>
        )}

        {/* ── AI THINKING LOADING STATE ── */}
        {isGeneratingPrototype && (
          <div className="bg-slate-900 rounded-2xl p-8 shadow-2xl border border-slate-800 flex flex-col items-center justify-center gap-6 min-h-[500px]">
            {/* Animated thinking visualization */}
            <div className="relative">
              <div className="w-24 h-24 rounded-full border-4 border-indigo-500/20 flex items-center justify-center">
                <div className="w-20 h-20 rounded-full border-4 border-transparent border-t-indigo-500 border-r-purple-500 animate-spin" />
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <Cpu className="w-8 h-8 text-indigo-400" />
              </div>
            </div>

            <div className="text-center space-y-3 max-w-lg">
              <h3 className="text-xl font-bold text-white flex items-center justify-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-400" />
                AI Advanced Thinking Engine
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                Analyzing <span className="font-bold text-indigo-300">"{definition.productName}"</span> requirements 
                and studying UI patterns from leading products to generate domain-specific, 
                high-fidelity screen prototypes...
              </p>
            </div>

            {/* Thinking steps animation */}
            <div className="w-full max-w-md space-y-3">
              {[
                { icon: Search, label: 'Analyzing product domain & business rules', delay: '0s' },
                { icon: Globe, label: referenceImage ? 'Following your reference screen' : 'Researching similar applications on the web', delay: '0.3s' },
                { icon: Layers, label: 'Generating UI blueprints for each screen', delay: '0.6s' },
                { icon: Rocket, label: 'Composing interactive prototype components', delay: '0.9s' },
              ].map((step, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 px-4 py-2.5 bg-slate-800/80 border border-slate-700/60 rounded-xl text-xs animate-pulse"
                  style={{ animationDelay: step.delay, animationDuration: '2s' }}
                >
                  <step.icon className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span className="text-slate-300 font-medium">{step.label}</span>
                  <div className="ml-auto w-3.5 h-3.5 border-2 border-indigo-500/30 border-t-indigo-400 rounded-full animate-spin" />
                </div>
              ))}
            </div>

            <p className="text-[11px] text-slate-500 font-mono">
              Research, then design · this may take 30–90 seconds
            </p>
          </div>
        )}


        {viewMode === 'visual' && !isGeneratingPrototype && (
          <>
            {definition.changeHistory && definition.changeHistory.length > 0 && (
              <div className="px-4 py-2.5 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
                <span><strong>Updated ({definition.version}):</strong> {definition.changeHistory[0].changeRequested}</span>
                <button onClick={onRequestChangeClick} className="font-bold text-emerald-800 hover:underline cursor-pointer">+ Request another change</button>
              </div>
            )}

            <AppShell
              productName={definition.productName}
              tagline={definition.businessUnit}
              nav={navItems}
              activeId={activeScreenObj.id}
              onNavigate={(id) => {
                const i = screens.findIndex((s) => s.id === id);
                if (i >= 0) setActiveProtoScreenIdx(i);
              }}
              userName={userDisplayName}
              userRole={selectedRole.name}
              groupLabel={activeScreenObj.module}
              title={activeScreenObj.name}
              subtitle={activeScreenObj.purpose}
              badge={isReadOnlyRole ? 'View only' : undefined}
              theme={themeFor(definition.productName, definition.uiTheme)}
              primaryAction={
                shellAction
                  ? { label: shellAction, disabled: isReadOnlyRole, onClick: () => setActionToast(`${shellAction} (simulated)`) }
                  : undefined
              }
            >
              {actionToast && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800">{actionToast}</div>
              )}
              {benchmarkScreen ? (
                <ScreenCanvas
                  key={benchmarkScreen.id}
                  screen={benchmarkScreen}
                  readOnly={isReadOnlyRole}
                  entities={definition.dataEntities}
                  actionInHeader={!!shellAction}
                />
              ) : (
                <div className="py-16 text-center text-sm text-slate-500">
                  This screen has no design yet. Go back to the BRD and click Build Prototype.
                </div>
              )}
            </AppShell>

            {definition.designResearch && (
              <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 text-xs text-slate-700 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-indigo-600" /> How the AI designed this prototype
                  </h3>
                  {definition.designResearch.model && <span className="text-[11px] text-slate-500">Research by {definition.designResearch.model}</span>}
                </div>
                {definition.designResearch.comparableApps.length > 0 ? (
                  <div>
                    <div className="font-semibold text-slate-800 mb-1.5">Similar applications it studied first</div>
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      {definition.designResearch.comparableApps.map((a) => (
                        <div key={a.name} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <div className="font-bold text-slate-900">{a.name}</div>
                          <div className="text-[11px] text-slate-500 mb-1.5">{a.category}</div>
                          <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                            {a.whatToBorrow.slice(0, 3).map((w) => <li key={w}>{w}</li>)}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p>No comparable application was found, so the design follows the best general-purpose business applications.</p>
                )}
                <p><span className="font-semibold text-slate-800">Design direction:</span> {definition.designResearch.designDirection}</p>
                {definition.designResearch.sources.length > 0 && (
                  <details>
                    <summary className="cursor-pointer font-semibold text-slate-800">Pages it read ({definition.designResearch.sources.length})</summary>
                    <ul className="mt-1.5 space-y-0.5">
                      {definition.designResearch.sources.map((src) => (
                        <li key={src.url}><a href={src.url} target="_blank" rel="noreferrer" className="text-indigo-700 hover:underline break-all">{src.title}</a></li>
                      ))}
                    </ul>
                  </details>
                )}
                <p className="text-[11px] text-slate-500">Only layout and interaction patterns are borrowed: never another product's name, logo, wording or data.</p>
              </div>
            )}

            <details className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-600">
              <summary className="cursor-pointer font-semibold text-slate-700">
                Prototype notes (not part of the app): where this layout comes from, rules, sample data
              </summary>
              <div className="mt-3 space-y-3">
                {(benchmarkScreen?.ui.benchmarkNote || benchmarkScreen?.confidence === 'INFERRED') && (
                  <p><strong>This screen:</strong> {benchmarkScreen?.ui.benchmarkNote ?? 'Predicted from how comparable products are built; needs BU validation.'}</p>
                )}
                <p>Names, numbers and dates on screen are made-up sample values, not real data.</p>
                {definition.businessRules.length > 0 && (
                  <div>
                    <div className="font-semibold text-slate-700 mb-1">Business rules the app enforces ({definition.businessRules.length})</div>
                    <ul className="space-y-1">
                      {definition.businessRules.slice(0, 6).map((r, i) => (
                        <li key={i}><span className="font-mono font-bold text-indigo-700">{r.code}</span> {r.rule}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </details>
          </>
        )}


        {/* VIEW MODE 2: SCHEMA & DATA GRID VIEW (FOR ANALYSTS & ENGINEERS) */}
        {viewMode === 'grid' && !isGeneratingPrototype && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Dynamic KPI Cards derived 100% from definition */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Functional Scope</div>
                <div className="text-xl font-bold text-slate-900 mt-1 truncate">{definition.modules[0]?.name || definition.productName}</div>
                <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1.5">
                  <span className="text-indigo-600 font-semibold">{definition.modules.length} Modules</span>
                  <span>•</span>
                  <span className="text-emerald-600 font-semibold">{definition.screens.length} Screens</span>
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Governance Rules</div>
                <div className="text-xl font-bold text-slate-900 mt-1">{definition.businessRules.length} Rules Enforced</div>
                <div className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1 truncate">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{definition.businessRules[0]?.code || 'RULE-01'}: Active</span>
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Primary User Journey</div>
                <div className="text-xl font-bold text-slate-900 mt-1 truncate">
                  {definition.userJourneys[0]?.name || 'Standard Workflow'}
                </div>
                <div className="text-[11px] text-amber-600 mt-1 truncate">
                  Actor: {definition.userJourneys[0]?.persona || definition.personas[0]?.name || 'User'}
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Primary Data Entity</div>
                <div className="text-xl font-bold text-slate-900 mt-1 font-mono truncate">
                  {definition.dataEntities[0]?.name || 'Domain Entity'}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  {definition.dataEntities[0]?.fields?.length || 4} Schema Fields Specified
                </div>
              </div>
            </div>

            {/* Dynamic Data Grid Table — derived from actual entity fields */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    {primaryEntity.name} Data Schema Grid
                  </span>
                  <span className="text-xs text-slate-400">({sampleRecords.length} records)</span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-semibold border-b border-slate-200">
                    <tr>
                      <th className="p-3 px-4">Record ID</th>
                      {(primaryEntity.fields || []).slice(0, 5).map((field, fIdx) => (
                        <th key={fIdx} className="p-3 px-4">{field.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {sampleRecords.map((record, rIdx) => (
                      <tr key={rIdx} className="hover:bg-slate-50/70">
                        <td className="p-3 px-4 font-mono font-bold text-indigo-700">{record['__id']}</td>
                        {(primaryEntity.fields || []).slice(0, 5).map((field, fIdx) => (
                          <td key={fIdx} className="p-3 px-4">
                            {field.name.toLowerCase().includes('status') ? (
                              <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                                {record[field.name] || '—'}
                              </span>
                            ) : (
                              <span className={field.name.toLowerCase().includes('id') ? 'font-mono' : ''}>
                                {record[field.name] || '—'}
                              </span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
