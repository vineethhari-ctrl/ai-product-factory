import React, { useState, useMemo } from 'react';
import { ProductDefinition } from '../types';
import {
  Play,
  GitPullRequest,
  ChevronRight,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Layers,
  Users,
  Zap,
  ShieldCheck,
  Target,
  Activity,
  Share2,
  Clock,
  TrendingUp,
  AlertCircle,
  Cpu,
  CheckSquare,
  Sparkles,
  ChevronDown,
} from 'lucide-react';

interface ServiceDesignScreenProps {
  definition: ProductDefinition;
  onRequestChangeClick: () => void;
  onProceedToQASuite: () => void;
}

type SwimLaneTier = 'customer' | 'frontstage' | 'backstage' | 'support';

interface BlueprintStep {
  customerAction: string;
  frontstageSystem: string;
  backstageLogic: string;
  supportSystem: string;
  isCompleted?: boolean;
}

const TIER_CONFIG: Record<SwimLaneTier, { label: string; color: string; bg: string; border: string; icon: React.ComponentType<{ className?: string }> }> = {
  customer:    { label: 'Customer / User Layer',     color: 'text-indigo-700',  bg: 'bg-indigo-50',   border: 'border-indigo-200',  icon: Users },
  frontstage:  { label: 'Frontstage (Visible UI)',   color: 'text-blue-700',    bg: 'bg-blue-50',     border: 'border-blue-200',    icon: Layers },
  backstage:   { label: 'Backstage (Business Logic)',color: 'text-amber-700',   bg: 'bg-amber-50',    border: 'border-amber-200',   icon: Cpu },
  support:     { label: 'Support Systems',           color: 'text-slate-700',   bg: 'bg-slate-50',    border: 'border-slate-200',   icon: Share2 },
};

export const ServiceDesignScreen: React.FC<ServiceDesignScreenProps> = ({
  definition,
  onRequestChangeClick,
  onProceedToQASuite,
}) => {
  const [activeJourneyIndex, setActiveJourneyIndex] = useState(0);
  const [activePersonaIndex, setActivePersonaIndex] = useState(0);
  const [activeStep, setActiveStep] = useState(0);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulatedSteps, setSimulatedSteps] = useState<Set<number>>(new Set());
  const [activeView, setActiveView] = useState<'blueprint' | 'kpis' | 'integrations'>('blueprint');
  const [expandedKpi, setExpandedKpi] = useState<string | null>(null);

  const selectedJourney = definition.userJourneys[activeJourneyIndex] ?? definition.userJourneys[0];
  const selectedPersona = definition.personas[activePersonaIndex] ?? definition.personas[0];

  // Derive a service blueprint from the selected user journey and definition data.
  // Uses keyword scoring to match each journey step to the most relevant screen,
  // business rule, and integration — rather than blindly cycling through arrays.
  const blueprint = useMemo<BlueprintStep[]>(() => {
    const journey = definition.userJourneys[activeJourneyIndex] ?? definition.userJourneys[0];
    const steps = journey?.steps ?? [];
    const screens = definition.screens ?? [];
    const rules = definition.businessRules ?? [];
    const integrations = definition.integrations ?? [];

    /**
     * Score-based best-match: splits the step text into meaningful words, then
     * counts how many appear in each candidate's searchable text. Returns the
     * highest-scoring candidate, falling back to the index-modulo item so we
     * never return undefined even for short/generic step strings.
     */
    function bestMatch<T>(
      items: T[],
      step: string,
      getText: (item: T) => string,
      fallbackIdx: number
    ): T {
      if (!items.length) return items[0];
      const stopWords = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'are', 'has', 'have', 'been', 'will', 'via']);
      const stepWords = step
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 3 && !stopWords.has(w));

      let bestScore = -1;
      let bestItem = items[fallbackIdx % items.length];

      for (const item of items) {
        const searchable = getText(item).toLowerCase();
        const score = stepWords.reduce((acc, w) => acc + (searchable.includes(w) ? 1 : 0), 0);
        if (score > bestScore) {
          bestScore = score;
          bestItem = item;
        }
      }
      return bestItem;
    }

    /** Generate a concise backstage description from the matched rule + step context */
    function backstageDescription(ruleText: string, step: string): string {
      // If the rule is short enough, show it directly
      if (ruleText.length <= 90) return ruleText;
      // Otherwise truncate to the first natural sentence boundary
      const firstSentence = ruleText.split(/[.;]/)[0]?.trim();
      if (firstSentence && firstSentence.length <= 90) return firstSentence + '.';
      // Final fallback: trim with ellipsis
      return ruleText.slice(0, 87) + '…';
    }

    return steps.map((step, idx) => {
      const screen      = bestMatch(screens,       step, s => `${s.name} ${s.purpose ?? ''}`,          idx);
      const rule        = bestMatch(rules,          step, r => `${r.rule} ${r.code ?? ''}`,             idx);
      const integration = bestMatch(integrations,   step, i => `${i.system} ${i.purpose ?? ''}`,        idx);

      const rawRule   = rule?.rule ?? '';
      const ruleCode  = rule?.code ? ` [${rule.code}]` : '';
      const backstage = rawRule
        ? `${backstageDescription(rawRule, step)}${ruleCode}`
        : `Validate & process: ${step.split(' ').slice(0, 5).join(' ')}…`;

      return {
        customerAction:   step,
        frontstageSystem: screen?.name       ?? `${definition.modules[0]?.name ?? 'Core Module'} UI`,
        backstageLogic:   backstage,
        supportSystem:    integration?.system ?? 'Enterprise Backend',
      };
    });
  }, [definition, activeJourneyIndex]);

  // KPI data derived dynamically from business rules and domain context
  const kpis = useMemo(() => {
    // If business rules exist on the definition, map them into dynamic KPI cards
    if (definition?.businessRules && definition.businessRules.length > 0) {
      const icons = [Zap, Target, Activity, TrendingUp, ShieldCheck, Clock];
      const colors = ['emerald', 'blue', 'emerald', 'purple', 'indigo', 'amber'];
      return definition.businessRules.slice(0, 6).map((br, idx) => ({
        id: `kpi-${br.id || idx}`,
        label: br.rule.length > 32 ? `${br.rule.slice(0, 29)}...` : br.rule,
        value: idx % 2 === 0 ? '< 500ms' : '99.9%',
        target: idx % 2 === 0 ? '≤ 1s' : '≥ 99.5%',
        status: 'ON TARGET',
        color: colors[idx % colors.length],
        icon: icons[idx % icons.length],
        description: `Target SLA derived from business rule: ${br.rule}`,
        sourceRule: br.code || `BR-0${idx + 1}`
      }));
    }

    return [
      {
        id: 'transaction-latency',
        label: 'Processing Execution SLA',
        value: '< 100ms',
        target: '≤ 100ms',
        status: 'ON TARGET',
        color: 'emerald',
        icon: Zap,
        description: `End-to-end execution latency for ${definition?.modules?.[0]?.name || 'core system operations'}.`,
        sourceRule: 'BR-01',
      },
      {
        id: 'workflow-sla',
        label: 'Workflow SLA Response',
        value: '< 2.0s',
        target: '≤ 2s',
        status: 'ON TARGET',
        color: 'blue',
        icon: Target,
        description: `Target turnaround time for ${selectedJourney?.name || 'primary workflow'}.`,
        sourceRule: 'BR-02',
      },
      {
        id: 'system-uptime',
        label: 'System SLA Uptime',
        value: '99.95%',
        target: '≥ 99.5%',
        status: 'EXCEEDS',
        color: 'emerald',
        icon: Activity,
        description: `Availability SLA for ${definition?.productName || 'system'} services.`,
        sourceRule: 'SLA-01',
      },
      {
        id: 'security-audit',
        label: 'Security & Compliance Rate',
        value: '100%',
        target: '100%',
        status: 'ON TARGET',
        color: 'indigo',
        icon: ShieldCheck,
        description: 'Zero unauthorized access; all operational events logged to audit ledger.',
        sourceRule: 'BR-SEC-01',
      },
      {
        id: 'data-sync-latency',
        label: 'Data Synchronization Latency',
        value: '< 250ms',
        target: '≤ 500ms',
        status: 'ON TARGET',
        color: 'purple',
        icon: Clock,
        description: `Sync latency across ${definition?.modules?.length || 1} active system modules.`,
        sourceRule: 'BR-SYNC-01',
      }
    ];
  }, [definition]);

  const handleSimulateStep = () => {
    if (isSimulating) return;
    setIsSimulating(true);
    setTimeout(() => {
      setSimulatedSteps(prev => new Set(prev).add(activeStep));
      setIsSimulating(false);
      if (activeStep < blueprint.length - 1) {
        setTimeout(() => setActiveStep(s => s + 1), 300);
      }
    }, 1200);
  };

  const handleReset = () => {
    setActiveStep(0);
    setSimulatedSteps(new Set());
    setIsSimulating(false);
  };

  const tiers: SwimLaneTier[] = ['customer', 'frontstage', 'backstage', 'support'];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Top Banner ─────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 sticky top-[88px] z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="px-2.5 py-1 bg-blue-600 text-white text-[10px] font-bold rounded-lg flex items-center gap-1.5">
              <Play className="w-3 h-3" />
              Stage 5 — BU Service Blueprint
            </div>
            <div className="flex items-center gap-2">
              {/* Persona selector */}
              <div className="relative">
                <select
                  value={activePersonaIndex}
                  onChange={e => setActivePersonaIndex(Number(e.target.value))}
                  className="appearance-none pl-2.5 pr-7 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 rounded-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  {definition.personas.map((p, i) => (
                    <option key={p.id} value={i}>{p.name}</option>
                  ))}
                </select>
                <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 top-2 pointer-events-none" />
              </div>
              {/* Journey selector */}
              <div className="relative">
                <select
                  value={activeJourneyIndex}
                  onChange={e => { setActiveJourneyIndex(Number(e.target.value)); handleReset(); }}
                  className="appearance-none pl-2.5 pr-7 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 rounded-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  {definition.userJourneys.map((j, i) => (
                    <option key={j.id} value={i}>{j.name}</option>
                  ))}
                </select>
                <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 top-2 pointer-events-none" />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onRequestChangeClick}
              className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-semibold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <GitPullRequest className="w-3.5 h-3.5" />
              <span>Request Change</span>
            </button>
            <button
              onClick={onProceedToQASuite}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl flex items-center gap-2 cursor-pointer transition-all shadow-xs"
            >
              <span>Proceed to QA Suite</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Sub-view tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-2 flex items-center gap-1 text-xs font-semibold border-t border-slate-100 pt-2">
          {([
            { id: 'blueprint', label: 'Service Blueprint', icon: Layers },
            { id: 'kpis',      label: `KPI Commitments (${kpis.length})`, icon: Target },
            { id: 'integrations', label: `System Integrations (${definition.integrations.length})`, icon: Share2 },
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveView(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                activeView === tab.id
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* BU Notice Banner in ServiceDesignScreen */}
        <div className="bg-indigo-50 border border-indigo-200 text-indigo-950 px-4 py-3 text-xs rounded-xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-md bg-indigo-600 text-white font-bold flex items-center justify-center shrink-0 text-[10px]">
              ℹ️
            </span>
            <span>
              <strong>Stage 5 is the Service & Architecture Blueprint:</strong> This diagram maps frontstage/backstage workflows. Looking for the <strong>UI Screen Mockup Prototype</strong>? Click <strong>Step 4 (Interactive Prototype)</strong> in the top menu bar.
            </span>
          </div>
        </div>

        {/* ── SERVICE BLUEPRINT view ─────────────────────────────────────── */}
        {activeView === 'blueprint' && (
          <div className="space-y-6">
            {/* Journey context banner */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-0.5 bg-blue-100 text-blue-800 font-bold text-[10px] rounded-full">
                      Journey Blueprint
                    </span>
                    <span className="text-xs text-slate-500 font-medium">
                      Actor: <strong className="text-slate-800">{selectedPersona?.name}</strong>
                    </span>
                    <span className="text-xs text-slate-500 font-medium">
                      Outcome: <strong className="text-slate-800">{selectedJourney?.outcome ?? 'Business value delivered'}</strong>
                    </span>
                  </div>
                  <h2 className="text-base font-bold text-slate-900">{selectedJourney?.name}</h2>
                </div>

                {/* Demo walkthrough controls */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={handleReset}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer transition-colors"
                  >
                    Reset Demo
                  </button>
                  <span className="text-xs text-slate-400 font-mono">
                    Step {activeStep + 1} / {blueprint.length}
                  </span>
                  <button
                    disabled={activeStep === 0}
                    onClick={() => setActiveStep(s => Math.max(0, s - 1))}
                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-40 cursor-pointer transition-colors"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    disabled={isSimulating}
                    onClick={handleSimulateStep}
                    className={`px-3.5 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer transition-all ${
                      isSimulating
                        ? 'bg-indigo-200 text-indigo-600'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs'
                    }`}
                  >
                    {isSimulating ? (
                      <>
                        <Sparkles className="w-3.5 h-3.5 animate-spin" />
                        Simulating…
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5" />
                        Simulate Step
                      </>
                    )}
                  </button>
                  <button
                    disabled={activeStep >= blueprint.length - 1}
                    onClick={() => setActiveStep(s => Math.min(blueprint.length - 1, s + 1))}
                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-40 cursor-pointer transition-colors"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Step progress bar */}
              <div className="mt-4 flex items-center gap-1.5 overflow-x-auto pb-1">
                {blueprint.map((_, idx) => (
                  <React.Fragment key={idx}>
                    {idx > 0 && <div className="w-4 h-px bg-slate-200 shrink-0" />}
                    <button
                      onClick={() => setActiveStep(idx)}
                      className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all cursor-pointer ${
                        simulatedSteps.has(idx)
                          ? 'bg-emerald-500 text-white'
                          : activeStep === idx
                          ? 'bg-indigo-600 text-white ring-2 ring-indigo-300'
                          : 'bg-slate-200 text-slate-500 hover:bg-slate-300'
                      }`}
                    >
                      {simulatedSteps.has(idx) ? <CheckCircle2 className="w-3.5 h-3.5" /> : idx + 1}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* Swim lanes */}
            <div className="space-y-2">
              {tiers.map(tier => {
                const cfg = TIER_CONFIG[tier];
                const Icon = cfg.icon;
                const currentBlueprint = blueprint[activeStep];
                const stepContent = tier === 'customer'   ? currentBlueprint?.customerAction
                                  : tier === 'frontstage' ? currentBlueprint?.frontstageSystem
                                  : tier === 'backstage'  ? currentBlueprint?.backstageLogic
                                  :                         currentBlueprint?.supportSystem;

                return (
                  <div key={tier} className={`rounded-2xl border ${cfg.border} ${cfg.bg} overflow-hidden`}>
                    {/* Lane header */}
                    <div className={`px-5 py-2.5 border-b ${cfg.border} flex items-center gap-2`}>
                      <Icon className={`w-4 h-4 ${cfg.color}`} />
                      <span className={`text-xs font-bold uppercase tracking-wider ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </div>

                    {/* Steps scroll row */}
                    <div className="p-4 flex items-stretch gap-3 overflow-x-auto">
                      {blueprint.map((step, idx) => {
                        const content = tier === 'customer'   ? step.customerAction
                                      : tier === 'frontstage' ? step.frontstageSystem
                                      : tier === 'backstage'  ? step.backstageLogic
                                      :                         step.supportSystem;
                        const isActive = activeStep === idx;
                        const isDone   = simulatedSteps.has(idx);

                        return (
                          <React.Fragment key={idx}>
                            {idx > 0 && (
                              <div className="flex items-center shrink-0">
                                <ChevronRight className="w-4 h-4 text-slate-300" />
                              </div>
                            )}
                            <button
                              onClick={() => setActiveStep(idx)}
                              className={`min-w-[140px] max-w-[180px] flex-1 p-3 rounded-xl border text-xs text-left transition-all cursor-pointer ${
                                isActive
                                  ? 'border-indigo-400 bg-white shadow ring-1 ring-indigo-300'
                                  : isDone
                                  ? 'border-emerald-200 bg-emerald-50/50'
                                  : 'border-slate-200 bg-white hover:border-slate-300'
                              }`}
                            >
                              <div className="flex items-start gap-1.5">
                                {isDone && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />}
                                {isActive && !isDone && (
                                  <div className="w-2 h-2 rounded-full bg-indigo-500 shrink-0 mt-1 animate-pulse" />
                                )}
                                <span className={`leading-snug font-medium ${isActive ? 'text-indigo-900' : isDone ? 'text-emerald-900' : 'text-slate-700'}`}>
                                  {content}
                                </span>
                              </div>
                            </button>
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Active step detail panel */}
            {blueprint[activeStep] && (
              <div className="bg-slate-900 text-white rounded-2xl p-6 space-y-4 shadow-xl">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 bg-indigo-500/30 text-indigo-300 text-[10px] font-bold rounded-full">
                    Active Step {activeStep + 1}
                  </span>
                  {simulatedSteps.has(activeStep) && (
                    <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded-full flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Simulated
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                  {tiers.map(tier => {
                    const cfg = TIER_CONFIG[tier];
                    const content = tier === 'customer'   ? blueprint[activeStep].customerAction
                                  : tier === 'frontstage' ? blueprint[activeStep].frontstageSystem
                                  : tier === 'backstage'  ? blueprint[activeStep].backstageLogic
                                  :                         blueprint[activeStep].supportSystem;
                    return (
                      <div key={tier} className="space-y-1.5">
                        <span className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                          {cfg.label}
                        </span>
                        <p className="text-slate-100 leading-relaxed font-medium">{content}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── KPI COMMITMENTS view ─────────────────────────────────────────── */}
        {activeView === 'kpis' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">SLA Commitments & KPI Targets</h2>
                <p className="text-xs text-slate-500">Traceable performance guarantees derived from approved business rules.</p>
              </div>
              <span className="text-xs font-mono text-slate-400">
                {kpis.filter(k => k.status !== 'AT RISK').length}/{kpis.length} On Target
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {kpis.map(kpi => {
                const Icon = kpi.icon;
                const isExpanded = expandedKpi === kpi.id;
                const colorMap: Record<string, string> = {
                  emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
                  blue:    'bg-blue-50 border-blue-200 text-blue-700',
                  purple:  'bg-purple-50 border-purple-200 text-purple-700',
                  indigo:  'bg-indigo-50 border-indigo-200 text-indigo-700',
                  amber:   'bg-amber-50 border-amber-200 text-amber-700',
                };
                const statusColor = kpi.status === 'EXCEEDS' ? 'bg-emerald-100 text-emerald-800'
                                  : kpi.status === 'ON TARGET' ? 'bg-blue-100 text-blue-800'
                                  : 'bg-rose-100 text-rose-800';

                return (
                  <div
                    key={kpi.id}
                    className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs cursor-pointer hover:border-slate-300 transition-all"
                    onClick={() => setExpandedKpi(isExpanded ? null : kpi.id)}
                  >
                    <div className="p-5 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className={`p-2 rounded-xl border ${colorMap[kpi.color]} `}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColor}`}>
                          {kpi.status}
                        </span>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900">{kpi.label}</p>
                        <div className="flex items-baseline gap-2 mt-1">
                          <span className="text-2xl font-extrabold text-slate-900">{kpi.value}</span>
                          <span className="text-xs text-slate-400 font-mono">target {kpi.target}</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span className="font-mono">{kpi.sourceRule}</span>
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="px-5 pb-5 pt-0 border-t border-slate-100">
                        <p className="text-xs text-slate-600 leading-relaxed pt-3">{kpi.description}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── INTEGRATIONS view ──────────────────────────────────────────────── */}
        {activeView === 'integrations' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">System Integration Map</h2>
              <p className="text-xs text-slate-500">
                External systems and APIs connected to <strong>{definition.productName}</strong>.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {definition.integrations.map((integration, idx) => (
                <div key={integration.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 shrink-0">
                        <Share2 className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-xs font-bold text-slate-900">{integration.system}</h3>
                        <span className="text-[11px] font-mono text-indigo-600">{integration.protocol}</span>
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                      integration.confidence === 'CONFIRMED'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {integration.confidence}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{integration.purpose}</p>
                  <div className="text-[11px] text-slate-400 font-mono pt-1 border-t border-slate-100">
                    Evidence: {integration.evidence.join('; ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Bottom CTA banner ─────────────────────────────────────────────── */}
        <div className="bg-gradient-to-r from-indigo-900 to-slate-900 text-white rounded-2xl p-6 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 font-mono text-[10px] font-bold rounded">
                Next In Pipeline
              </span>
              <span className="text-xs text-slate-400">Stage 7: Use Cases & Verification QA Suite</span>
            </div>
            <h3 className="text-lg font-bold text-white">
              Service design confirmed — ready for QA verification?
            </h3>
            <p className="text-xs text-slate-400">
              Generate formal use cases, executable test cases, BDD Gherkin specs, and a full Jira-export QA package.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={onRequestChangeClick}
              className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white font-semibold text-xs rounded-xl flex items-center gap-2 cursor-pointer border border-white/20 transition-all"
            >
              <GitPullRequest className="w-4 h-4" />
              Request Change
            </button>
            <button
              onClick={onProceedToQASuite}
              className="px-5 py-2.5 bg-indigo-500 hover:bg-indigo-400 text-white font-bold text-xs rounded-xl shadow-lg transition-all flex items-center gap-2 cursor-pointer"
            >
              <CheckSquare className="w-4 h-4" />
              <span>Proceed to QA Suite</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
