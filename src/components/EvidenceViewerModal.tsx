import React from 'react';
import { EvidenceItem, UploadedMaterial } from '../types';
import { ConfidenceBadge } from './ConfidenceBadge';
import { X, FileText, CheckCircle, AlertOctagon, HelpCircle, ExternalLink, Sparkles } from 'lucide-react';

interface EvidenceViewerModalProps {
  item: EvidenceItem | null;
  uploadedMaterials: UploadedMaterial[];
  onClose: () => void;
}

export const EvidenceViewerModal: React.FC<EvidenceViewerModalProps> = ({
  item,
  uploadedMaterials,
  onClose,
}) => {
  if (!item) return null;

  // Find matching uploaded files for the cited evidence
  const matchedMaterials = uploadedMaterials.filter(m => 
    (item?.evidenceReferences || []).some(ref => ref && ref.toLowerCase().includes(m.filename.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 sm:p-6 overflow-y-auto">
      <div 
        className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-100 bg-slate-50/70">
          <div className="space-y-1.5 pr-4">
            <div className="flex items-center gap-2.5 flex-wrap">
              <ConfidenceBadge status={item.status} size="md" />
              {item.category && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-200/70 text-slate-700">
                  {item.category}
                </span>
              )}
            </div>
            <h3 className="text-lg font-semibold text-slate-900 leading-snug">
              {item.title}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Main Description */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Extracted Requirement Detail
            </h4>
            <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 p-3.5 rounded-lg border border-slate-100">
              {item.description}
            </p>
          </div>

          {/* Supporting or Contradictory Detail */}
          {item.supportingDetail && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                Contextual Reasoning & Supporting Details
              </h4>
              <p className="text-xs text-slate-600 bg-blue-50/50 p-3 rounded-lg border border-blue-100/70 leading-normal">
                {item.supportingDetail}
              </p>
            </div>
          )}

          {item.contradictions && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-600 mb-1.5 flex items-center gap-1.5">
                <AlertOctagon className="w-3.5 h-3.5" />
                Discrepancy / Policy Collision
              </h4>
              <div className="text-xs text-amber-800 bg-amber-50 p-3.5 rounded-lg border border-amber-200/80 leading-normal">
                {item.contradictions}
              </div>
            </div>
          )}

          {/* Cited Evidence Sources */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Corroborating Evidence Citations ({item.evidenceReferences.length})
            </h4>
            <div className="space-y-2">
              {item.evidenceReferences.map((ref, idx) => (
                <div 
                  key={idx}
                  className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 bg-white hover:border-slate-300 transition-colors"
                >
                  <FileText className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-slate-800 break-words">
                      {ref}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Verifiable audit trail preserved for Antigravity engineering export
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Matched Source File Snippets */}
          {matchedMaterials.length > 0 && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                Underlying Source Snippet Excerpts
              </h4>
              <div className="space-y-2.5">
                {matchedMaterials.map((mat) => (
                  <div 
                    key={mat.id}
                    className="p-3 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono overflow-x-auto border border-slate-800"
                  >
                    <div className="text-[11px] text-indigo-300 pb-1.5 border-b border-slate-800 mb-2 flex items-center justify-between">
                      <span>Source: {mat.filename}</span>
                      <span className="uppercase text-[10px] text-slate-400">{mat.fileType}</span>
                    </div>
                    <pre className="whitespace-pre-wrap text-[11px] leading-relaxed text-slate-300">
                      {mat.contentSnippet || 'Full file content indexed.'}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
            <span>AI Product Factory Evidence Traceability Protocol</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};
