import React, { useState } from 'react';
import { ChangeImpactAnalysis, ProductDefinition } from '../types';
import { 
  GitPullRequest, 
  X, 
  Send, 
  AlertTriangle, 
  CheckCircle2, 
  Sparkles, 
  Layers, 
  Database, 
  Share2, 
  Scale, 
  ShieldCheck, 
  Clock, 
  Monitor, 
  ArrowRight,
  History,
  RotateCcw
} from 'lucide-react';

interface ChangeManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAnalyzeChange: (changeRequest: string) => Promise<ChangeImpactAnalysis>;
  onApplyChange: (analysis: ChangeImpactAnalysis) => void;
  productDefinition: ProductDefinition;
}

export const ChangeManagementModal: React.FC<ChangeManagementModalProps> = ({
  isOpen,
  onClose,
  onAnalyzeChange,
  onApplyChange,
  productDefinition,
}) => {
  const [naturalLanguageInput, setNaturalLanguageInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<ChangeImpactAnalysis | null>(null);
  const [activeTab, setActiveTab] = useState<'new_change' | 'history'>('new_change');

  if (!isOpen) return null;

  const quickPresets = [
    `Add advanced audit logging for ${productDefinition?.productName || 'core operations'}.`,
    `Enable multi-factor authentication for high-privilege administrative roles.`,
    `Add export to CSV/Excel functionality on main reporting screens.`,
    `Enforce mandatory approval workflow before status transitions.`,
  ];

  const handleAnalyze = async (presetText?: string) => {
    const textToAnalyze = presetText || naturalLanguageInput;
    if (!textToAnalyze.trim()) return;

    if (presetText) {
      setNaturalLanguageInput(presetText);
    }

    setIsAnalyzing(true);
    setAnalysisResult(null);
    try {
      const result = await onAnalyzeChange(textToAnalyze);
      setAnalysisResult(result);
    } catch (err) {
      console.error('Failed to analyze change', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApply = () => {
    if (!analysisResult) return;
    onApplyChange(analysisResult);
    // Clear the applied analysis so reopening the modal cannot apply it a second time.
    setAnalysisResult(null);
    setNaturalLanguageInput('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 sm:p-6 overflow-y-auto">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center border border-amber-500/20">
              <GitPullRequest className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Business Change Management & Impact Engine
              </h3>
              <p className="text-xs text-slate-500">
                Target: {productDefinition.productName} ({productDefinition.version})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab(activeTab === 'new_change' ? 'history' : 'new_change')}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
            >
              <History className="w-3.5 h-3.5 text-slate-500" />
              <span>History ({productDefinition.changeHistory?.length || 0})</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {activeTab === 'history' ? (
            /* Change History View */
            <div className="space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Product Evolution & Change History Log
              </h4>
              {(!productDefinition.changeHistory || productDefinition.changeHistory.length === 0) ? (
                <div className="p-8 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  No changes have been applied yet. Submit a natural language request to initiate versioning.
                </div>
              ) : (
                <div className="space-y-3">
                  {productDefinition.changeHistory.map((item: ChangeImpactAnalysis) => {
                    const flattenedAreas = [
                      ...(item.affectedAreas.screens || []).map(s => `Screen: ${s}`),
                      ...(item.affectedAreas.workflows || []).map(w => `Flow: ${w}`),
                      ...(item.affectedAreas.businessRules || []).map(r => `Rule: ${r}`),
                      ...(item.affectedAreas.data || []).map(d => `Data: ${d}`),
                    ];

                    return (
                      <div key={item.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                            {item.versionApplied || 'v1.1'}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {new Date(item.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <div className="text-xs font-semibold text-slate-800">
                          "{item.changeRequested}"
                        </div>
                        <div className="flex flex-wrap gap-1.5 pt-1 text-[11px]">
                          {flattenedAreas.map((areaText: string, idx: number) => (
                            <span key={idx} className="px-2 py-0.5 bg-white rounded border border-slate-200 text-slate-600">
                              {areaText}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* New Change Submission and Impact Analysis View */
            <div className="space-y-6">
              {/* Natural Language Prompt Input */}
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                  Describe Desired Business Change (Natural Language)
                </label>
                <div className="relative">
                  <textarea
                    rows={3}
                    value={naturalLanguageInput}
                    onChange={(e) => setNaturalLanguageInput(e.target.value)}
                    placeholder="e.g. Add Voice of Customer to the customer profile, or allow the same user to access PV and EV."
                    className="w-full text-xs p-3.5 pr-24 rounded-xl border border-slate-300 bg-white leading-relaxed focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all placeholder:text-slate-400 resize-none"
                  />
                  <button
                    disabled={isAnalyzing || !naturalLanguageInput.trim()}
                    onClick={() => handleAnalyze()}
                    className={`absolute right-3 bottom-3 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                      isAnalyzing || !naturalLanguageInput.trim()
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        : 'bg-slate-900 hover:bg-slate-800 text-white cursor-pointer shadow-xs'
                    }`}
                  >
                    {isAnalyzing ? (
                      <>
                        <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Analyzing...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        <span>Analyze Impact</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Quick Presets */}
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <span className="text-[11px] text-slate-400">Quick Test Changes:</span>
                  {quickPresets.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleAnalyze(preset)}
                      className="text-[11px] px-2.5 py-1 rounded-md bg-slate-100 hover:bg-amber-50 hover:text-amber-900 border border-slate-200 transition-colors"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Impact Analysis Result */}
              {analysisResult && (
                <div className="space-y-5 p-5 bg-amber-50/30 border border-amber-200/70 rounded-2xl animate-in fade-in">
                  <div className="flex items-center justify-between pb-3 border-b border-amber-200/60">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-600" />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900">
                        Synthesized Impact Matrix
                      </h4>
                    </div>
                    <span className="text-xs font-mono font-bold text-amber-700 bg-amber-100/70 px-2 py-0.5 rounded">
                      Planned Target: v1.1
                    </span>
                  </div>

                  {/* Formulated New/Changed Requirement */}
                  <div>
                    <h5 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      New / Changed Requirement Formulation
                    </h5>
                    <p className="text-xs text-slate-800 bg-white p-3 rounded-lg border border-slate-200 leading-relaxed font-medium">
                      {analysisResult.newRequirement}
                    </p>
                  </div>

                  {/* Affected Areas Grid */}
                  <div>
                    <h5 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                      Systemic Impact Across Product Layers
                    </h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-slate-800">
                          <Monitor className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Affected Screens</span>
                        </div>
                        <ul className="text-slate-600 list-disc list-inside space-y-0.5 pl-1">
                          {(analysisResult.affectedAreas.screens || []).map((s: string, i: number) => <li key={i}>{s}</li>)}
                        </ul>
                      </div>

                      <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-slate-800">
                          <Layers className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Affected Workflows</span>
                        </div>
                        <ul className="text-slate-600 list-disc list-inside space-y-0.5 pl-1">
                          {(analysisResult.affectedAreas.workflows || []).map((w: string, i: number) => <li key={i}>{w}</li>)}
                        </ul>
                      </div>

                      <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-slate-800">
                          <Scale className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Business Rules Modified</span>
                        </div>
                        <ul className="text-slate-600 list-disc list-inside space-y-0.5 pl-1">
                          {(analysisResult.affectedAreas.businessRules || []).map((r: string, i: number) => <li key={i}>{r}</li>)}
                        </ul>
                      </div>

                      <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-slate-800">
                          <Database className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Data Schema Impact</span>
                        </div>
                        <ul className="text-slate-600 list-disc list-inside space-y-0.5 pl-1">
                          {(analysisResult.affectedAreas.data || []).map((d: string, i: number) => <li key={i}>{d}</li>)}
                        </ul>
                      </div>

                      <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-slate-800">
                          <Share2 className="w-3.5 h-3.5 text-indigo-600" />
                          <span>APIs & Integrations</span>
                        </div>
                        <ul className="text-slate-600 list-disc list-inside space-y-0.5 pl-1">
                          {[
                            ...(analysisResult.affectedAreas.apis || []),
                            ...(analysisResult.affectedAreas.integrations || [])
                          ].map((a: string, i: number) => <li key={i}>{a}</li>)}
                        </ul>
                      </div>

                      <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-slate-800">
                          <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Permissions & Security</span>
                        </div>
                        <ul className="text-slate-600 list-disc list-inside space-y-0.5 pl-1">
                          {(analysisResult.affectedAreas.permissions || []).map((p: string, i: number) => <li key={i}>{p}</li>)}
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* Potential Side Effects */}
                  <div>
                    <h5 className="text-[11px] font-bold uppercase tracking-wider text-rose-700 mb-1 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                      Identified Side Effects & Architectural Risks ({analysisResult.potentialSideEffects.length})
                    </h5>
                    <div className="space-y-1.5">
                      {analysisResult.potentialSideEffects.map((effect, idx) => (
                        <div key={idx} className="p-2.5 bg-rose-50 border border-rose-200/80 rounded-lg text-xs text-rose-900 leading-normal">
                          {effect}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-600 hover:text-slate-900 text-xs font-medium rounded-lg hover:bg-slate-200/60 transition-colors"
          >
            Cancel / Dismiss
          </button>

          {analysisResult && activeTab === 'new_change' && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAnalysisResult(null)}
                className="px-3.5 py-2 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-semibold transition-colors"
              >
                Reject Change
              </button>
              <button
                onClick={handleApply}
                className="inline-flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-xs transition-all"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Apply Change to Prototype & Specs</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
