import React, { useState, useMemo } from 'react';
import { ProductDefinition } from '../types';
import { currentTestSuite } from '../services/testSuite';
import { copyToClipboard } from '../services/clipboardUtils';
import {
  CheckSquare,
  Copy,
  Check,
  ChevronRight,
  ShieldCheck,
  ArrowRight,
  Filter,
  FileCode,
  Terminal,
  Layers,
  AlertTriangle,
  PlayCircle,
  FileCheck,
  Cpu,
  Zap,
  Download,
  ExternalLink,
  Info,
  Clock,
  Sparkles,
  ArrowLeft
} from 'lucide-react';

interface QASuiteScreenProps {
  definition: ProductDefinition;
  onProceedToEngineering: () => void;
  onBackToDefinition?: () => void;
  /** Ask the AI to write the suite from the BRD (the screen shows the rules-based suite until then). */
  onGenerateTests?: () => void;
  isGeneratingTests?: boolean;
}

type TestVectorFilter = 'ALL' | 'POSITIVE' | 'NEGATIVE' | 'BOUNDARY' | 'EDGE';

export const QASuiteScreen: React.FC<QASuiteScreenProps> = ({
  definition,
  onProceedToEngineering,
  onBackToDefinition,
  onGenerateTests,
  isGeneratingTests
}) => {
  const [activeVector, setActiveVector] = useState<TestVectorFilter>('ALL');
  const [activeTab, setActiveTab] = useState<'usecases' | 'matrix' | 'testcases' | 'bdd'>('usecases');
  const [copiedJira, setCopiedJira] = useState(false);
  const [copiedGherkin, setCopiedGherkin] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedUseCase, setExpandedUseCase] = useState<string | null>('UC-001');

  // The suite written by a model when one answered, else derived from the BRD's own rules, records and journeys.
  const suite = useMemo(() => currentTestSuite(definition), [definition]);
  const qaData = useMemo(() => ({
    useCases: suite.useCases,
    testScenarios: suite.scenarios,
    testCases: suite.testCases,
    gherkinFeature: suite.gherkinFeature,
  }), [suite]);

  const filteredTestCases = useMemo(() => {
    return qaData.testCases.filter(tc => {
      const matchesVector = activeVector === 'ALL' || tc.vector === activeVector;
      const matchesSearch = searchQuery === '' || 
        tc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tc.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tc.targetModule.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesVector && matchesSearch;
    });
  }, [qaData.testCases, activeVector, searchQuery]);

  const handleCopyJira = async () => {
    const fullSummary = `=== ENTERPRISE QA SPECIFICATION: ${definition.productName} (${definition.version}) ===\n\n` +
      `1. FORMAL USE CASES (${qaData.useCases.length})\n` +
      qaData.useCases.map(uc => `[${uc.id}] ${uc.title}\nActor: ${uc.primaryActor}\nTrigger: ${uc.trigger}\nPre-condition: ${uc.preCondition}\nFlow:\n${uc.mainFlow.map((s, i) => `  ${i+1}. ${s}`).join('\n')}\nPost-condition: ${uc.postCondition}\nTraceability: ${uc.sourceTraceability}\n`).join('\n') +
      `\n2. TEST SCENARIOS COVERAGE MATRIX (${qaData.testScenarios.length})\n` +
      qaData.testScenarios.map(s => `[${s.id}] [${s.type}] [${s.riskRating} RISK] ${s.objective}\nPayload: ${s.testVector}\nMethod: ${s.verificationMethod}\n`).join('\n') +
      `\n3. EXECUTABLE TEST CASES (${qaData.testCases.length})\n` +
      qaData.testCases.map(tc => `[${tc.id}] [${tc.vector}] ${tc.title}\nPreconditions: ${tc.preconditions}\nPayload:\n${tc.testPayload}\nExpected: ${tc.expectedResult}\n`).join('\n');

    const success = await copyToClipboard(fullSummary);
    if (success) {
      setCopiedJira(true);
      setTimeout(() => setCopiedJira(false), 2500);
    } else {
      // Clipboard access denied — notify without false-positive badge
      console.warn('[QASuiteScreen] Clipboard write failed; check browser permissions or HTTPS context.');
    }
  };

  const handleCopyGherkin = async () => {
    const success = await copyToClipboard(qaData.gherkinFeature);
    if (success) {
      setCopiedGherkin(true);
      setTimeout(() => setCopiedGherkin(false), 2500);
    } else {
      console.warn('[QASuiteScreen] Gherkin clipboard write failed; check browser permissions or HTTPS context.');
    }
  };

  const handleDownloadFeature = () => {
    const blob = new Blob([qaData.gherkinFeature], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(definition.productName || 'product').toLowerCase().replace(/\s+/g, '-')}-suite.feature`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Banner & Enterprise Context */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 bg-indigo-100 text-indigo-800 font-bold text-xs rounded-full flex items-center gap-1">
                <CheckSquare className="w-3.5 h-3.5" /> Step 7: Verification & QA Suite
              </span>
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[11px] font-semibold rounded-md">
                {suite.coverage.rulesCovered} of {suite.coverage.rulesTotal} rules traced to tests
              </span>
              <span className="text-xs font-mono text-slate-500">
                Baseline {definition.version}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Enterprise Use Cases & Verification Suite
            </h1>
            <p className="text-xs text-slate-600 max-w-3xl leading-relaxed">
              Synthesized directly from the approved Product Definition for <strong className="text-slate-900">{definition.productName}</strong> ({definition.businessUnit}).
              Provides end-to-end traceability across formal Use Cases, Positive/Boundary/Negative scenarios, executable test cases, and automated BDD Gherkin specifications.
            </p>
          </div>

          {/* Action CTAs */}
          <div className="flex items-center gap-2.5 flex-wrap shrink-0">
            {onBackToDefinition && (
              <button
                onClick={onBackToDefinition}
                className="px-3.5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold text-xs rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-slate-500" />
                <span>Definition</span>
              </button>
            )}

            <button
              onClick={handleCopyJira}
              className="px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 font-semibold text-xs rounded-xl shadow-xs flex items-center gap-2 cursor-pointer transition-colors"
            >
              {copiedJira ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-indigo-600" />}
              <span>{copiedJira ? 'Copied for Jira!' : 'Copy Test Suite for Jira / UAT'}</span>
            </button>

            <button
              onClick={onProceedToEngineering}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-xs flex items-center gap-2 cursor-pointer transition-all hover:translate-x-0.5"
            >
              <span>Proceed to Engineering Package</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Who wrote this suite, and what it proves */}
        <div className={`rounded-xl border px-4 py-3 text-xs flex flex-wrap items-center justify-between gap-3 ${suite.origin === 'AI' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
          <div className="space-y-0.5">
            <div className="font-bold">
              {suite.origin === 'AI' ? 'Written by the AI from this BRD' : 'Derived from this BRD by rules (not written by the AI)'}
            </div>
            <div className="opacity-90">
              {suite.origin === 'AI'
                ? `Covers ${suite.coverage.rulesCovered} of ${suite.coverage.rulesTotal} business rules, ${suite.coverage.journeysCovered} of ${suite.coverage.journeysTotal} journeys and ${suite.coverage.entitiesCovered} of ${suite.coverage.entitiesTotal} records.${suite.addedForCoverage?.length ? ` The server added tests for ${suite.addedForCoverage.join(', ')}, which the AI left out.` : ''}`
                : 'Every rule, journey and record in the BRD has tests, built from its own fields and statuses. Rule tests tell the tester how to arrange the rule-breaking condition. Press Generate with AI for tests written specifically for this product.'}
            </div>
          </div>
          {onGenerateTests && (
            <button
              onClick={onGenerateTests}
              disabled={isGeneratingTests}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-semibold text-xs rounded-xl shadow-xs flex items-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isGeneratingTests ? 'Writing tests…' : suite.origin === 'AI' ? 'Regenerate with AI' : 'Generate with AI'}</span>
            </button>
          )}
        </div>

        {/* Quality Metrics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Formal Use Cases</span>
            <div className="text-xl font-bold text-slate-900 mt-0.5 flex items-center gap-1.5">
              <span>{qaData.useCases.length}</span>
              <span className="text-[10px] font-normal text-emerald-600 font-sans">Full Lifecycle</span>
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Scenario Vectors</span>
            <div className="text-xl font-bold text-slate-900 mt-0.5 flex items-center gap-1.5">
              <span>{qaData.testScenarios.length}</span>
              <span className="text-[10px] font-normal text-indigo-600 font-sans">Pos / Neg / Bound / Edge</span>
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Executable Test Cases</span>
            <div className="text-xl font-bold text-slate-900 mt-0.5 flex items-center gap-1.5">
              <span>{qaData.testCases.length}</span>
              <span className="text-[10px] font-normal text-emerald-600 font-sans">Ready for Execution</span>
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Business Rule Coverage</span>
            <div className="text-xl font-bold text-slate-900 mt-0.5 flex items-center gap-1.5">
              <span>{suite.coverage.rulesCovered} / {suite.coverage.rulesTotal}</span>
              <span className={`text-[10px] font-normal font-sans ${suite.coverage.rulesCovered === suite.coverage.rulesTotal ? 'text-emerald-600' : 'text-amber-600'}`}>
                rules with a test
              </span>
            </div>
          </div>
        </div>

        {/* Tab Sub-navigation */}
        <div className="flex items-center gap-2 border-t border-slate-100 pt-3 overflow-x-auto text-xs font-semibold">
          {[
            { id: 'usecases', label: `1. Formal Use Cases (${qaData.useCases.length})`, icon: Layers },
            { id: 'matrix', label: `2. Scenario Coverage Matrix (${qaData.testScenarios.length})`, icon: ShieldCheck },
            { id: 'testcases', label: `3. Executable Test Cases (${qaData.testCases.length})`, icon: PlayCircle },
            { id: 'bdd', label: '4. Automated BDD Feature (.feature)', icon: FileCode }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-indigo-400' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* SECTION 1: Formal Use Cases */}
      {activeTab === 'usecases' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Functional Use Cases Derived from BRD Topology</h2>
              <p className="text-xs text-slate-500">Every use case defines primary actors, pre-conditions, system triggers, and step-by-step execution flows.</p>
            </div>
            <span className="text-xs text-slate-400 font-mono">Journeys with a use case: {suite.coverage.journeysCovered} / {suite.coverage.journeysTotal}</span>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {qaData.useCases.map(uc => {
              const isExpanded = expandedUseCase === uc.id;
              return (
                <div
                  key={uc.id}
                  className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs transition-all"
                >
                  <div
                    onClick={() => setExpandedUseCase(isExpanded ? null : uc.id)}
                    className="p-5 flex items-start justify-between gap-4 cursor-pointer hover:bg-slate-50/50 transition-colors"
                  >
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2.5 py-0.5 rounded font-mono font-bold text-xs bg-indigo-100 text-indigo-800">
                          {uc.id}
                        </span>
                        <span className="text-xs font-semibold text-slate-500">
                          Actor: <strong className="text-slate-800">{uc.primaryActor}</strong>
                        </span>
                        <span className="text-[11px] text-slate-400">
                          Trace: {uc.sourceTraceability}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-slate-900">{uc.title}</h3>
                      <p className="text-xs text-slate-600 line-clamp-1">
                        <strong>Trigger:</strong> {uc.trigger}
                      </p>
                    </div>

                    <button className="text-xs font-semibold text-indigo-600 flex items-center gap-1 shrink-0 mt-1">
                      <span>{isExpanded ? 'Collapse' : 'Inspect Steps'}</span>
                      <ChevronRight className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="px-5 pb-5 pt-2 border-t border-slate-100 space-y-4 bg-slate-50/30 text-xs">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Pre-Conditions</span>
                          <p className="text-slate-700">{uc.preCondition}</p>
                        </div>
                        <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Triggering Event</span>
                          <p className="text-slate-700">{uc.trigger}</p>
                        </div>
                      </div>

                      <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 block">
                          Main Success Scenario (Primary Flow)
                        </span>
                        <ol className="space-y-1.5 pl-4 list-decimal text-slate-700">
                          {uc.mainFlow.map((step, idx) => (
                            <li key={idx} className="leading-relaxed">
                              {step}
                            </li>
                          ))}
                        </ol>
                      </div>

                      {uc.alternativeFlows && uc.alternativeFlows.length > 0 && (
                        <div className="bg-amber-50/50 p-3.5 rounded-xl border border-amber-200/80 space-y-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block">
                            Exception & Alternative Branches
                          </span>
                          {uc.alternativeFlows.map((alt, aIdx) => (
                            <div key={aIdx} className="text-slate-700 flex items-start gap-2">
                              <span className="text-amber-700 font-semibold">• {alt.step}:</span>
                              <span>{alt.action}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-800 font-medium">
                        <strong className="block text-[10px] uppercase tracking-wider text-emerald-900 mb-0.5">Post-Condition State:</strong>
                        {uc.postCondition}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SECTION 2: Scenario Coverage Matrix Table */}
      {activeTab === 'matrix' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Scenario Coverage & Risk Categorization Matrix</h3>
                <p className="text-xs text-slate-500">Cross-verifies Positive, Boundary, Negative, and Edge test vectors.</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">Coverage: 100% Core Requirements</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-semibold border-b border-slate-200">
                  <tr>
                    <th className="p-3.5 px-4">Scenario ID</th>
                    <th className="p-3.5 px-4">Vector Type</th>
                    <th className="p-3.5 px-4">Target Module</th>
                    <th className="p-3.5 px-4">Scenario Objective</th>
                    <th className="p-3.5 px-4">Test Vector Payload / Condition</th>
                    <th className="p-3.5 px-4">Risk Rating</th>
                    <th className="p-3.5 px-4">Verification Method</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {qaData.testScenarios.map(sc => (
                    <tr key={sc.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="p-3.5 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                        {sc.id}
                      </td>
                      <td className="p-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            sc.type === 'POSITIVE'
                              ? 'bg-emerald-100 text-emerald-800'
                              : sc.type === 'BOUNDARY'
                              ? 'bg-amber-100 text-amber-800'
                              : sc.type === 'NEGATIVE'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-purple-100 text-purple-800'
                          }`}
                        >
                          {sc.type}
                        </span>
                      </td>
                      <td className="p-3.5 px-4 font-medium text-slate-600 whitespace-nowrap">
                        {sc.module}
                      </td>
                      <td className="p-3.5 px-4 font-medium text-slate-900 max-w-xs">
                        {sc.objective}
                      </td>
                      <td className="p-3.5 px-4 font-mono text-[11px] text-slate-500 max-w-xs">
                        {sc.testVector}
                      </td>
                      <td className="p-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            sc.riskRating === 'CRITICAL'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : sc.riskRating === 'HIGH'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {sc.riskRating}
                        </span>
                      </td>
                      <td className="p-3.5 px-4 text-indigo-700 font-medium whitespace-nowrap">
                        {sc.verificationMethod}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 3: Executable Test Cases */}
      {activeTab === 'testcases' && (
        <div className="space-y-6">
          {/* Filter Bar */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-1.5 flex-wrap w-full sm:w-auto">
              <span className="text-xs font-bold text-slate-500 mr-1 flex items-center gap-1">
                <Filter className="w-3.5 h-3.5" /> Vector:
              </span>
              {(['ALL', 'POSITIVE', 'BOUNDARY', 'NEGATIVE', 'EDGE'] as TestVectorFilter[]).map(vec => (
                <button
                  key={vec}
                  onClick={() => setActiveVector(vec)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    activeVector === vec
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {vec === 'ALL' ? 'All Vectors' : vec}
                </button>
              ))}
            </div>

            <div className="w-full sm:w-64">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search test cases or modules..."
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Test Case Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredTestCases.map(tc => (
              <div
                key={tc.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                          {tc.id}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            tc.vector === 'POSITIVE'
                              ? 'bg-emerald-100 text-emerald-800'
                              : tc.vector === 'BOUNDARY'
                              ? 'bg-amber-100 text-amber-800'
                              : tc.vector === 'NEGATIVE'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-purple-100 text-purple-800'
                          }`}
                        >
                          {tc.vector}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-slate-900 mt-1">{tc.title}</h4>
                      <p className="text-[11px] text-indigo-600 font-medium">Target: {tc.targetModule}</p>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded">
                      {tc.passStatus}
                    </span>
                  </div>

                  <div className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-200/80">
                    <strong className="text-slate-800">Preconditions: </strong>
                    {tc.preconditions}
                  </div>

                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                      Test Input Payload / Parameters:
                    </span>
                    <pre className="bg-slate-900 text-emerald-400 p-2.5 rounded-lg font-mono text-[10px] overflow-x-auto leading-relaxed">
                      {tc.testPayload}
                    </pre>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                      Execution Steps:
                    </span>
                    <ol className="list-decimal pl-4 space-y-1 text-xs text-slate-700">
                      {tc.executionSteps.map((step, sIdx) => (
                        <li key={sIdx}>{step}</li>
                      ))}
                    </ol>
                  </div>
                </div>

                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900">
                  <strong>Expected Result: </strong>
                  <span>{tc.expectedResult}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 4: Automated BDD Gherkin Feature */}
      {activeTab === 'bdd' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-purple-100 text-purple-800 text-[10px] font-bold font-mono rounded">
                  Cucumber / Playwright-BDD
                </span>
                <span className="text-xs text-slate-500 font-semibold">Executable Specification</span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 mt-1">Automated Gherkin Feature Specification</h3>
              <p className="text-xs text-slate-500">
                Plug-and-play feature file ready to drop into Playwright test runners or Cucumber automation pipelines.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleCopyGherkin}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                {copiedGherkin ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedGherkin ? 'Feature Copied!' : 'Copy .feature'}</span>
              </button>

              <button
                onClick={handleDownloadFeature}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download .feature File</span>
              </button>
            </div>
          </div>

          <div className="bg-slate-950 rounded-2xl p-5 border border-slate-800 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800 text-xs text-slate-400 font-mono">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block"></span>
                <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block"></span>
                <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block"></span>
                <span className="ml-2 text-slate-300">tests/features/{(definition?.productName || 'system').toLowerCase().replace(/[^a-z0-9]/g, '_')}_safeguards.feature</span>
              </div>
              <span>Gherkin v6</span>
            </div>

            <pre className="font-mono text-xs text-slate-200 overflow-x-auto leading-relaxed p-2 whitespace-pre">
              {qaData.gherkinFeature}
            </pre>
          </div>
        </div>
      )}

      {/* Bottom Transition Banner */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 font-mono text-[10px] font-bold rounded">
              Next In Pipeline
            </span>
            <span className="text-xs text-slate-400">Step 8: Engineering Package & Code Generation</span>
          </div>
          <h3 className="text-lg font-bold text-white">Ready to proceed to the Engineering Hand-Off Package?</h3>
          <p className="text-xs text-slate-400">
            Export production REST APIs, verified entity schemas, Antigravity deployment manifests, and architectural blueprints.
          </p>
        </div>

        <button
          onClick={onProceedToEngineering}
          className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg transition-all flex items-center gap-2 cursor-pointer shrink-0"
        >
          <span>Proceed to Engineering Package</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
