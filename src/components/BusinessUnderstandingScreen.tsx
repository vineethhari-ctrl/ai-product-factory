import React, { useState, useEffect, useCallback } from 'react';
import { BusinessUnderstanding, UploadedMaterial, EvidenceItem, ClarificationItem, Audience } from '../types';
import { ANSWERED_BY, AUDIENCE_HINT, AUDIENCE_LABEL, labelClarification, withQuestionAudiences } from '../services/questionAudience';
import { copyToClipboard } from '../services/clipboardUtils';
import { ConfidenceBadge } from './ConfidenceBadge';
import { 
  CheckCircle2, 
  ArrowRight, 
  HelpCircle, 
  AlertTriangle, 
  Copy, 
  Check, 
  X, 
  Eye, 
  FileText,
  MessageSquare,
  Sparkles,
  Layers,
  Users,
  Monitor,
  Clock,
  UserCheck,
  Edit3,
  Send,
  Filter
} from 'lucide-react';

interface BusinessUnderstandingScreenProps {
  understanding: BusinessUnderstanding;
  setUnderstanding?: React.Dispatch<React.SetStateAction<BusinessUnderstanding | null>>;
  uploadedMaterials: UploadedMaterial[];
  onOpenEvidence: (item: EvidenceItem) => void;
  onProceedToDefinition: () => void;
  isGeneratingDefinition: boolean;
}

export const BusinessUnderstandingScreen: React.FC<BusinessUnderstandingScreenProps> = ({
  understanding,
  setUnderstanding,
  uploadedMaterials,
  onOpenEvidence,
  onProceedToDefinition,
  isGeneratingDefinition,
}) => {
  const [isClarificationModalOpen, setIsClarificationModalOpen] = useState(false);
  const [isAnalyzingGaps, setIsAnalyzingGaps] = useState(false);
  const [copied, setCopied] = useState(false);
  const [filterTab, setFilterTab] = useState<'all' | 'open' | 'answered'>('all');
  const [audienceTab, setAudienceTab] = useState<Audience>('BU');
  const [draftAnswers, setDraftAnswers] = useState<Record<string, string>>({});

  // Load ClarificationItems, each labelled for the BU Team or the BA & Tech Team. Projects saved before
  // audiences existed are labelled here; if one side is empty, the standard questions for it are added.
  const getInitialClarifications = useCallback((): ClarificationItem[] => {
    if (understanding?.clarifications && understanding.clarifications.length > 0) {
      return understanding.clarifications.map(labelClarification);
    }

    const primarySource = understanding?.businessObjective?.evidenceReferences?.[0] || 'Uploaded Materials';
    const defaultAskedAt = understanding?.extractedAt || new Date().toISOString();
    const derivedFromConflicts: ClarificationItem[] = (understanding?.conflicts || []).map((item, idx) => ({
      id: item.id || `conflict-${idx}`,
      type: 'BLOCKER: CONTRADICTION' as const,
      question: item.description || item.title,
      impactIfIgnored: `Evidence references: ${item.evidenceReferences?.join(', ') || primarySource}`,
      askedAt: defaultAskedAt,
      status: 'OPEN' as const,
      audience: item.audience,
    }));
    const derivedFromMissing: ClarificationItem[] = (understanding?.missingInformation || []).map((item, idx) => ({
      id: item.id || `missing-${idx}`,
      type: 'HIGH: MISSING LOGIC' as const,
      question: item.description || item.title,
      impactIfIgnored: `Scope gap identified from: ${item.evidenceReferences?.join(', ') || primarySource}`,
      askedAt: defaultAskedAt,
      status: 'OPEN' as const,
      audience: item.audience,
    }));

    const real = (i: EvidenceItem) => i.status !== 'MISSING';
    return withQuestionAudiences(
      { ...understanding, clarifications: [...derivedFromConflicts, ...derivedFromMissing] },
      {
        subject: understanding?.blueprintBrief?.subject || understanding?.dataEntities?.find(real)?.title || 'request',
        stages: understanding?.blueprintBrief?.stages || [],
        role: understanding?.personas?.find(real)?.title,
        module: understanding?.modules?.find(real)?.title,
        productName: understanding?.businessObjective?.title,
      }
    ).clarifications ?? [];
  }, [understanding]);

  const [clarifications, setClarifications] = useState<ClarificationItem[]>(getInitialClarifications);

  useEffect(() => {
    setClarifications(getInitialClarifications());
  }, [getInitialClarifications]);

  const openCount = clarifications.filter(c => c.status === 'OPEN').length;
  const answeredCount = clarifications.filter(c => c.status === 'ANSWERED').length;
  const audienceOf = (c: ClarificationItem): Audience => c.audience ?? 'BU';
  const byAudience = (a: Audience) => clarifications.filter(c => audienceOf(c) === a);
  // The modal shows one team at a time, so each team's list and report stay separate.
  const tabItems = byAudience(audienceTab);
  const tabOpen = tabItems.filter(c => c.status === 'OPEN').length;
  const tabAnswered = tabItems.filter(c => c.status === 'ANSWERED').length;

  const handleOpenClarifications = () => {
    setIsAnalyzingGaps(true);
    setIsClarificationModalOpen(true);
    setTimeout(() => {
      setIsAnalyzingGaps(false);
    }, 500);
  };

  const handleDraftChange = (id: string, text: string) => {
    setDraftAnswers(prev => ({ ...prev, [id]: text }));
  };

  const handleSubmitAnswer = (id: string) => {
    const text = (draftAnswers[id] || '').trim();
    if (!text) return;

    const nowIso = new Date().toISOString();
    const updatedList = clarifications.map(c => {
      if (c.id === id) {
        return {
          ...c,
          status: 'ANSWERED' as const,
          answer: text,
          answeredAt: nowIso,
          answeredBy: ANSWERED_BY[audienceOf(c)]
        };
      }
      return c;
    });

    setClarifications(updatedList);
    setDraftAnswers(prev => ({ ...prev, [id]: '' }));

    if (setUnderstanding) {
      setUnderstanding(prev => prev ? { ...prev, clarifications: updatedList } : prev);
    }
  };

  const handleEditAnswer = (id: string, currentAnswer?: string) => {
    if (currentAnswer) {
      setDraftAnswers(prev => ({ ...prev, [id]: currentAnswer }));
    }
    const updatedList = clarifications.map(c => {
      if (c.id === id) {
        return { ...c, status: 'OPEN' as const };
      }
      return c;
    });

    setClarifications(updatedList);
    if (setUnderstanding) {
      setUnderstanding(prev => prev ? { ...prev, clarifications: updatedList } : prev);
    }
  };

  const handleCopyToEmail = async () => {
    if (tabItems.length === 0) return;

    const openItems = tabItems.filter(c => c.status === 'OPEN');
    const answeredItems = tabItems.filter(c => c.status === 'ANSWERED');

    let reportText = `QUESTIONS FOR THE ${AUDIENCE_LABEL[audienceTab].toUpperCase()} (${AUDIENCE_HINT[audienceTab]})\n`;
    reportText += `Product: ${understanding?.businessObjective?.title || 'Active Initiative'}\n`;
    reportText += `Generated: ${new Date().toLocaleString()}\n`;
    reportText += `Summary: ${answeredItems.length} answered, ${openItems.length} open\n\n`;

    if (openItems.length > 0) {
      reportText += `--- OPEN QUESTIONS ---\n`;
      openItems.forEach((c, idx) => {
        reportText += `${idx + 1}. ${c.question}\n`;
        reportText += `   Why it matters: ${c.impactIfIgnored}\n\n`;
      });
    }

    if (answeredItems.length > 0) {
      reportText += `--- ANSWERED ---\n`;
      answeredItems.forEach((c, idx) => {
        reportText += `${idx + 1}. ${c.question}\n`;
        reportText += `   Answer: ${c.answer}\n`;
        reportText += `   Answered by: ${c.answeredBy || ANSWERED_BY[audienceTab]} on ${c.answeredAt ? new Date(c.answeredAt).toLocaleString() : 'N/A'}\n\n`;
      });
    }

    const success = await copyToClipboard(reportText);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const filteredClarifications = tabItems.filter(c => {
    if (filterTab === 'open') return c.status === 'OPEN';
    if (filterTab === 'answered') return c.status === 'ANSWERED';
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 animate-in fade-in duration-300">

      {understanding.benchmark?.applied && (
        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-violet-600 shrink-0 mt-0.5" />
          <div className="text-sm text-violet-900 space-y-1">
            <div className="font-bold">Industry benchmark applied: {understanding.benchmark.industry}</div>
            <p className="text-xs text-violet-800">
              The material supplied was limited ({understanding.benchmark.reason}), so missing requirements were
              predicted from how comparable organisations and OEMs build this kind of product. Every predicted item is
              marked INFERRED and tagged "Industry benchmark". Please confirm, correct or remove them.
            </p>
          </div>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Reconstructed Successfully
            </span>
            <span className="text-xs text-slate-500 font-mono">{uploadedMaterials.length} sources analyzed</span>
            {answeredCount > 0 && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800 flex items-center gap-1">
                <UserCheck className="w-3.5 h-3.5" /> {answeredCount} Decisions Recorded
              </span>
            )}
          </div>
          <h2 className="text-xl font-bold text-slate-900">Business Understanding</h2>
          <p className="text-sm text-slate-600 max-w-2xl">
            The AI has structured the materials into a coherent model. Review the inferred components below, or answer the clarifications: business questions for the BU Team, technical ones for the BA & Tech Team.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0 flex-wrap">
          {/* Proactive Clarification Button */}
          <button
            onClick={handleOpenClarifications}
            className="px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 font-semibold text-xs rounded-xl shadow-xs flex items-center gap-2 transition-all cursor-pointer relative"
          >
            <HelpCircle className="w-4 h-4 text-amber-600" />
            <span>Clarifications (BU & Tech)</span>
            {openCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                {openCount}
              </span>
            )}
          </button>

          {/* Proceed Button */}
          <button
            onClick={onProceedToDefinition}
            disabled={isGeneratingDefinition}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-xs flex items-center gap-2 transition-all disabled:opacity-70 cursor-pointer"
          >
            {isGeneratingDefinition ? (
              <span className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 animate-pulse" /> Synthesis in progress...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <span>Proceed to Product Definition</span>
                <ArrowRight className="w-4 h-4" />
              </span>
            )}
          </button>
        </div>
      </div>

      {/* 1. Core Summary */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center gap-2 text-indigo-600 font-semibold text-sm uppercase tracking-wider">
          <FileText className="w-4 h-4" />
          <span>Synthesized Executive Summary</span>
        </div>
        <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 border border-slate-100 p-4 rounded-xl">
          {understanding.summary || understanding.overallSummary || understanding.businessObjective?.description}
        </p>
      </div>

      {/* 1.5 Pre-BRD Traceability & Audit Trail Card */}
      {clarifications.length > 0 && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-600 font-semibold text-sm uppercase tracking-wider">
              <HelpCircle className="w-4 h-4" />
              <span>Clarifications: BU Team and BA & Tech Team ({answeredCount} / {clarifications.length} answered)</span>
            </div>
            <button
              onClick={handleOpenClarifications}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
            >
              <span>Manage Q&A in Modal</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {(['BU', 'TECH'] as Audience[]).map((aud) => {
              const items = byAudience(aud);
              return (
                <section key={aud} className={`rounded-xl border p-4 space-y-3 ${aud === 'BU' ? 'border-indigo-200 bg-indigo-50/30' : 'border-slate-300 bg-slate-50/60'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        {aud === 'BU' ? '1. ' : '2. '}{AUDIENCE_LABEL[aud]} <span className="text-slate-500 font-semibold">({items.filter(c => c.status === 'ANSWERED').length}/{items.length} answered)</span>
                      </h3>
                      <p className="text-[11px] text-slate-500">{AUDIENCE_HINT[aud]}{aud === 'BU' ? ' — plain business language, no technical terms' : ''}</p>
                    </div>
                    <button
                      onClick={() => { setAudienceTab(aud); handleOpenClarifications(); }}
                      className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 whitespace-nowrap cursor-pointer"
                    >
                      Answer / copy for email →
                    </button>
                  </div>
                  {items.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">No questions for this team.</p>
                  ) : (
                    <div className="space-y-3">
                      {items.map((item) => (
              <div 
                key={item.id} 
                className={`p-4 rounded-xl border text-xs space-y-2 ${
                  item.status === 'ANSWERED' 
                    ? 'bg-emerald-50/50 border-emerald-200' 
                    : 'bg-amber-50/50 border-amber-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                    item.type.includes('BLOCKER') ? 'bg-rose-100 text-rose-700 border border-rose-200' : 'bg-orange-100 text-orange-700 border border-orange-200'
                  }`}>
                    {item.type}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 ${
                    item.status === 'ANSWERED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {item.status === 'ANSWERED' ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <Clock className="w-3 h-3 text-amber-600" />}
                    {item.status}
                  </span>
                </div>

                <p className="font-semibold text-slate-800">{item.question}</p>

                {item.status === 'ANSWERED' ? (
                  <div className="bg-white p-2.5 rounded-lg border border-emerald-200 text-emerald-950 font-medium space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-emerald-700 font-bold">
                      <span className="flex items-center gap-1"><UserCheck className="w-3 h-3" /> {item.answeredBy || ANSWERED_BY[audienceOf(item)]}</span>
                      <span>{item.answeredAt ? new Date(item.answeredAt).toLocaleString() : ''}</span>
                    </div>
                    <p className="text-xs">"{item.answer}"</p>
                  </div>
                ) : (
                  <p className="text-slate-500 italic">Open — waiting for the {AUDIENCE_LABEL[audienceOf(item)]}.</p>
                )}
              </div>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 2. Personas */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4 md:col-span-1">
          <div className="flex items-center gap-2 text-indigo-600 font-semibold text-sm uppercase tracking-wider">
            <Users className="w-4 h-4" />
            <span>Identified Personas ({understanding.personas.length})</span>
          </div>
          <div className="space-y-3">
            {understanding.personas.map((persona, idx) => {
              const personaTitle = persona.name || persona.title || 'Fleet Persona';
              const personaRole = persona.role || persona.supportingDetail || 'Enterprise Role';
              const personaEvidence = persona.evidenceRef || persona.evidenceReferences?.[0] || 'Source Material';
              return (
                <div key={idx} className="p-3 rounded-xl border border-slate-100 bg-slate-50 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">{personaTitle}</h4>
                      <p className="text-[11px] text-indigo-600">{personaRole}</p>
                    </div>
                    <ConfidenceBadge status={persona.status as any} size="sm" />
                  </div>
                  <p className="text-xs text-slate-600">{persona.description}</p>
                  <button 
                    onClick={() => onOpenEvidence({
                      id: persona.id || `persona-${idx}`,
                      title: personaTitle,
                      description: persona.description,
                      status: persona.status,
                      evidenceReferences: persona.evidenceReferences || [personaEvidence],
                      category: 'Persona'
                    })}
                    className="text-[10px] flex items-center gap-1 text-slate-400 hover:text-indigo-600 cursor-pointer"
                  >
                    <Eye className="w-3 h-3" /> Evidence: {personaEvidence}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* 3. Modules */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4 md:col-span-1">
          <div className="flex items-center gap-2 text-indigo-600 font-semibold text-sm uppercase tracking-wider">
            <Layers className="w-4 h-4" />
            <span>Product Modules ({understanding.modules.length})</span>
          </div>
          <div className="space-y-3">
            {understanding.modules.map((mod, idx) => {
              const modTitle = mod.title || mod.name || 'Product Module';
              const modEvidence = mod.evidenceRef || mod.evidenceReferences?.[0] || 'Specification';
              return (
                <div key={idx} className="p-3 rounded-xl border border-slate-100 bg-slate-50 space-y-2">
                  <div className="flex justify-between items-start">
                    <h4 className="text-xs font-bold text-slate-900">{modTitle}</h4>
                    <ConfidenceBadge status={mod.status as any} size="sm" />
                  </div>
                  <p className="text-xs text-slate-600">{mod.description}</p>
                  <button 
                    onClick={() => onOpenEvidence({
                      id: mod.id || `mod-${idx}`,
                      title: modTitle,
                      description: mod.description,
                      status: mod.status,
                      evidenceReferences: mod.evidenceReferences || [modEvidence],
                      category: 'Module'
                    })}
                    className="text-[10px] flex items-center gap-1 text-slate-400 hover:text-indigo-600 cursor-pointer"
                  >
                    <Eye className="w-3 h-3" /> Evidence: {modEvidence}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* 4. Screens */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4 md:col-span-1">
          <div className="flex items-center gap-2 text-indigo-600 font-semibold text-sm uppercase tracking-wider">
            <Monitor className="w-4 h-4" />
            <span>Identified Screens ({understanding.screens.length})</span>
          </div>
          <div className="space-y-3">
            {understanding.screens.map((screen, idx) => {
              const screenTitle = screen.name || screen.title || 'Identified Screen';
              const screenPath = screen.path || screen.supportingDetail || `/${screenTitle.toLowerCase().replace(/\s+/g, '-')}`;
              const screenEvidence = screen.evidenceRef || screen.evidenceReferences?.[0] || 'UI Layout';
              return (
                <div key={idx} className="p-3 rounded-xl border border-slate-100 bg-slate-50 space-y-2">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-bold text-slate-900">{screenTitle}</h4>
                    <ConfidenceBadge status={screen.status as any} size="sm" />
                  </div>
                  <p className="text-[11px] font-mono text-slate-500 bg-slate-200/50 px-2 py-0.5 rounded inline-block">
                    Path: {screenPath}
                  </p>
                  <div className="pt-1">
                    <button 
                      onClick={() => onOpenEvidence({
                        id: screen.id || `screen-${idx}`,
                        title: screenTitle,
                        description: screen.description,
                        status: screen.status,
                        evidenceReferences: screen.evidenceReferences || [screenEvidence],
                        category: 'Screen'
                      })}
                      className="text-[10px] flex items-center gap-1 text-slate-400 hover:text-indigo-600 cursor-pointer"
                    >
                      <Eye className="w-3 h-3" /> Evidence: {screenEvidence}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Clarification Modal */}
      {isClarificationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white border border-slate-200 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/20 rounded-lg border border-amber-500/30">
                  <HelpCircle className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h2 className="text-base font-semibold">Clarifications for the {AUDIENCE_LABEL[audienceTab]}</h2>
                  <p className="text-xs text-slate-400">
                    {AUDIENCE_HINT[audienceTab]} • {tabItems.length} questions • {tabOpen} open • {tabAnswered} answered
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsClarificationModalOpen(false)} 
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Audience Tabs: each team sees and exports only its own questions */}
            <div className="px-6 pt-3 bg-slate-900 flex items-end gap-1 text-xs">
              {(['BU', 'TECH'] as Audience[]).map((aud) => (
                <button
                  key={aud}
                  onClick={() => { setAudienceTab(aud); setCopied(false); }}
                  className={`px-4 py-2 rounded-t-lg font-semibold cursor-pointer transition-colors ${
                    audienceTab === aud ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {aud === 'BU' ? '1. ' : '2. '}{AUDIENCE_LABEL[aud]} ({byAudience(aud).length})
                </button>
              ))}
            </div>

            {/* Filter Tabs */}
            <div className="px-6 py-2 bg-slate-800 border-b border-slate-700 flex items-center gap-2 text-xs">
              <span className="text-slate-400 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider mr-2">
                <Filter className="w-3 h-3" /> Filter:
              </span>
              <button
                onClick={() => setFilterTab('all')}
                className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                  filterTab === 'all' ? 'bg-amber-500 text-slate-950 shadow-xs' : 'text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
              >
                All ({tabItems.length})
              </button>
              <button
                onClick={() => setFilterTab('open')}
                className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                  filterTab === 'open' ? 'bg-amber-500 text-slate-950 shadow-xs' : 'text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
              >
                Open ({tabOpen})
              </button>
              <button
                onClick={() => setFilterTab('answered')}
                className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                  filterTab === 'answered' ? 'bg-emerald-500 text-slate-950 shadow-xs' : 'text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
              >
                Answered ({tabAnswered})
              </button>
            </div>

            {/* Content Body */}
            <div className="p-6 overflow-y-auto flex-1 bg-slate-50 space-y-4">
              {isAnalyzingGaps ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                  <Sparkles className="w-8 h-8 text-amber-500 animate-pulse" />
                  <p className="text-sm font-medium text-slate-600">Cross-referencing uploaded materials for conflicts & gaps...</p>
                </div>
              ) : filteredClarifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center space-y-3">
                  <div className="p-3 bg-emerald-100 rounded-full text-emerald-600">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-800">
                    {filterTab === 'open' ? 'No remaining open clarifications' : filterTab === 'answered' ? 'No audit trail decisions logged yet' : 'No clarifications required for current materials'}
                  </h3>
                  <p className="text-xs text-slate-500 max-w-md">
                    {filterTab === 'open' ? 'All identified doubts have been answered and logged into the Pre-BRD audit trail.' : 'The AI synthesis engine identified no unresolvable contradictions across your uploaded sources.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredClarifications.map((item) => (
                    <div key={item.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-xs">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider flex items-center gap-1
                          ${item.type.includes('BLOCKER') ? 'bg-rose-100 text-rose-700 border border-rose-200' : ''}
                          ${item.type.includes('HIGH') ? 'bg-orange-100 text-orange-700 border border-orange-200' : ''}
                          ${item.type.includes('MEDIUM') ? 'bg-blue-100 text-blue-700 border border-blue-200' : ''}
                        `}>
                          <AlertTriangle className="w-3 h-3" />
                          {item.type}
                        </span>

                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Asked: {item.askedAt ? new Date(item.askedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 ${
                            item.status === 'ANSWERED' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}>
                            {item.status === 'ANSWERED' ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <Clock className="w-3 h-3 text-amber-600" />}
                            {item.status}
                          </span>
                        </div>
                      </div>
                      
                      <p className="text-sm font-semibold text-slate-800">
                        {item.question}
                      </p>
                      
                      <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-xs text-slate-600 flex items-start gap-2">
                        <MessageSquare className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                        <span><strong>Impact if ignored:</strong> {item.impactIfIgnored}</span>
                      </div>

                      {/* Interactive Q&A Response Box */}
                      {item.status === 'OPEN' ? (
                        <div className="pt-2 space-y-2 border-t border-slate-100">
                          <label className="block text-[11px] font-semibold text-slate-700">
                            Answer from the {ANSWERED_BY[audienceOf(item)]}:
                          </label>
                          <textarea
                            rows={2}
                            value={draftAnswers[item.id] || ''}
                            onChange={(e) => handleDraftChange(item.id, e.target.value)}
                            placeholder={audienceOf(item) === 'BU' ? 'Type the business decision or rule...' : 'Type the technical decision, constraint or design choice...'}
                            className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-900 transition-all outline-hidden"
                          />
                          <div className="flex justify-end">
                            <button
                              onClick={() => handleSubmitAnswer(item.id)}
                              disabled={!(draftAnswers[item.id] || '').trim()}
                              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg flex items-center gap-1.5 shadow-xs cursor-pointer transition-all disabled:opacity-40"
                            >
                              <Send className="w-3.5 h-3.5" />
                              <span>Submit & Record Decision</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Logged Audit Trail Record */
                        <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg text-xs space-y-1.5">
                          <div className="flex items-center justify-between text-[11px] text-emerald-800 font-bold border-b border-emerald-200/60 pb-1">
                            <span className="flex items-center gap-1">
                              <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                              Answered by {item.answeredBy || ANSWERED_BY[audienceOf(item)]}
                            </span>
                            <span className="font-mono text-[10px] text-emerald-700">
                              {item.answeredAt ? new Date(item.answeredAt).toLocaleString() : ''}
                            </span>
                          </div>
                          <p className="text-emerald-950 font-medium leading-relaxed italic">
                            "{item.answer}"
                          </p>
                          <div className="flex justify-end pt-1">
                            <button
                              onClick={() => handleEditAnswer(item.id, item.answer)}
                              className="text-[10px] font-semibold text-indigo-700 hover:text-indigo-900 flex items-center gap-1 cursor-pointer"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>Edit Decision</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-white border-t border-slate-200 flex items-center justify-between flex-wrap gap-2">
              <button
                onClick={() => setIsClarificationModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
              >
                Close & Return
              </button>
              
              <button
                onClick={handleCopyToEmail}
                disabled={isAnalyzingGaps || tabItems.length === 0}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-xs flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-300" />
                    <span>Copied {AUDIENCE_LABEL[audienceTab]} questions!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy {AUDIENCE_LABEL[audienceTab]} questions for email</span>
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};