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
} from 'lucide-react';

import { ChangeImpactAnalysis, ScreenDefinition, ScreenUISpec } from '../types';
import { ScreenCanvas } from './ScreenCanvas';

interface PrototypeScreenProps {
  definition: ProductDefinition;
  isGeneratingPrototype?: boolean;
  onRequestChangeClick: () => void;
  onProceedToEngineering: () => void;
  onAnalyzeChange?: (changeRequest: string) => Promise<ChangeImpactAnalysis>;
  onApplyChange?: (analysis: ChangeImpactAnalysis) => void;
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
}) => {
  const [activeProtoScreenIdx, setActiveProtoScreenIdx] = useState<number>(0);
  const [selectedRoleIdx, setSelectedRoleIdx] = useState<number>(0);
  
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
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      {/* Top Banner: Application Controls & Role Switcher */}
      <div className="bg-slate-900 text-white px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-md border-b border-slate-800">
        <div className="flex items-center gap-3">
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            {isGeneratingPrototype ? 'AI THINKING...' : 'LIVE INTERACTIVE PROTOTYPE'}
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
              <span>🎨 Visual UI Mockup</span>
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
              <span>📊 Data & Schema Grid</span>
            </button>
          </div>

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
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 flex flex-col gap-5">
        
        {/* BU Guidance Banner with Instant UI Prompt Bar */}
        <div className="bg-gradient-to-r from-indigo-50 via-purple-50 to-blue-50 border border-indigo-200/80 rounded-2xl p-4 flex flex-col gap-3 text-xs text-indigo-950 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white font-bold flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                <Eye className="w-4 h-4" />
              </div>
              <div className="space-y-0.5">
                <span className="font-bold text-indigo-950 text-sm flex items-center gap-2">
                  {isGeneratingPrototype ? 'AI Advanced Thinking Engine Active' : 'Business Unit Interactive Web Application Screen Preview'}
                  <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-mono text-[10px] font-bold">
                    {isGeneratingPrototype ? 'Generating UI Blueprints...' : viewMode === 'visual' ? 'UI Screen Wireframe Active' : 'Database Grid Active'}
                  </span>
                </span>
                <p className="text-slate-600 text-[11px] leading-relaxed">
                  {isGeneratingPrototype
                    ? `The AI is analyzing "${definition.productName}" requirements and studying leading products to generate domain-specific UI prototypes with advanced thinking...`
                    : viewMode === 'visual'
                    ? `Below is the live visual application screen for "${definition.productName}". Each screen is inspired by leading real-world products. Type any UI change request below to instantly update the UI.`
                    : `Below is the schema & database record breakdown for business Analysts and system engineers.`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={onRequestChangeClick}
                className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-xs cursor-pointer transition-all"
              >
                ✏️ Full Impact Analyzer
              </button>
            </div>
          </div>

          {/* Instant Natural Language UI Change Input Bar */}
          {!isGeneratingPrototype && (
            <div className="bg-white/90 border border-indigo-200 rounded-xl p-2 flex flex-col sm:flex-row items-center gap-2 shadow-2xs">
              <div className="flex items-center gap-2 text-indigo-600 text-xs font-bold pl-2 shrink-0">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>Instant UI Customizer:</span>
              </div>
              <input
                type="text"
                value={instantChangeText}
                onChange={(e) => setInstantChangeText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleInstantApply();
                }}
                placeholder="Type any UI change (e.g., 'Add Service Cost Calculator screen', 'Add Emergency Assistance button', 'Add Voice of Customer tab')..."
                className="flex-1 w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 font-medium focus:outline-hidden focus:border-indigo-500"
              />
              <button
                disabled={isApplyingInstant || !instantChangeText.trim()}
                onClick={() => handleInstantApply()}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shrink-0 cursor-pointer ${
                  isApplyingInstant || !instantChangeText.trim()
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs'
                }`}
              >
                {isApplyingInstant ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Applying UI Change...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>⚡ Apply UI Change</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

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
                { icon: Globe, label: 'Referencing leading industry product patterns', delay: '0.3s' },
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
              Using Gemini Pro with Advanced Thinking • This may take 15–30 seconds
            </p>
          </div>
        )}

        {/* Application Navigation Tabs (Screens) — hidden during generation */}
        {!isGeneratingPrototype && (
          <div className="bg-white rounded-xl shadow-xs border border-slate-200 px-5 py-3 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-xs shadow-2xs">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-900">{definition.productName}</div>
                <div className="text-[10px] text-slate-500">{definition.businessUnit} • {definition.modules.length} Modules</div>
              </div>
            </div>

            {/* Dynamic Screen Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto text-xs font-medium">
              {screens.map((scr, idx) => {
                const isActive = activeProtoScreenIdx === idx;
                const IconComp = SCREEN_ICONS[idx % SCREEN_ICONS.length];
                return (
                  <button
                    key={scr.id || idx}
                    onClick={() => setActiveProtoScreenIdx(idx)}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl transition-all cursor-pointer ${
                      isActive
                        ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <IconComp className="w-3.5 h-3.5" />
                    <span>{scr.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* VIEW MODE 1: VISUAL UI MOCKUP SCREEN — always rendered through ScreenCanvas */}
        {viewMode === 'visual' && !isGeneratingPrototype && (
          <div className="bg-slate-900 rounded-2xl p-2.5 shadow-2xl border border-slate-800 flex flex-col gap-3">
            {/* Simulated Web Application Header Bar */}
            <div className="bg-slate-800 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-white border border-slate-700/60">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-rose-500 inline-block"></span>
                  <span className="w-3 h-3 rounded-full bg-amber-500 inline-block"></span>
                  <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block"></span>
                </div>
                <div className="h-4 w-px bg-slate-700"></div>
                <div className="font-bold text-sm tracking-wide text-indigo-200 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-indigo-400" />
                  <span>{definition.productName}</span>
                </div>
              </div>

              {/* Application Top Bar Controls */}
              <div className="flex items-center gap-3 text-xs">
                <div className="relative hidden sm:block">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder={`Search ${definition.productName || 'records'}...`}
                    className="bg-slate-900/80 text-white font-medium pl-8 pr-3 py-1.5 rounded-lg border border-slate-700 text-xs w-56 focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
                <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 text-xs font-medium">
                  <User className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{selectedRole.name}</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                </div>
              </div>
            </div>

            {/* Application Main Canvas Container */}
            <div className="bg-slate-50 rounded-xl p-4 sm:p-6 text-slate-800 min-h-[550px] flex flex-col gap-6">

              {/* Dynamic Live Applied Change Feedback Banner */}
              {definition.changeHistory && definition.changeHistory.length > 0 && (
                <div className="p-3.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 text-white rounded-xl shadow-md flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center font-bold text-sm shrink-0">
                      ⚡
                    </span>
                    <div>
                      <div className="font-bold text-sm flex items-center gap-2">
                        UI Live Updated ({definition.version})
                        <span className="px-2 py-0.2 rounded-full bg-white/20 text-[10px] font-mono font-bold">
                          Active Version
                        </span>
                      </div>
                      <div className="text-slate-100 text-[11px] truncate max-w-xl">
                        Latest Applied Request: "{definition.changeHistory[0].changeRequested}"
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={onRequestChangeClick}
                      className="px-3 py-1 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-[11px] rounded-lg shadow-xs cursor-pointer transition-all"
                    >
                      + Request Another Change
                    </button>
                  </div>
                </div>
              )}

              {/* UNIFIED SCREEN RENDERER — all screens go through ScreenCanvas */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6 animate-in fade-in">
                {/* Application Screen Header Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-bold bg-indigo-100 text-indigo-800 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                        {activeScreenObj.module || 'Application Module'}
                      </span>
                      <span className="text-xs text-slate-400 font-mono">• Active UI Screen Prototype</span>
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                      {activeScreenObj.name}
                    </h2>
                    <p className="text-xs text-slate-600 max-w-3xl">{activeScreenObj.purpose}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="px-3 py-1 bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-2xs">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Live BU Interactive UI</span>
                    </span>
                  </div>
                </div>

                {/* Render through ScreenCanvas if UI spec exists, otherwise show prompt */}
                {benchmarkScreen ? (
                  <ScreenCanvas key={benchmarkScreen.id} screen={benchmarkScreen} readOnly={isReadOnlyRole} entities={definition.dataEntities} />
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
                    <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
                      <Sparkles className="w-8 h-8 text-slate-400" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-lg font-bold text-slate-700">No UI Blueprint Generated Yet</h3>
                      <p className="text-xs text-slate-500 max-w-md">
                        This screen doesn't have an AI-generated UI blueprint yet. 
                        Navigate back to the Product Definition screen and click "Build Prototype" 
                        to generate rich, domain-adaptive UI mockups powered by advanced AI thinking.
                      </p>
                    </div>
                  </div>
                )}

                {/* Enforced Business Rules Banner */}
                {definition.businessRules.length > 0 && (
                  <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-indigo-950 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                        Enforced Business Governance Rules
                      </span>
                      <span className="text-[10px] text-indigo-700 font-mono font-bold bg-indigo-100 px-2 py-0.5 rounded">
                        {definition.businessRules.length} Active Rules
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {definition.businessRules.slice(0, 3).map((r, rIdx) => (
                        <span key={rIdx} className="px-3 py-1 bg-white border border-indigo-200 text-indigo-950 rounded-lg text-[11px] font-medium shadow-2xs">
                          <strong className="font-mono text-indigo-700">{r.code}:</strong> {r.rule}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>
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
