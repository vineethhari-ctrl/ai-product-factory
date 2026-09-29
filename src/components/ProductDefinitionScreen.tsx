import React, { useState } from 'react';
import { ProductDefinition, ConfidenceStatus } from '../types';
import { constraintSummary, withSystemFields } from '../services/validationEngine';
import { copyToClipboard } from '../services/clipboardUtils';
import { ConfidenceBadge } from './ConfidenceBadge';
import { 
  CheckCircle, 
  FileCheck, 
  Edit3, 
  RotateCcw, 
  Save, 
  Plus, 
  Trash2, 
  Layers, 
  Users, 
  Monitor, 
  Scale, 
  Database, 
  Share2, 
  ShieldCheck, 
  ArrowRight,
  History,
  Lock,
  Mail,
  Calendar,
  Send,
  X,
  FileText,
  Diff,
  CheckSquare,
  Copy,
  Check,
  Sparkles,
  BookOpen,
  Cpu,
  Target,
  FileSpreadsheet
} from 'lucide-react';

interface ProductDefinitionScreenProps {
  definition: ProductDefinition;
  setDefinition: React.Dispatch<React.SetStateAction<ProductDefinition | null>>;
  onApproveDefinition: () => void;
  onRegenerate: () => void;
  isRegenerating: boolean;
  onBuildPrototype: () => void;
  onNavigateToQASuite?: () => void;
}

export const ProductDefinitionScreen: React.FC<ProductDefinitionScreenProps> = ({
  definition,
  setDefinition,
  onApproveDefinition,
  onRegenerate,
  isRegenerating,
  onBuildPrototype,
  onNavigateToQASuite,
}) => {
  /**
   * Format a date string for display. Handles both legacy locale strings
   * (e.g. "9/18/2026, 11:30 AM") and new ISO 8601 strings gracefully.
   */
  const formatDate = (dateStr: string): string => {
    try {
      const d = new Date(dateStr);
      // Check if d is a valid date
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
      });
    } catch {
      return dateStr;
    }
  };
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<
    'brd' | 'overview' | 'approach' | 'personas' | 'screens' | 'rules' | 'data' | 'integrations' | 'governance' | 'history' | 'tests'
  >('brd');
  const [saveToast, setSaveToast] = useState(false);

  // Version Baseline & Sign-off State
  const [isLockModalOpen, setIsLockModalOpen] = useState(false);
  const [stakeholderEmails, setStakeholderEmails] = useState<string[]>(
    (definition as any).stakeholderEmails || [
      `lead.${(definition.businessUnit || 'bu').toLowerCase().replace(/[^a-z0-9]/g, '')}@enterprise.com`,
      `product.${(definition.productName || 'app').toLowerCase().replace(/[^a-z0-9]/g, '')}@enterprise.com`
    ]
  );
  const [newEmailInput, setNewEmailInput] = useState('');
  const [signOffNote, setSignOffNote] = useState('Official BU Review sign-off and baseline freeze.');
  const [isLocking, setIsLocking] = useState(false);
  const [lockToastMessage, setLockToastMessage] = useState<string | null>(null);
  const [copiedApproach, setCopiedApproach] = useState(false);
  const [copiedTests, setCopiedTests] = useState(false);
  const [copiedBRD, setCopiedBRD] = useState(false);

  // Version History Ledger
  const [versionHistory, setVersionHistory] = useState<any[]>(
    (definition as any).versionHistory || [
      {
        version: 'v1.0',
        lockedAt: formatDate(definition.lastUpdated || new Date().toISOString()),
        signedOffBy: [`lead.${(definition.businessUnit || 'bu').toLowerCase().replace(/[^a-z0-9]/g, '')}@enterprise.com`],
        signOffNotes: `Initial requirement baseline for ${definition.productName}.`,
        status: 'Active Baseline',
        changesDelta: {
          added: definition.modules?.slice(0, 2).map(m => m.name) || ['Core System Baseline'],
          modified: ['Initial role definitions'],
          removed: []
        }
      }
    ]
  );

  // Automated Synthesized Approach Note Data derived dynamically from active definition
  const approachNote = {
    docId: `APN-${(definition.productName || 'SYS').replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase()}-01`,
    status: "DRAFT FOR ARCHITECTURE REVIEW",
    executiveSummary: definition.objective || 
      `The primary driver of ${definition.productName || 'this initiative'} is to streamline operational processes for ${definition.businessUnit || 'the enterprise'}, eliminate manual workarounds, and establish single-pane governance across business modules.`,
    asIsProblemStatement: (definition.assumptions && definition.assumptions.length > 0)
      ? definition.assumptions.map(a => a.statement)
      : [
          `Fragmented tools and manual tracking lead to delayed visibility in ${definition.businessUnit || 'operations'}.`,
          `Lack of unified data validation causes compliance risks and operational bottlenecks.`,
          `Cross-functional teams lack real-time status updates and standardized workflow execution.`
        ],
    toBeTargetArchitecture: (definition.modules && definition.modules.length > 0)
      ? [
          `Unified Event-Driven Web Platform implementing ${definition.modules.map(m => m.name).join(', ')}.`,
          `Role-based security framework ensuring ${definition.personas?.map(p => p.name).join(', ') || 'authorized users'} operate within permissible scopes.`,
          `Centralized data governance and automated rule enforcement for ${definition.productName || 'the platform'}.`
        ]
      : [
          `Unified Web Application consolidating core business processes into a centralized dashboard.`,
          `High-reliability architecture with automated data validation and workflow execution.`,
          `Enterprise RBAC ensuring operational safety and strict audit trails across all modules.`
        ],
    phasedExecutionStrategy: [
      {
        phase: "Phase 1: Minimum Viable Product (MVP)",
        focus: definition.modules?.[0] 
          ? `Deploy ${definition.modules[0].name} module with core user workflows and RBAC controls.`
          : `Deploy core dashboard and primary business workflow engine.`,
        timeline: "Sprint 1 - 3"
      },
      {
        phase: "Phase 2: Full Enterprise Rollout",
        focus: definition.modules?.[1]
          ? `Extend capabilities with ${definition.modules[1].name} and system integrations.`
          : `Enable advanced reporting, external system integrations, and full automation.`,
        timeline: "Sprint 4 - 6"
      }
    ],
    keyRisksAndMitigations: (definition.openQuestions && definition.openQuestions.length > 0)
      ? definition.openQuestions.map(q => ({
          risk: q.question,
          mitigation: `Structured discovery and automated rule enforcement during sprint planning.`
        }))
      : [
          {
            risk: `User onboarding and change management during legacy system transition.`,
            mitigation: `Phased rollout with dual-run verification and interactive role-based UI guides.`
          },
          {
            risk: `Data synchronization latency across legacy endpoints.`,
            mitigation: `Asynchronous queue-based integration architecture with retry mechanisms.`
          }
        ]
  };

  // Dynamic Use Cases & Test Scenarios Data
  const qaPackage = {
    useCases: (definition.userJourneys && definition.userJourneys.length > 0)
      ? definition.userJourneys.map((uj, idx) => ({
          id: uj.id || `UC-00${idx + 1}`,
          title: uj.name || `User Workflow ${idx + 1}`,
          primaryActor: uj.persona || definition.personas?.[0]?.name || 'Primary User',
          preCondition: `User is logged in and authorized for ${definition.productName || 'the system'}.`,
          trigger: `User initiates ${uj.name} action from dashboard.`,
          mainFlow: (uj.steps && uj.steps.length > 0) 
            ? uj.steps 
            : [`Access screen`, `Input required data`, `Submit for validation`, `System confirms update`],
          postCondition: uj.outcome || `Action completes successfully with audit trace.`
        }))
      : (definition.screens && definition.screens.length > 0)
      ? definition.screens.slice(0, 3).map((scr, idx) => ({
          id: `UC-00${idx + 1}`,
          title: `Execute ${scr.name} Workflow`,
          primaryActor: definition.personas?.[0]?.name || 'Operational User',
          preCondition: `User has permission to view ${scr.name}.`,
          trigger: `User navigates to ${scr.name} module.`,
          mainFlow: [
            `Navigate to ${scr.name} screen.`,
            `System loads component details: ${scr.components?.join(', ') || 'Data fields'}.`,
            `Perform primary business action and save.`,
            `System updates data store.`
          ],
          postCondition: `${scr.name} state updated and saved.`
        }))
      : [
          {
            id: "UC-001",
            title: `Execute ${definition.productName || 'System'} Dashboard Action`,
            primaryActor: definition.personas?.[0]?.name || "System User",
            preCondition: "User is authenticated and has valid permissions.",
            trigger: "User performs record modification or status trigger.",
            mainFlow: [
              "User navigates to main workflow page.",
              "System renders active data entities and validation rules.",
              "User confirms submission.",
              "System processes payload and returns success."
            ],
            postCondition: "Record is updated and visible in audit history."
          }
        ],
    testScenarios: (definition.businessRules && definition.businessRules.length > 0)
      ? definition.businessRules.map((br, idx) => ({
          id: `TC-00${idx + 1}`,
          type: idx % 2 === 0 ? "POSITIVE / HAPPY PATH" : "BOUNDARY / THRESHOLD",
          module: br.code || definition.modules?.[0]?.name || "Core Module",
          title: `Verify rule: ${br.rule}`,
          testData: `Context: ${br.context || 'Standard Input Payload'}`,
          expectedResult: `System validates rule "${br.rule}" without error.`
        }))
      : [
          {
            id: "TC-001",
            type: "POSITIVE / HAPPY PATH",
            module: definition.modules?.[0]?.name || "Core System",
            title: `Verify ${definition.productName || 'System'} standard data submission flow`,
            testData: "Valid input payload matching schema",
            expectedResult: "State updates cleanly; audit record generated."
          },
          {
            id: "TC-002",
            type: "BOUNDARY / THRESHOLD",
            module: definition.modules?.[0]?.name || "Core System",
            title: "Verify validation error on invalid input",
            testData: "Empty or malformed payload fields",
            expectedResult: "System halts submission and renders clear validation feedback."
          }
        ]
  };

  const handleFieldChange = (field: keyof ProductDefinition, val: any) => {
    setDefinition(prev => prev ? ({ ...prev, [field]: val }) : null);
  };

  const handleSave = () => {
    setIsEditing(false);
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 3000);
  };

  const handleAddEmail = () => {
    if (newEmailInput && newEmailInput.includes('@') && !stakeholderEmails.includes(newEmailInput.trim())) {
      setStakeholderEmails([...stakeholderEmails, newEmailInput.trim()]);
      setNewEmailInput('');
    }
  };

  const handleRemoveEmail = (emailToRemove: string) => {
    setStakeholderEmails(stakeholderEmails.filter(e => e !== emailToRemove));
  };

  const handleLockBaseline = () => {
    setIsLocking(true);
    setTimeout(() => {
      // Store an ISO 8601 timestamp for timezone-agnostic audit traceability
      const now = new Date().toISOString();
      const currentVer = definition.version || 'v1.0';
      const cleanVer = currentVer.replace('v', '').split('.');
      const nextVer = `v${(parseInt(cleanVer[0], 10) || 1) + 1}.0`;

      const newSnapshot = {
        version: nextVer,
        lockedAt: now,
        signedOffBy: [...stakeholderEmails],
        signOffNotes: signOffNote,
        status: 'Active Baseline (Locked)',
        changesDelta: {
          added: definition.modules?.slice(0, 2).map(m => m.name) || [
            `${definition.productName} Core Dashboard`,
            'Automated Data Engine'
          ],
          modified: [
            `Updated RBAC permissions for ${definition.personas?.[0]?.name || 'Primary Role'}`
          ],
          removed: [
            'Legacy manual workflow steps'
          ]
        }
      };

      setVersionHistory([newSnapshot, ...versionHistory]);
      setDefinition(prev => prev ? ({
        ...prev,
        version: nextVer,
        isApproved: true,
        lockedDate: now,
        stakeholderEmails: stakeholderEmails,
        versionHistory: [newSnapshot, ...versionHistory]
      }) as any : null);

      setIsLocking(false);
      setIsLockModalOpen(false);
      setLockToastMessage(`BRD baseline frozen at ${nextVer}! Dispatched with highlighted changes to ${stakeholderEmails.length} BU emails.`);
      setTimeout(() => setLockToastMessage(null), 5000);
    }, 1200);
  };

  const handleCopyApproachNote = async () => {
    const text = `=== SOLUTION APPROACH NOTE: ${definition.productName} ===\nDoc ID: ${approachNote.docId} | Version: ${definition.version}\n\n1. EXECUTIVE SUMMARY\n${approachNote.executiveSummary}\n\n2. AS-IS CURRENT CHALLENGES\n${approachNote.asIsProblemStatement.map(p => `• ${p}`).join('\n')}\n\n3. TO-BE PROPOSED ARCHITECTURE & SOLUTION\n${approachNote.toBeTargetArchitecture.map(t => `• ${t}`).join('\n')}\n\n4. PHASED ROLLOUT ROADMAP\n${approachNote.phasedExecutionStrategy.map(ph => `${ph.phase}: ${ph.focus} (${ph.timeline})`).join('\n')}\n\n5. IDENTIFIED RISKS & MITIGATIONS\n${approachNote.keyRisksAndMitigations.map(r => `Risk: ${r.risk}\nMitigation: ${r.mitigation}`).join('\n\n')}`;
    
    const success = await copyToClipboard(text);
    if (success) {
      setCopiedApproach(true);
      setTimeout(() => setCopiedApproach(false), 2500);
    } else {
      console.warn('[ProductDefinitionScreen] Approach note clipboard write failed.');
    }
  };

  const handleCopyTestCases = async () => {
    const textData = `=== TEST SUITE: ${definition.productName} (${definition.version}) ===\n\n` +
      qaPackage.testScenarios.map(tc => `[${tc.id}] [${tc.type}] [${tc.module}] ${tc.title}\nData: ${tc.testData}\nExpected: ${tc.expectedResult}\n`).join('\n');

    const success = await copyToClipboard(textData);
    if (success) {
      setCopiedTests(true);
      setTimeout(() => setCopiedTests(false), 2500);
    } else {
      console.warn('[ProductDefinitionScreen] Test suite clipboard write failed.');
    }
  };

  const handleCopyBRDText = async () => {
    const text = `=== BUSINESS REQUIREMENTS DOCUMENT (BRD) ===\nProduct: ${definition.productName}\nBusiness Unit: ${definition.businessUnit}\nVersion: ${definition.version}\nStatus: ${definition.isApproved ? 'Approved & Frozen' : 'Draft for BU Review'}\n\n1. EXECUTIVE SUMMARY & OBJECTIVES\n${definition.objective}\n\n2. FUNCTIONAL MODULES\n${definition.modules.map((m, idx) => `2.${idx + 1} ${m.name}\n${m.description}`).join('\n\n')}\n\n3. USER PERSONAS & SECURITY ACCESS (RBAC)\n${definition.personas.map(p => `• ${p.name} (${p.role}): ${p.keyGoals.join('; ')} | Permissions: ${p.permissions.join(', ')}`).join('\n')}\n\n4. BUSINESS GOVERNANCE RULES\n${definition.businessRules.map(r => `• [${r.code || 'RULE'}] ${r.rule} (Context: ${r.context})`).join('\n')}\n\n5. DATA ENTITIES\n${definition.dataEntities.map(d => `• ${d.name}: ${d.description}`).join('\n')}\n\n6. INTEGRATIONS\n${definition.integrations.map(i => `• ${i.system} (${i.protocol}): ${i.purpose}`).join('\n')}`;

    const success = await copyToClipboard(text);
    if (success) {
      setCopiedBRD(true);
      setTimeout(() => setCopiedBRD(false), 2500);
    }
  };

  /** BU review of a field: confirm an inferred one, or flip whether it is required. */
  const updateField = (entityId: string, fieldName: string, patch: { origin?: 'BU'; required?: boolean }) =>
    setDefinition(prev => prev ? ({
      ...prev,
      dataEntities: prev.dataEntities.map(e => e.id === entityId
        ? { ...e, fields: e.fields.map(f => f.name === fieldName ? { ...f, ...patch } : f) }
        : e),
    }) : null);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {definition.benchmark?.applied && (
        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-violet-600 shrink-0 mt-0.5" />
          <div className="text-xs text-violet-900 space-y-1">
            <div className="text-sm font-bold">Predicted from {definition.benchmark.industry} industry patterns</div>
            <p>
              Because BU input was limited, screens, rules and entities marked INFERRED were benchmarked against comparable
              products. Review the blocking open question and validate them before sign-off.
            </p>
          </div>
        </div>
      )}
      {/* Save Toast */}
      {saveToast && (
        <div className="fixed top-20 right-6 z-50 bg-slate-900 text-white text-xs px-4 py-2.5 rounded-lg shadow-xl flex items-center gap-2 border border-slate-700 animate-in fade-in slide-in-from-top-2">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span>Product Definition changes saved successfully.</span>
        </div>
      )}

      {/* Lock Toast */}
      {lockToastMessage && (
        <div className="fixed top-20 right-6 z-50 bg-indigo-950 text-white text-xs px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 border border-indigo-700 animate-in fade-in slide-in-from-top-2">
          <Mail className="w-4 h-4 text-indigo-400 shrink-0" />
          <span>{lockToastMessage}</span>
        </div>
      )}

      {/* BU Self-Explanatory Guidance Box */}
      <div className="bg-indigo-50/90 border border-indigo-200 rounded-2xl p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-start gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white font-bold flex items-center justify-center shrink-0 text-xs mt-0.5 shadow-2xs">
            💡
          </div>
          <div>
            <span className="font-bold text-indigo-950 text-sm">Business Requirements Document (BRD) Ready</span>
            <p className="text-slate-600 text-[11px] leading-relaxed mt-0.5">
              Below is your formal <strong>BRD Document</strong> synthesized directly from your business materials. Review the sections, or click <strong>Approve BRD</strong> to launch your live interactive prototype.
            </p>
          </div>
        </div>
        {!definition.isApproved ? (
          <button
            onClick={onApproveDefinition}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-xs transition-all shrink-0 cursor-pointer"
          >
            ✓ Approve BRD & Build Prototype
          </button>
        ) : (
          <button
            onClick={onBuildPrototype}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-xs transition-all shrink-0 flex items-center gap-1.5 cursor-pointer"
          >
            <span>Launch Prototype</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-7 shadow-2xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                Specification {definition.version}
              </span>
              {definition.isApproved ? (
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Locked & Approved by Business
                </span>
              ) : (
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                  Draft Specification (Pending Business Sign-off)
                </span>
              )}
              {(definition as any).lockedDate && (
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-slate-400" /> Locked: {formatDate((definition as any).lockedDate)}
                </span>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              {definition.productName}
            </h1>
            <p className="text-xs text-slate-500">
              Unit: {definition.businessUnit} • Last updated: {new Date(definition.lastUpdated).toLocaleString()}
            </p>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            {isEditing ? (
              <button
                onClick={handleSave}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                Save Changes
              </button>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                Edit
              </button>
            )}

            {/* Approach Note Quick Action */}
            <button
              onClick={() => setActiveTab('approach')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5 text-blue-600" />
              <span>Approach Note</span>
            </button>

            {/* Lock Baseline */}
            <button
              onClick={() => setIsLockModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5 text-indigo-600" />
              <span>Lock Baseline & Notify BU</span>
            </button>

            {/* QA Test Cases */}
            <button
              onClick={() => {
                if (onNavigateToQASuite) {
                  onNavigateToQASuite();
                } else {
                  setActiveTab('tests');
                }
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
              <span>Test Suite</span>
            </button>

            {!definition.isApproved ? (
              <button
                onClick={onApproveDefinition}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer"
              >
                <CheckCircle className="w-4 h-4" />
                Approve
              </button>
            ) : (
              <button
                onClick={onBuildPrototype}
                className="inline-flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer"
              >
                <span>Build Prototype</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Sub Navigation Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-3 border-t border-slate-100 text-xs font-medium">
          {[
            { id: 'brd', label: '📄 BRD Document', icon: FileText },
            { id: 'overview', label: 'Executive Overview', icon: Layers },
            { id: 'approach', label: 'Solution Approach Note', icon: BookOpen },
            { id: 'personas', label: 'Personas & Journeys', icon: Users },
            { id: 'screens', label: 'Screens & UI Topology', icon: Monitor },
            { id: 'rules', label: 'Business Rules Engine', icon: Scale },
            { id: 'data', label: 'Data Model & Fields', icon: Database },
            { id: 'integrations', label: 'Integrations & APIs', icon: Share2 },
            { id: 'governance', label: 'Governance & Risks', icon: ShieldCheck },
            { id: 'history', label: `Version History (${versionHistory.length})`, icon: History },
            { id: 'tests', label: `Use Cases & Tests (${qaPackage.testScenarios.length})`, icon: CheckSquare },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg whitespace-nowrap transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-indigo-600 text-white font-semibold shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab 0: DEDICATED FULL BUSINESS REQUIREMENTS DOCUMENT (BRD) */}
      {activeTab === 'brd' && (
        <div className="space-y-6">
          {/* BRD Top Action Header */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 bg-indigo-600 text-white font-mono text-[10px] font-bold rounded">
                  BRD-{(definition.productName || 'PRODUCT').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase()}-{definition.version || 'V1.0'}
                </span>
                <span className="text-xs text-slate-500 font-semibold">
                  {definition.isApproved ? '✓ APPROVED BY BUSINESS' : 'DRAFT FOR BU REVIEW'}
                </span>
              </div>
              <h2 className="text-xl font-bold text-slate-900 mt-1">
                Official Business Requirements Document (BRD)
              </h2>
              <p className="text-xs text-slate-500">
                Prepared for <strong className="text-slate-700">{definition.businessUnit || 'Enterprise Unit'}</strong> • Synthesized automatically from uploaded business material
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyBRDText}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-xs flex items-center gap-2 cursor-pointer transition-all shrink-0"
              >
                {copiedBRD ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                <span>{copiedBRD ? 'BRD Text Copied!' : 'Copy Full BRD to Clipboard'}</span>
              </button>
            </div>
          </div>

          {/* Complete Formatted BRD Paper Canvas */}
          <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-10 shadow-sm space-y-8 text-slate-800">
            {/* 1. Document Control & Meta Header */}
            <div className="border-b border-slate-200 pb-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-extrabold text-slate-900">BUSINESS REQUIREMENTS DOCUMENT</div>
                  <div className="text-sm font-semibold text-indigo-600 mt-0.5">{definition.productName}</div>
                </div>
                <div className="text-right font-mono text-xs text-slate-500">
                  <div>Version: {definition.version}</div>
                  <div>Date: {new Date(definition.lastUpdated).toLocaleDateString()}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                <div>
                  <span className="block text-slate-400 font-medium">Business Unit</span>
                  <span className="font-semibold text-slate-900">{definition.businessUnit}</span>
                </div>
                <div>
                  <span className="block text-slate-400 font-medium">Target Release</span>
                  <span className="font-semibold text-slate-900">{definition.version} Production</span>
                </div>
                <div>
                  <span className="block text-slate-400 font-medium">Status</span>
                  <span className={`font-semibold ${definition.isApproved ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {definition.isApproved ? 'Approved & Frozen' : 'Draft / In Review'}
                  </span>
                </div>
                <div>
                  <span className="block text-slate-400 font-medium">Prepared By</span>
                  <span className="font-semibold text-slate-900">AI Product Factory</span>
                </div>
              </div>
            </div>

            {/* Section 1: Business Context & Objective */}
            <div className="space-y-3">
              <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
                <span className="w-6 h-6 rounded-md bg-indigo-50 text-indigo-700 text-xs font-bold flex items-center justify-center">1</span>
                Executive Summary & Business Objectives
              </h3>
              <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-200">
                {definition.objective}
              </p>
            </div>

            {/* Section 2: Functional Scope & Key Modules */}
            <div className="space-y-3">
              <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
                <span className="w-6 h-6 rounded-md bg-indigo-50 text-indigo-700 text-xs font-bold flex items-center justify-center">2</span>
                Functional Scope & System Modules ({definition.modules.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                {definition.modules.map((m, idx) => (
                  <div key={m.id || idx} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                    <div className="font-bold text-slate-900 flex items-center justify-between">
                      <span>2.{idx + 1} {m.name}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded font-semibold">
                        {m.confidence}
                      </span>
                    </div>
                    <p className="text-slate-600 text-[11px] leading-relaxed">{m.description}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Section 3: User Personas & RBAC Permissions */}
            <div className="space-y-3">
              <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
                <span className="w-6 h-6 rounded-md bg-indigo-50 text-indigo-700 text-xs font-bold flex items-center justify-center">3</span>
                User Personas & Security Access (RBAC)
              </h3>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 uppercase text-[10px]">
                    <tr>
                      <th className="p-3 px-4">Persona / Stakeholder</th>
                      <th className="p-3 px-4">Role Title</th>
                      <th className="p-3 px-4">Operational Goals</th>
                      <th className="p-3 px-4">Granted System Permissions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {definition.personas.map((p, idx) => (
                      <tr key={p.id || idx}>
                        <td className="p-3 px-4 font-bold text-slate-900">{p.name}</td>
                        <td className="p-3 px-4 text-indigo-700 font-semibold">{p.role}</td>
                        <td className="p-3 px-4 text-[11px]">{p.keyGoals.join('; ')}</td>
                        <td className="p-3 px-4 font-mono text-[11px]">{p.permissions.join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section 4: Governance Rules & Constraints */}
            <div className="space-y-3">
              <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
                <span className="w-6 h-6 rounded-md bg-indigo-50 text-indigo-700 text-xs font-bold flex items-center justify-center">4</span>
                Business Governance Rules ({definition.businessRules.length})
              </h3>
              <div className="space-y-2 text-xs">
                {definition.businessRules.map((rule, idx) => (
                  <div key={rule.id || idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-3">
                    <span className="px-2 py-0.5 bg-slate-900 text-white font-mono font-bold text-[10px] rounded shrink-0 mt-0.5">
                      {rule.code || `BR-${idx + 1}`}
                    </span>
                    <div className="space-y-0.5">
                      <div className="font-semibold text-slate-900">{rule.rule}</div>
                      <div className="text-slate-500 text-[11px]">Context: {rule.context}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Section 5: Data Entities & Integration Matrix */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider text-slate-500">
                  Data Dictionary Entities
                </h4>
                <div className="space-y-2 text-xs">
                  {definition.dataEntities.map((e, idx) => (
                    <div key={e.id || idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                      <div className="font-bold font-mono text-slate-900">{e.name}</div>
                      <p className="text-slate-600 text-[11px]">{e.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider text-slate-500">
                  External System Integrations
                </h4>
                <div className="space-y-2 text-xs">
                  {definition.integrations.map((i, idx) => (
                    <div key={i.id || idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                      <div className="font-bold text-slate-900">{i.system} ({i.protocol})</div>
                      <p className="text-slate-600 text-[11px]">{i.purpose}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Section 6: BU Sign-Off & Verification Footer */}
            <div className="border-t border-slate-200 pt-6 space-y-4">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Stakeholder Sign-Off & Version Baseline
              </h3>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
                <div>
                  <div className="font-bold text-slate-900">BU Executive Approval</div>
                  <div className="text-slate-500 text-[11px]">
                    {definition.isApproved
                      ? `Signed off and baseline frozen at ${definition.approvedAt ? formatDate(definition.approvedAt) : 'active'}`
                      : 'Pending Business Unit (BU) explicit approval sign-off.'}
                  </div>
                </div>

                {!definition.isApproved ? (
                  <button
                    onClick={onApproveDefinition}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-xs transition-all shrink-0 cursor-pointer"
                  >
                    ✓ Sign-Off & Approve BRD
                  </button>
                ) : (
                  <button
                    onClick={onBuildPrototype}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-xs transition-all shrink-0 flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Launch Prototype</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 1: Executive Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Product Problem Statement & Objective
            </h3>
            {isEditing ? (
              <textarea
                rows={4}
                value={definition.objective}
                onChange={(e) => handleFieldChange('objective', e.target.value)}
                className="w-full text-xs p-3 rounded-lg border border-slate-300 bg-white leading-relaxed focus:ring-2 focus:ring-indigo-500/20"
              />
            ) : (
              <p className="text-sm text-slate-700 leading-relaxed bg-slate-50/70 p-4 rounded-xl border border-slate-100">
                {definition.objective}
              </p>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Core Functional Modules ({definition.modules.length})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {definition.modules.map(mod => (
                <div key={mod.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-xs font-bold text-slate-900">{mod.name}</h4>
                    <ConfidenceBadge status={mod.confidence} size="sm" />
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{mod.description}</p>
                  <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-200/60">
                    Evidence: {mod.evidence.join('; ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: NEW TAB - Solution Approach Note */}
      {activeTab === 'approach' && (
        <div className="space-y-6">
          {/* Top Banner */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 bg-blue-100 text-blue-800 font-mono text-[10px] font-bold rounded">
                  {approachNote.docId}
                </span>
                <span className="text-xs text-slate-500 font-semibold">{approachNote.status}</span>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mt-1">Enterprise Solution Approach Note</h3>
              <p className="text-xs text-slate-500">
                Pre-implementation architectural justification, AS-IS vs TO-BE analysis, and phased delivery plan.
              </p>
            </div>

            <button
              onClick={handleCopyApproachNote}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-xs flex items-center gap-2 cursor-pointer transition-all shrink-0"
            >
              {copiedApproach ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
              <span>{copiedApproach ? 'Approach Note Copied!' : 'Copy Approach Note for BU / Leadership'}</span>
            </button>
          </div>

          {/* Section 1: Executive Summary */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-blue-600" />
              <span>1. Executive Summary & Proposed Strategic Value</span>
            </h4>
            <p className="text-xs text-slate-700 leading-relaxed bg-blue-50/40 p-4 rounded-xl border border-blue-100">
              {approachNote.executiveSummary}
            </p>
          </div>

          {/* Section 2: AS-IS vs TO-BE Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-rose-200 p-6 shadow-2xs space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-rose-700 flex items-center gap-1.5">
                <span>2. AS-IS: Operational Bottlenecks & Gaps</span>
              </h4>
              <ul className="space-y-2 text-xs text-slate-700">
                {approachNote.asIsProblemStatement.map((prob, i) => (
                  <li key={i} className="flex items-start gap-2 bg-rose-50/50 p-2.5 rounded-lg border border-rose-100">
                    <span className="w-4 h-4 rounded-full bg-rose-200 text-rose-800 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i+1}</span>
                    <span>{prob}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-white rounded-2xl border border-emerald-200 p-6 shadow-2xs space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1.5">
                <span>3. TO-BE: Proposed Architecture & Capabilities</span>
              </h4>
              <ul className="space-y-2 text-xs text-slate-700">
                {approachNote.toBeTargetArchitecture.map((sol, i) => (
                  <li key={i} className="flex items-start gap-2 bg-emerald-50/50 p-2.5 rounded-lg border border-emerald-100">
                    <span className="w-4 h-4 rounded-full bg-emerald-200 text-emerald-800 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i+1}</span>
                    <span>{sol}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Section 3: Phased Delivery Roadmap */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Target className="w-4 h-4 text-indigo-600" />
              <span>4. Phased Implementation Strategy</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {approachNote.phasedExecutionStrategy.map((phase, idx) => (
                <div key={idx} className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-bold text-slate-900">{phase.phase}</h5>
                    <span className="text-[10px] font-mono px-2 py-0.5 bg-indigo-100 text-indigo-800 font-semibold rounded">
                      {phase.timeline}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{phase.focus}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Section 4: Risks & Technical Mitigations */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              5. Delivery Risks & Architectural Mitigations
            </h4>
            <div className="space-y-2">
              {approachNote.keyRisksAndMitigations.map((r, idx) => (
                <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                  <p className="font-semibold text-slate-800"><strong>Risk:</strong> {r.risk}</p>
                  <p className="text-emerald-700"><strong>Mitigation:</strong> {r.mitigation}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Personas & Journeys */}
      {activeTab === 'personas' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Enterprise Personas & Access Roles ({definition.personas.length})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {definition.personas.map(persona => (
                <div key={persona.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/40 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">{persona.name}</h4>
                      <span className="text-[11px] text-indigo-600 font-medium">{persona.role}</span>
                    </div>
                    <ConfidenceBadge status={persona.confidence} size="sm" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Key Responsibilities</span>
                    <ul className="text-xs text-slate-600 list-disc list-inside space-y-1 mt-1">
                      {persona.keyGoals.map((g, i) => <li key={i}>{g}</li>)}
                    </ul>
                  </div>
                  <div className="pt-2 border-t border-slate-200/60 text-[11px] text-slate-500">
                    <span className="font-semibold text-slate-700">Permissions: </span>
                    {persona.permissions.join(', ')}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              End-to-End User Journeys ({definition.userJourneys.length})
            </h3>
            <div className="space-y-4">
              {definition.userJourneys.map(uj => (
                <div key={uj.id} className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">{uj.name}</h4>
                      <span className="text-[11px] text-slate-500 font-medium">Actor: {uj.persona}</span>
                    </div>
                    <ConfidenceBadge status={uj.confidence} size="sm" />
                  </div>
                  <div className="flex items-center gap-2 overflow-x-auto py-2">
                    {uj.steps.map((step, idx) => (
                      <React.Fragment key={idx}>
                        {idx > 0 && <div className="w-3 h-0.5 bg-slate-300 shrink-0" />}
                        <div className="px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-xs text-slate-700 whitespace-nowrap">
                          <span className="font-bold text-slate-400 mr-1.5">{idx + 1}.</span>
                          {step}
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                  <div className="p-2.5 rounded-lg bg-emerald-50/70 border border-emerald-100 text-xs text-emerald-800">
                    <span className="font-bold">Business Outcome: </span>
                    {uj.outcome}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Screens */}
      {activeTab === 'screens' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Screen Inventory & Component Topology ({definition.screens.length})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {definition.screens.map(scr => (
                <div key={scr.id} className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">{scr.name}</h4>
                      <span className="text-[11px] text-indigo-600 font-mono">Module: {scr.module}</span>
                    </div>
                    <ConfidenceBadge status={scr.confidence} size="sm" />
                  </div>
                  <p className="text-xs text-slate-600">{scr.purpose}</p>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Embedded Components</span>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {scr.components.map((c, i) => (
                        <span key={i} className="px-2 py-0.5 text-[11px] rounded bg-slate-100 text-slate-700 border border-slate-200">
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-400 truncate">
                    Evidence: {scr.evidence.join(', ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Rules */}
      {activeTab === 'rules' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Business Rules Catalog ({definition.businessRules.length})
            </h3>
            <div className="space-y-3">
              {definition.businessRules.map(rule => (
                <div key={rule.id} className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded font-mono text-[11px] font-bold bg-slate-100 text-slate-800 border border-slate-300">
                        {rule.code}
                      </span>
                      <span className="text-xs text-slate-500">Context: {rule.context}</span>
                    </div>
                    <ConfidenceBadge status={rule.confidence} size="sm" />
                  </div>
                  <p className="text-xs text-slate-800 font-medium leading-relaxed">
                    {rule.rule}
                  </p>
                  <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-100">
                    Evidence Citation: {rule.evidence.join('; ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 6: Data */}
      {activeTab === 'data' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-6">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Data Entities & Field Specifications ({definition.dataEntities.length})
            </h3>
            <div className="space-y-6">
              {definition.dataEntities.map(entity => (
                <div key={entity.id} className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 font-mono">{entity.name}</h4>
                      <p className="text-[11px] text-slate-500">{entity.description}</p>
                    </div>
                    <ConfidenceBadge status={entity.confidence} size="sm" />
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100/70 text-slate-500 uppercase text-[10px] font-semibold border-b border-slate-200">
                        <tr>
                          <th className="p-2.5 px-4">Field Name</th>
                          <th className="p-2.5 px-4">Data Type</th>
                          <th className="p-2.5 px-4">Required</th>
                          <th className="p-2.5 px-4">Constraints</th>
                          <th className="p-2.5 px-4">Origin</th>
                          <th className="p-2.5 px-4">Business Context & Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {withSystemFields(entity).fields.map((field, idx) => {
                          const isSystem = field.source === 'system';
                          const chips = constraintSummary(field);
                          return (
                          <tr key={idx} className="hover:bg-slate-50/50 align-top">
                            <td className="p-2.5 px-4 font-mono font-medium text-slate-900">{field.name}</td>
                            <td className="p-2.5 px-4 font-mono text-indigo-600">{field.type}</td>
                            <td className="p-2.5 px-4">
                              {isEditing && !isSystem ? (
                                <input
                                  type="checkbox"
                                  checked={field.required}
                                  onChange={(e) => updateField(entity.id, field.name, { required: e.target.checked })}
                                  aria-label={`${field.name} is required`}
                                />
                              ) : field.required ? (
                                <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">YES</span>
                              ) : (
                                <span className="text-[10px] text-slate-400">No</span>
                              )}
                            </td>
                            <td className="p-2.5 px-4">
                              <div className="flex flex-wrap gap-1">
                                {chips.length > 0 ? chips.map(c => (
                                  <span key={c} className="text-[10px] font-mono text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">{c}</span>
                                )) : <span className="text-[10px] text-slate-400">-</span>}
                              </div>
                            </td>
                            <td className="p-2.5 px-4 whitespace-nowrap">
                              {field.origin === 'SYSTEM' || isSystem ? (
                                <span className="text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">SYSTEM</span>
                              ) : field.origin === 'INFERRED' ? (
                                <span className="inline-flex items-center gap-1.5">
                                  <span className="text-[10px] font-bold text-violet-700 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded">INFERRED</span>
                                  <button
                                    onClick={() => updateField(entity.id, field.name, { origin: 'BU' })}
                                    className="text-[10px] font-bold text-emerald-700 hover:underline cursor-pointer"
                                    title="Confirm this field and its constraints as correct"
                                  >
                                    Confirm
                                  </button>
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">BU</span>
                              )}
                            </td>
                            <td className="p-2.5 px-4 text-slate-500">{field.notes || '-'}</td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {(entity.lifecycle || (entity.rules && entity.rules.length > 0) || (entity.crossRecordRules && entity.crossRecordRules.length > 0)) && (
                    <div className="p-4 border-t border-slate-200 bg-slate-50/50 space-y-3 text-xs text-slate-600">
                      {entity.lifecycle && (
                        <div>
                          <div className="font-bold text-slate-800 mb-1">Lifecycle ({entity.lifecycle.statusField}, starts as {entity.lifecycle.initial})</div>
                          <div className="flex flex-wrap gap-1.5">
                            {entity.lifecycle.transitions.map((t, i) => (
                              <span key={i} className="font-mono text-[10px] bg-white border border-slate-200 rounded px-1.5 py-0.5">{t.from} → {t.to}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {entity.rules && entity.rules.length > 0 && (
                        <div>
                          <div className="font-bold text-slate-800 mb-1">Field rules (enforced in the browser and on the server)</div>
                          <ul className="list-disc pl-4 space-y-0.5">
                            {entity.rules.map(r => <li key={r.id}>{r.message} <span className="text-[10px] text-slate-400">({r.kind}, {r.origin ?? 'INFERRED'})</span></li>)}
                          </ul>
                        </div>
                      )}
                      {entity.crossRecordRules && entity.crossRecordRules.length > 0 && (
                        <div>
                          <div className="font-bold text-slate-800 mb-1">Service-layer rules (need storage; the real backend must enforce these)</div>
                          <ul className="list-disc pl-4 space-y-0.5">
                            {entity.crossRecordRules.map((r, i) => <li key={i}>{r}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 7: Integrations */}
      {activeTab === 'integrations' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              System Integrations & APIs ({definition.integrations.length})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {definition.integrations.map(int => (
                <div key={int.id} className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">{int.system}</h4>
                      <span className="font-mono text-[10px] text-indigo-600 px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-100">
                        {int.protocol}
                      </span>
                    </div>
                    <ConfidenceBadge status={int.confidence} size="sm" />
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{int.purpose}</p>
                  <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-400 truncate">
                    Evidence: {int.evidence.join(', ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 8: Governance */}
      {activeTab === 'governance' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Role-Based Access Control (RBAC) Matrix
            </h3>
            <div className="space-y-2">
              {definition.permissions.map((perm, idx) => (
                <div key={idx} className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-bold text-slate-900">{perm.role}</span>
                    <p className="text-[11px] text-slate-500">{perm.constraints}</p>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded bg-slate-200 text-slate-800 shrink-0">
                    {perm.accessLevel}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Explicit Working Assumptions ({definition.assumptions.length})
              </h4>
              <div className="space-y-2.5">
                {definition.assumptions.map(a => (
                  <div key={a.id} className="p-3 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-700">
                    <p>{a.statement}</p>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-1 font-mono">
                      <span>Risk: {a.riskLevel}</span>
                      <span>•</span>
                      <span>Status: {a.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Outstanding Business Questions ({definition.openQuestions.length})
              </h4>
              <div className="space-y-2.5">
                {definition.openQuestions.map(q => (
                  <div key={q.id} className="p-3 rounded-lg border border-rose-200 bg-rose-50/50 text-xs text-rose-900">
                    <p className="font-medium">{q.question}</p>
                    <div className="text-[10px] text-rose-700 mt-1 font-mono">
                      Urgency: {q.urgency}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 9: Version History */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">BRD Version Baseline & Audit Trail</h3>
                <p className="text-xs text-slate-500">
                  Immutable record of locked business baselines, sign-off dates, stakeholder notifications, and highlighted change deltas.
                </p>
              </div>
              <button
                onClick={() => setIsLockModalOpen(true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-xs flex items-center gap-2 shrink-0 cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Freeze & Lock Next Baseline</span>
              </button>
            </div>

            <div className="space-y-4">
              {versionHistory.map((item, idx) => (
                <div key={idx} className="p-5 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
                        {item.version}
                      </span>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                        item.status.includes('Active') ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {item.status}
                      </span>
                    </div>
                    <span className="text-xs font-mono text-slate-500 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" /> Locked: {formatDate(item.lockedAt)}
                    </span>
                  </div>

                  <p className="text-xs text-slate-700">{item.signOffNotes}</p>

                  <div className="flex items-center gap-2 flex-wrap text-xs pt-2 border-t border-slate-100">
                    <span className="text-slate-400 font-semibold text-[11px] flex items-center gap-1">
                      <Mail className="w-3 h-3 text-slate-400" /> Dispatched to BU Emails:
                    </span>
                    {item.signedOffBy.map((email: string, eIdx: number) => (
                      <span key={eIdx} className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[11px] font-mono">
                        {email}
                      </span>
                    ))}
                  </div>

                  {item.changesDelta && (
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2 text-xs">
                      <div className="font-bold text-slate-800 flex items-center gap-1">
                        <Diff className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Highlighted Changes In This Version:</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                        {item.changesDelta.added.length > 0 && (
                          <div>
                            <span className="font-bold text-emerald-700 uppercase block mb-0.5">+ Added Features</span>
                            <ul className="list-disc pl-4 space-y-0.5 text-slate-600">
                              {item.changesDelta.added.map((a: string, i: number) => (
                                <li key={i}>{a}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {item.changesDelta.modified.length > 0 && (
                          <div>
                            <span className="font-bold text-amber-700 uppercase block mb-0.5">~ Modified Workflows</span>
                            <ul className="list-disc pl-4 space-y-0.5 text-slate-600">
                              {item.changesDelta.modified.map((m: string, i: number) => (
                                <li key={i}>{m}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 10: Use Cases & Test Scenarios */}
      {activeTab === 'tests' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 font-bold text-xs rounded-full flex items-center gap-1">
                  <CheckSquare className="w-3.5 h-3.5" /> Baseline Verified ({definition.version})
                </span>
                <span className="text-xs text-slate-400">100% Traceability to Entities & Rules</span>
              </div>
              <h3 className="text-xl font-bold text-slate-900">Functional Use Cases & Test Scenarios</h3>
              <p className="text-xs text-slate-600">
                Synthesized directly from the locked BRD to execute comprehensive manual and automated UAT validation.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap shrink-0">
              <button
                onClick={handleCopyTestCases}
                className="px-3.5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold text-xs rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer transition-all"
              >
                {copiedTests ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-500" />}
                <span>{copiedTests ? 'Copied for Jira!' : 'Export Test Suite'}</span>
              </button>

              {onNavigateToQASuite && (
                <button
                  onClick={onNavigateToQASuite}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-xs flex items-center gap-2 cursor-pointer transition-all"
                >
                  <CheckSquare className="w-4 h-4" />
                  <span>Open Dedicated QA Suite (Step 7)</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Structured Use Cases ({qaPackage.useCases.length})
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {qaPackage.useCases.map((uc) => (
                <div key={uc.id} className="p-5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-mono font-bold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded">
                        {uc.id}
                      </span>
                      <h5 className="text-xs font-bold text-slate-900 mt-1">{uc.title}</h5>
                    </div>
                    <span className="text-[11px] font-medium text-slate-500">{uc.primaryActor}</span>
                  </div>

                  <div className="space-y-1 text-xs text-slate-600">
                    <p><strong>Pre-Condition:</strong> {uc.preCondition}</p>
                    <p><strong>Trigger:</strong> {uc.trigger}</p>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                      Main Scenario Flow:
                    </span>
                    <ol className="list-decimal pl-4 space-y-1 text-xs text-slate-700">
                      {uc.mainFlow.map((step, sIdx) => (
                        <li key={sIdx}>{step}</li>
                      ))}
                    </ol>
                  </div>

                  <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-100 text-xs text-emerald-800">
                    <strong>Post-Condition:</strong> {uc.postCondition}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="p-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Comprehensive Test Execution Matrix ({qaPackage.testScenarios.length} Scenarios)
                </h4>
                <p className="text-xs text-slate-500">Covers Positive, Boundary, Negative, and Edge Case vectors.</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/70 text-slate-500 uppercase text-[10px] font-semibold border-b border-slate-200">
                  <tr>
                    <th className="p-3 px-4">Test ID</th>
                    <th className="p-3 px-4">Category</th>
                    <th className="p-3 px-4">Target Module</th>
                    <th className="p-3 px-4">Scenario / Objective</th>
                    <th className="p-3 px-4">Test Payload</th>
                    <th className="p-3 px-4">Expected Verification Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {qaPackage.testScenarios.map((tc) => (
                    <tr key={tc.id} className="hover:bg-slate-50/50">
                      <td className="p-3 px-4 font-mono font-bold text-slate-900">{tc.id}</td>
                      <td className="p-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          tc.type.includes('POSITIVE') ? 'bg-emerald-100 text-emerald-800' :
                          tc.type.includes('BOUNDARY') ? 'bg-amber-100 text-amber-800' :
                          tc.type.includes('NEGATIVE') ? 'bg-rose-100 text-rose-800' :
                          'bg-indigo-100 text-indigo-800'
                        }`}>
                          {tc.type}
                        </span>
                      </td>
                      <td className="p-3 px-4 font-medium text-slate-600">{tc.module}</td>
                      <td className="p-3 px-4 font-medium text-slate-900">{tc.title}</td>
                      <td className="p-3 px-4 font-mono text-[11px] text-slate-500">{tc.testData}</td>
                      <td className="p-3 px-4 text-emerald-700 font-medium">{tc.expectedResult}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Approval & Next Step Prompt */}
      <div className="bg-slate-900 text-white rounded-xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h4 className="text-sm font-semibold text-white">
            {definition.isApproved ? 'Product Definition Approved' : 'Action Required: Approve Definition'}
          </h4>
          <p className="text-xs text-slate-300">
            {definition.isApproved 
              ? 'Specification is locked and ready to generate the interactive working prototype.'
              : 'Review the specification details above, then click Approve to enable prototype creation.'}
          </p>
        </div>

        {definition.isApproved ? (
          <button
            onClick={onBuildPrototype}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer"
          >
            <span>Launch Working Prototype</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={onApproveDefinition}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer"
          >
            <CheckCircle className="w-4 h-4" />
            <span>Approve Product Definition</span>
          </button>
        )}
      </div>

      {/* Lock Baseline & Email Stakeholders Modal */}
      {isLockModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white border border-slate-200 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-500/20 rounded-lg border border-indigo-500/30">
                  <Lock className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-base font-semibold">Freeze & Lock BRD Baseline</h2>
                  <p className="text-xs text-slate-400">Lock authoritative version and notify stakeholders</p>
                </div>
              </div>
              <button onClick={() => setIsLockModalOpen(false)} className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto flex-1 text-sm text-slate-700">
              <div className="grid grid-cols-2 gap-4 bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div>
                  <span className="text-xs text-slate-500 font-medium">New Target Version</span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="px-2.5 py-0.5 bg-indigo-100 text-indigo-700 font-bold text-xs rounded-full">
                      v{(parseInt((definition.version || 'v1.0').replace('v','').split('.')[0], 10) || 1) + 1}.0
                    </span>
                    <span className="text-xs text-slate-400">(Current: {definition.version || 'v1.0'})</span>
                  </div>
                </div>
                <div>
                  <span className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" /> Sign-Off Freeze Date
                  </span>
                  <p className="text-xs font-semibold text-slate-800 mt-1 font-mono">
                    {new Date().toISOString()}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {formatDate(new Date().toISOString())}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Mail className="w-4 h-4 text-indigo-600" />
                    <span>BU Reviewer & Stakeholder Email Registry</span>
                  </label>
                  <span className="text-xs text-slate-400">{stakeholderEmails.length} recipients</span>
                </div>

                <div className="flex gap-2">
                  <input
                    type="email"
                    placeholder="Add stakeholder email (e.g. bu.lead@tatamotors.com)"
                    value={newEmailInput}
                    onChange={(e) => setNewEmailInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddEmail()}
                    className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-indigo-500"
                  />
                  <button
                    onClick={handleAddEmail}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-medium rounded-lg flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  {stakeholderEmails.map((email) => (
                    <div 
                      key={email} 
                      className="px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-lg text-xs flex items-center gap-1.5 text-slate-700"
                    >
                      <span>{email}</span>
                      <button 
                        onClick={() => handleRemoveEmail(email)} 
                        className="text-slate-400 hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Diff className="w-4 h-4 text-indigo-600" />
                  <span>Highlighted Changes to be Sent in Notification</span>
                </div>
                <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/50 space-y-2 text-xs">
                  <div>
                    <span className="text-[11px] font-bold text-emerald-700 uppercase block mb-0.5">+ Added</span>
                    <p className="text-slate-600">{definition.screens?.[0]?.name || `${definition.productName} Workflow`} interface and interactive component suite.</p>
                  </div>
                  <div className="pt-1.5 border-t border-slate-200/60">
                    <span className="text-[11px] font-bold text-amber-700 uppercase block mb-0.5">~ Modified</span>
                    <p className="text-slate-600">Core business logic & rule governance updated for {definition.productName}.</p>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-900 uppercase tracking-wider block">
                  Sign-Off Minutes / Review Comments
                </label>
                <textarea
                  rows={2}
                  value={signOffNote}
                  onChange={(e) => setSignOffNote(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-indigo-500 text-slate-700"
                />
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                onClick={() => setIsLockModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleLockBaseline}
                disabled={isLocking || stakeholderEmails.length === 0}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-xs flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50"
              >
                {isLocking ? (
                  <span>Freezing Baseline & Notifying Emails...</span>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Freeze Baseline & Dispatch to BU Emails</span>
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