import React, { useState, useRef, useCallback } from 'react';
import { UploadedMaterial, MaterialType } from '../types';
import { 
  UploadCloud, 
  FileText, 
  Image as ImageIcon, 
  FileSpreadsheet, 
  File, 
  Mic, 
  Trash2, 
  Plus, 
  Sparkles, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle,
  Eye,
  Info,
  RotateCcw
} from 'lucide-react';

interface CreateProductScreenProps {
  productName: string;
  setProductName: (name: string) => void;
  businessUnit: string;
  setBusinessUnit: (unit: string) => void;
  description: string;
  setDescription: (desc: string) => void;
  materials: UploadedMaterial[];
  setMaterials: React.Dispatch<React.SetStateAction<UploadedMaterial[]>>;
  onAnalyze: () => void;
  isAnalyzing: boolean;
  /** Injects the complete Fleet EV/PV Modernization demo dataset across all pipeline stages */
  onLoadEnterpriseDemoPack: () => void;
  /** Clears ONLY the uploaded materials list — leaves all other state untouched */
  onClearMaterials: () => void;
  /** Hard-resets ALL pipeline state, clears storage, and returns to Stage 1 */
  onResetAll: () => void;
}

export const CreateProductScreen: React.FC<CreateProductScreenProps> = ({
  productName,
  setProductName,
  businessUnit,
  setBusinessUnit,
  description,
  setDescription,
  materials,
  setMaterials,
  onAnalyze,
  isAnalyzing,
  onLoadEnterpriseDemoPack,
  onClearMaterials,
  onResetAll,
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [quickTextTitle, setQuickTextTitle] = useState('');
  const [quickTextContent, setQuickTextContent] = useState('');
  const [showQuickText, setShowQuickText] = useState(false);
  const [inspectingMaterial, setInspectingMaterial] = useState<UploadedMaterial | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // A product name alone is enough: thin input is completed from benchmark patterns and flagged for review.
  const canAnalyze = materials.length > 0 || productName.trim().length > 0;

  const getFileType = (filename: string, mime: string): MaterialType => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    if (['png', 'jpg', 'jpeg', 'webp', 'svg'].includes(ext) || mime.startsWith('image/')) return 'image';
    if (ext === 'pdf' || mime.includes('pdf')) return 'pdf';
    if (['ppt', 'pptx'].includes(ext) || mime.includes('presentation')) return 'pptx';
    if (['doc', 'docx'].includes(ext) || mime.includes('word')) return 'docx';
    if (['xls', 'xlsx', 'csv'].includes(ext) || mime.includes('sheet') || mime.includes('csv')) return 'excel';
    if (['mp3', 'wav', 'm4a', 'aac', 'ogg'].includes(ext) || mime.startsWith('audio/')) return 'audio';
    return 'text';
  };

  const handleFiles = (files: FileList | File[]) => {
    const newItems: UploadedMaterial[] = Array.from(files).map((file, idx) => {
      const fileType = getFileType(file.name, file.type);
      return {
        id: `mat-${Date.now()}-${idx}`,
        filename: file.name,
        fileType,
        sizeBytes: file.size,
        uploadedAt: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: 'ready',
        contentSnippet: `[File Content Indexed from ${file.name}] Size: ${(file.size / 1024).toFixed(1)} KB. Stored for cross-material semantic analysis.`
      };
    });

    setMaterials(prev => [...prev, ...newItems]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const [isDemoLoading, setIsDemoLoading] = useState(false);

  const handleLoadSamplePack = useCallback(() => {
    setIsDemoLoading(true);
    // Small setTimeout lets React flush the loading state before the heavier setState cascade
    setTimeout(() => {
      onLoadEnterpriseDemoPack();
      setIsDemoLoading(false);
    }, 80);
  }, [onLoadEnterpriseDemoPack]);

  const handleAddQuickNote = () => {
    if (!quickTextTitle.trim() || !quickTextContent.trim()) return;
    const newMat: UploadedMaterial = {
      id: `mat-${Date.now()}`,
      filename: quickTextTitle.trim().endsWith('.txt') ? quickTextTitle.trim() : `${quickTextTitle.trim()}.txt`,
      fileType: 'text',
      sizeBytes: quickTextContent.length,
      uploadedAt: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'ready',
      contentSnippet: quickTextContent.trim(),
      tags: ['Manual Input', 'Business Note']
    };
    setMaterials(prev => [...prev, newMat]);
    setQuickTextTitle('');
    setQuickTextContent('');
    setShowQuickText(false);
  };

  const removeMaterial = (id: string) => {
    setMaterials(prev => prev.filter(m => m.id !== id));
  };

  const renderTypeIcon = (type: MaterialType) => {
    switch (type) {
      case 'image':
        return <ImageIcon className="w-4 h-4 text-emerald-600" />;
      case 'pdf':
        return <FileText className="w-4 h-4 text-rose-600" />;
      case 'pptx':
        return <FileText className="w-4 h-4 text-amber-600" />;
      case 'docx':
        return <FileText className="w-4 h-4 text-blue-600" />;
      case 'excel':
        return <FileSpreadsheet className="w-4 h-4 text-teal-600" />;
      case 'audio':
        return <Mic className="w-4 h-4 text-purple-600" />;
      default:
        return <File className="w-4 h-4 text-slate-600" />;
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Intro Banner */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl p-6 sm:p-8 shadow-md relative overflow-hidden">
        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-200 border border-indigo-400/30 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            AI-Native Product Definition Engine
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Transform messy, unstructured business materials into verified software prototypes.
          </h1>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
            A business user should <strong className="text-white font-semibold">NOT need to prepare a formal BRD</strong>.
            Upload incomplete presentations, meeting audio transcripts, UI screenshots, and spreadsheets.
            The AI Product Factory reconstructs the requirement with strict evidence citations and confidence scoring.
          </p>

          <div className="pt-2 flex flex-wrap items-center gap-3">
            <button
              onClick={handleLoadSamplePack}
              disabled={isDemoLoading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg shadow-sm transition-all"
            >
              {isDemoLoading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Injecting Demo State…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Load Enterprise Demo Pack (Fleet EV/PV Modernization)
                </>
              )}
            </button>
            <span className="text-xs text-slate-400">
              Pre-loaded with 6 multi-format real business assets
            </span>
          </div>
        </div>

        {/* Ambient subtle decorative shape */}
        <div className="absolute right-0 top-0 bottom-0 w-80 bg-gradient-to-l from-indigo-600/10 to-transparent pointer-events-none" />
      </div>

      {/* BU Self-Explanatory Roadmap Guide */}
      <div className="bg-indigo-50/80 border border-indigo-200 rounded-2xl p-5 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-indigo-600 text-white font-bold flex items-center justify-center text-xs">
              💡
            </span>
            <h3 className="text-sm font-bold text-indigo-950 uppercase tracking-wide">
              How AI Product Factory Works for Business Unit (BU) Users
            </h3>
          </div>
          <span className="text-xs text-indigo-700 font-semibold bg-white px-2.5 py-1 rounded-full border border-indigo-200">
            Self-Explanatory 4-Step Process
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
          <div className="bg-white p-3 rounded-xl border border-indigo-100 shadow-2xs space-y-1">
            <div className="font-bold text-indigo-900 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-[10px]">1</span>
              Upload Materials
            </div>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              Drop any raw notes, emails, slides, or click <strong>Load Enterprise Demo Pack</strong> below.
            </p>
          </div>

          <div className="bg-white p-3 rounded-xl border border-indigo-100 shadow-2xs space-y-1">
            <div className="font-bold text-indigo-900 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-[10px]">2</span>
              Generate BRD
            </div>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              AI automatically structures your <strong>Business Requirements Document (BRD)</strong> with zero manual drafting.
            </p>
          </div>

          <div className="bg-white p-3 rounded-xl border border-indigo-100 shadow-2xs space-y-1">
            <div className="font-bold text-indigo-900 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-[10px]">3</span>
              Test Prototype
            </div>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              Instantly test a live, interactive screen prototype generated directly from your approved BRD.
            </p>
          </div>

          <div className="bg-white p-3 rounded-xl border border-indigo-100 shadow-2xs space-y-1">
            <div className="font-bold text-indigo-900 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-[10px]">4</span>
              Engineering Handoff
            </div>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              Export developer-ready technical blueprints, SQL schemas, and test cases directly to IT.
            </p>
          </div>
        </div>
      </div>

      {/* Screen 1 Form */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Product Metadata Fields */}
        <div className="lg:col-span-1 space-y-5">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
              <Info className="w-4 h-4 text-indigo-600" />
              Product Initiative
            </h2>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Product Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="e.g. Unified Fleet Mobility Command Center"
                className="w-full text-xs px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all placeholder:text-slate-400"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Project / Business Unit <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={businessUnit}
                onChange={(e) => setBusinessUnit(e.target.value)}
                placeholder="e.g. Commercial Logistics Division"
                className="w-full text-xs px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all placeholder:text-slate-400"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Product Description <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Any specific context, business boundaries, or goals known upfront..."
                className="w-full text-xs p-3 rounded-lg border border-slate-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all placeholder:text-slate-400 resize-none"
              />
            </div>

            {/* Quick Note Add Toggle */}
            <div className="pt-2 border-t border-slate-100">
              {!showQuickText ? (
                <button
                  type="button"
                  onClick={() => setShowQuickText(true)}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
                >
                  <Plus className="w-3.5 h-3.5 text-indigo-600" />
                  Paste Unstructured Text / Notes
                </button>
              ) : (
                <div className="space-y-2 p-3 bg-slate-50 rounded-lg border border-slate-200 animate-in fade-in">
                  <div className="text-xs font-semibold text-slate-800">Quick Business Note</div>
                  <input
                    type="text"
                    placeholder="Note title (e.g. Exec_Meeting_Notes.txt)"
                    value={quickTextTitle}
                    onChange={(e) => setQuickTextTitle(e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 rounded border border-slate-300 bg-white"
                  />
                  <textarea
                    rows={4}
                    placeholder="Paste email threads, meeting transcripts, copied bullets..."
                    value={quickTextContent}
                    onChange={(e) => setQuickTextContent(e.target.value)}
                    className="w-full text-xs p-2 rounded border border-slate-300 bg-white resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleAddQuickNote}
                      className="px-3 py-1 bg-indigo-600 text-white rounded text-xs font-medium hover:bg-indigo-500"
                    >
                      Save Note
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowQuickText(false)}
                      className="px-2.5 py-1 text-slate-600 text-xs hover:bg-slate-200 rounded"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action Trigger Card */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Uploaded Sources:</span>
              <span className="font-semibold text-slate-900">{materials.length} files</span>
            </div>
            
            <button
              disabled={!canAnalyze || isAnalyzing}
              onClick={onAnalyze}
              className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold transition-all shadow-sm ${
                canAnalyze && !isAnalyzing
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer shadow-indigo-200'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              {isAnalyzing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Cross-Analyzing Materials...</span>
                </>
              ) : (
                <>
                  <span>Understand Business</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            {materials.length === 0 && (
              <p className={`text-[11px] p-2.5 rounded-lg border leading-normal ${
                canAnalyze
                  ? 'text-indigo-700 bg-indigo-50 border-indigo-200/60'
                  : 'text-amber-700 bg-amber-50 border-amber-200/60'
              }`}>
                {canAnalyze
                  ? 'No files needed: the factory will predict personas, screens, rules and data from how comparable products are built, and mark every prediction for your review. Add files any time for sharper results.'
                  : 'Enter a product name (a one-line description helps), upload business files, or click the Demo Pack button to begin.'}
              </p>
            )}

            {/* ── Permanent global Reset button — always visible ────────── */}
            <button
              type="button"
              onClick={onResetAll}
              className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-rose-200 text-xs font-medium text-rose-600 hover:bg-rose-50 hover:border-rose-300 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset All / New Initiative
            </button>
          </div>
        </div>

        {/* Right Column: Large Upload Area & File Inventory */}
        <div className="lg:col-span-2 space-y-6">
          {/* Large Upload Dropzone */}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 sm:p-10 text-center cursor-pointer transition-all duration-150 ${
              dragActive
                ? 'border-indigo-500 bg-indigo-50/60 scale-[1.005]'
                : 'border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50/50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) handleFiles(e.target.files);
              }}
              accept="image/*,.pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.csv,.txt,audio/*"
            />

            <div className="w-14 h-14 mx-auto rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mb-4 shadow-2xs">
              <UploadCloud className="w-7 h-7" />
            </div>

            <h3 className="text-base font-semibold text-slate-900 mb-1">
              Drag and drop business materials here, or click to browse
            </h3>
            <p className="text-xs text-indigo-700 font-medium max-w-md mx-auto mb-4 bg-indigo-50/70 py-1.5 px-3 rounded-lg border border-indigo-100">
              "Upload whatever business material you have. It does not need to be organised. AI Product Factory will analyse and structure it."
            </p>

            <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-500">
              <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200">Screenshots / UI Captures</span>
              <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200">PPT / PPTX</span>
              <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200">PDF Documents</span>
              <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200">Word DOCX</span>
              <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200">Excel / CSV Data</span>
              <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200">Meeting Notes / Text</span>
              <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200">Audio / Transcripts</span>
            </div>
          </div>

          {/* Uploaded Material Inventory */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Uploaded Business Material Repository
                </span>
                <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-slate-200 text-slate-700">
                  {materials.length}
                </span>
              </div>
              {/* Clear All — scoped to materials list only, visible when files are present */}
              {materials.length > 0 && (
                <button
                  type="button"
                  onClick={onClearMaterials}
                  className="text-xs text-rose-600 hover:text-rose-800 font-medium transition-colors"
                >
                  Clear All
                </button>
              )}
            </div>

            {materials.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                No materials uploaded yet. Drag files into the box above or load the Enterprise Demo Pack.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[380px] overflow-y-auto">
                {materials.map((mat) => (
                  <div 
                    key={mat.id}
                    className="p-3.5 px-5 flex items-center justify-between gap-4 hover:bg-slate-50/80 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 border border-slate-200">
                        {renderTypeIcon(mat.fileType)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900 truncate">
                          {mat.filename}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                          <span className="uppercase font-mono text-[10px] px-1.5 py-0.2 bg-slate-100 rounded text-slate-600">
                            {mat.fileType}
                          </span>
                          <span>{(mat.sizeBytes / 1024).toFixed(1)} KB</span>
                          <span>•</span>
                          <span>{mat.uploadedAt}</span>
                          {mat.tags && mat.tags.length > 0 && (
                            <span className="hidden sm:inline-block text-indigo-600 bg-indigo-50 px-1.5 rounded text-[10px]">
                              {mat.tags[0]}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                        <CheckCircle2 className="w-3 h-3" />
                        Ready
                      </span>
                      <button
                        type="button"
                        onClick={() => setInspectingMaterial(mat)}
                        title="View snippet & metadata"
                        className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100 transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeMaterial(mat.id)}
                        title="Remove file"
                        className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Snippet Preview Drawer / Modal */}
      {inspectingMaterial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                {renderTypeIcon(inspectingMaterial.fileType)}
                <h4 className="text-sm font-semibold text-slate-900 truncate max-w-md">
                  {inspectingMaterial.filename}
                </h4>
              </div>
              <button
                onClick={() => setInspectingMaterial(null)}
                className="text-slate-400 hover:text-slate-700 text-xs font-semibold px-2 py-1"
              >
                Close
              </button>
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                Extracted Content Snippet for AI Ingestion
              </div>
              <pre className="p-3 bg-slate-900 text-slate-200 rounded-lg text-xs font-mono whitespace-pre-wrap max-h-72 overflow-y-auto">
                {inspectingMaterial.contentSnippet || 'No preview available.'}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
