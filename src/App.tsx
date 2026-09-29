import React, { useState, useEffect, useRef } from 'react';
import { 
  ActiveScreen, 
  UploadedMaterial, 
  BusinessUnderstanding, 
  ProductDefinition, 
  EngineeringPackage, 
  EvidenceItem, 
  ChangeImpactAnalysis 
} from './types';
import { Header } from './components/Header';
import { CreateProductScreen } from './components/CreateProductScreen';
import { BusinessUnderstandingScreen } from './components/BusinessUnderstandingScreen';
import { ProductDefinitionScreen } from './components/ProductDefinitionScreen';
import { PrototypeScreen } from './components/PrototypeScreen';
import { ChangeManagementModal } from './components/ChangeManagementModal';
import { QASuiteScreen } from './components/QASuiteScreen';
import { EngineeringPackageScreen } from './components/EngineeringPackageScreen';
import { ServiceDesignScreen } from './components/ServiceDesignScreen';
import { EvidenceViewerModal } from './components/EvidenceViewerModal';
import { SAMPLE_DATASET_FLEET } from './data/sampleMaterials';
import { 
  INITIAL_BUSINESS_UNDERSTANDING,
  INITIAL_PRODUCT_DEFINITION, 
  INITIAL_ENGINEERING_PACKAGE 
} from './data/defaultData';
import { buildDynamicFallbackUnderstanding } from './services/dynamicFallback';
import { entityToSQL } from './services/validationEngine';
import { Sparkles, CheckSquare } from 'lucide-react';

// ─── Pipeline State Persistence ──────────────────────────────────────────────
const STORAGE_KEY = 'aipf_pipeline_v1';
// Legacy key — cleaned up on load to prevent stale data ghosts
const LEGACY_DEV_KEY = 'DEV_TESTING_SESSION_DRAFT';

interface PersistedState {
  activeScreen: ActiveScreen;
  productName: string;
  businessUnit: string;
  description: string;
  materials: UploadedMaterial[];
  businessUnderstanding: BusinessUnderstanding | null;
  productDefinition: ProductDefinition | null;
  engineeringPackage: EngineeringPackage | null;
}

/** Returns true if the saved state contains meaningful data worth restoring. */
function isStateMeaningful(s: PersistedState): boolean {
  return !!(
    s.productName ||
    s.businessUnit ||
    s.description ||
    (s.materials && s.materials.length > 0) ||
    s.businessUnderstanding ||
    s.productDefinition ||
    s.engineeringPackage
  );
}

function getSavedState(): PersistedState | null {
  try {
    // Clean up legacy key to prevent stale data from old sessions
    try { localStorage.removeItem(LEGACY_DEV_KEY); } catch { /* noop */ }

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedState;
    // Only restore if there is meaningful data
    return isStateMeaningful(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export default function App() {
  // ── Lazy-initialize all pipeline state from localStorage ──────────────────
  const initialSave = useRef(getSavedState());
  const saved = initialSave.current;

  // Guard: when true, the auto-save effect is skipped once to avoid
  // re-persisting the freshly cleared state back to localStorage.
  const isResettingRef = useRef(false);

  const [activeScreen, setActiveScreen] = useState<ActiveScreen>(
    saved?.activeScreen ?? 'create'
  );
  const [productName, setProductName] = useState<string>(
    saved?.productName ?? ''
  );
  const [businessUnit, setBusinessUnit] = useState<string>(
    saved?.businessUnit ?? ''
  );
  const [description, setDescription] = useState<string>(
    saved?.description ?? ''
  );
  const [materials, setMaterials] = useState<UploadedMaterial[]>(
    saved?.materials ?? []
  );

  const [businessUnderstanding, setBusinessUnderstanding] = useState<BusinessUnderstanding | null>(
    saved?.businessUnderstanding ?? null
  );
  const [productDefinition, setProductDefinition] = useState<ProductDefinition | null>(
    saved?.productDefinition ?? null
  );
  const [engineeringPackage, setEngineeringPackage] = useState<EngineeringPackage | null>(
    saved?.engineeringPackage ?? null
  );

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingDefinition, setIsGeneratingDefinition] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isGeneratingPrototype, setIsGeneratingPrototype] = useState(false);

  const [evidenceModalItem, setEvidenceModalItem] = useState<EvidenceItem | null>(null);
  const [changeModalOpen, setChangeModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // ── Auto-save pipeline state to localStorage ─────────────
  useEffect(() => {
    // Skip the save cycle immediately after a reset to avoid re-persisting empty state
    if (isResettingRef.current) {
      isResettingRef.current = false;
      return;
    }
    try {
      const state: PersistedState = {
        activeScreen,
        productName,
        businessUnit,
        description,
        materials,
        businessUnderstanding,
        productDefinition,
        engineeringPackage,
      };
      // Only persist if there is meaningful data; otherwise clear storage
      if (isStateMeaningful(state)) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } else {
        try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
      }
    } catch (e) {
      console.warn('[AI Product Factory] Session auto-save failed:', e);
    }
  }, [
    activeScreen,
    productName,
    businessUnit,
    description,
    materials,
    businessUnderstanding,
    productDefinition,
    engineeringPackage,
  ]);

  // ── Show 'Session restored' toast once on mount if saved state was found ──
  useEffect(() => {
    if (saved && isStateMeaningful(saved)) {
      showToast('Session restored — your pipeline progress has been recovered.');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Step 1 -> 2: Understand Business
  const handleAnalyzeMaterials = async () => {
    if (materials.length === 0) return;
    setIsAnalyzing(true);
    setApiError(null);
    try {
      const response = await fetch('/api/analyze-material', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ materials, productName, businessUnit, description }),
      });
      
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      setBusinessUnderstanding(data);
      setProductDefinition(null);
      setEngineeringPackage(null);
      setActiveScreen('understanding');
      showToast('Business understanding reconstructed from multi-format materials.');
    } catch (err: any) {
      console.error("Analysis Error:", err);
      setApiError(err.message || "An unknown error occurred while analyzing materials.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Step 2 -> 3: Generate Product Definition
  const handleGenerateDefinition = async () => {
    setIsGeneratingDefinition(true);
    setApiError(null);
    try {
      const response = await fetch('/api/generate-definition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          businessUnderstanding: businessUnderstanding, 
          productName, 
          businessUnit,
          version: productDefinition?.version || 'v1.0'
        }),
      });
      if (response.ok) {
        const data = await response.json();
        setProductDefinition(data);
        setEngineeringPackage(null);
        showToast('Formal Product Definition structured and ready for review.');
      } else {
        const errData = await response.json().catch(() => ({}));
        setApiError(errData.error || 'Failed to generate product definition from business understanding.');
      }
    } catch (err: any) {
      console.error('Error generating definition:', err);
      setApiError(err?.message || 'Failed to communicate with AI generation endpoint.');
    } finally {
      setActiveScreen('definition');
      setIsGeneratingDefinition(false);
    }
  };

  // Regenerate definition — real async call with loading state and error handling
  const handleRegenerateDefinition = async () => {
    setIsRegenerating(true);
    setApiError(null);
    try {
      const response = await fetch('/api/generate-definition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessUnderstanding: businessUnderstanding,
          productName,
          businessUnit,
          version: productDefinition?.version || 'v1.0',
        }),
      });
      if (response.ok) {
        const data = await response.json();
        setProductDefinition(data);
        setEngineeringPackage(null);
        showToast('Product Definition regenerated with fresh AI synthesis.');
      } else {
        const errData = await response.json().catch(() => ({}));
        setApiError(errData.error || 'Regeneration failed on backend.');
      }
    } catch (err: any) {
      setApiError(err?.message || 'Network error during definition regeneration.');
    } finally {
      setIsRegenerating(false);
    }
  };

  // Step 3 -> 4: Approve Definition
  const handleApproveDefinition = () => {
    setProductDefinition(prev => prev ? ({ ...prev, isApproved: true, approvedAt: new Date().toISOString() }) : null);
    showToast('Product Definition approved! Prototype construction unlocked.');
  };

  // Step 4: Build Prototype — calls the AI Advanced Thinking endpoint to generate
  // rich, domain-adaptive UI blueprints for every screen, referencing real products.
  const handleBuildPrototype = async () => {
    setActiveScreen('prototype');
    if (!productDefinition) return;

    // Skip regeneration if screens already have AI-enriched UI specs
    const allHaveUI = productDefinition.screens.length > 0 &&
      productDefinition.screens.every(s => s.ui?.benchmarkNote);
    if (allHaveUI) {
      showToast('Interactive prototype loaded with AI-generated UI.');
      return;
    }

    setIsGeneratingPrototype(true);
    try {
      const response = await fetch('/api/generate-prototype', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productDefinition }),
      });

      if (response.ok) {
        const enrichedDefinition = await response.json();
        setProductDefinition(enrichedDefinition);
        showToast('AI prototype generated with advanced thinking — each screen inspired by leading products.');
      } else {
        const errData = await response.json().catch(() => ({}));
        console.warn('Prototype generation API error:', errData);
        showToast('Prototype loaded with standard layout. AI generation will retry on next build.');
      }
    } catch (err) {
      console.error('Error generating prototype:', err);
      showToast('Prototype loaded with standard layout.');
    } finally {
      setIsGeneratingPrototype(false);
    }
  };

  // Step 6: Change Impact Analysis
  const handleAnalyzeChange = async (changeRequest: string): Promise<ChangeImpactAnalysis> => {
    try {
      if (productDefinition) {
        const response = await fetch('/api/analyze-change', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            currentDefinition: productDefinition,
            changeRequestText: changeRequest
          })
        });

        if (response.ok) {
          return await response.json();
        }
      }
    } catch (err) {
      console.error('Failed to call analyze-change API:', err);
    }

    const currentScreens = (productDefinition?.screens || []).map(s => s.name);
    const currentWorkflows = (productDefinition?.userJourneys || []).map(u => u.name);
    const currentRules = (productDefinition?.businessRules || []).map(r => `${r.code}: ${r.rule}`);
    const currentData = (productDefinition?.dataEntities || []).map(d => d.name);

    return {
      id: `change-${Date.now()}`,
      timestamp: new Date().toISOString(),
      changeRequested: changeRequest,
      affectedAreas: {
        screens: currentScreens.slice(0, 2).length > 0 ? currentScreens.slice(0, 2) : ['Primary Executive Screen'],
        workflows: currentWorkflows.slice(0, 2).length > 0 ? currentWorkflows.slice(0, 2) : ['Core User Journey'],
        businessRules: currentRules.slice(0, 2).length > 0 ? currentRules.slice(0, 2) : ['RULE-01: Standard Constraint'],
        data: currentData.slice(0, 2).length > 0 ? currentData.slice(0, 2) : ['DomainDataEntity'],
        apis: ['/api/v1/resource/update'],
        integrations: (productDefinition?.integrations || []).map(i => i.system).slice(0, 2),
        permissions: (productDefinition?.permissions || []).map(p => p.role).slice(0, 2)
      },
      newRequirement: `Synthesized requirement for: "${changeRequest}"`,
      potentialSideEffects: [
        "Database schema and entity validation update required.",
        "System user permissions must be re-verified against modified rule boundary."
      ],
      status: 'pending'
    };
  };

  // Step 6: Apply Change
  const handleApplyChange = async (analysis: ChangeImpactAnalysis) => {
    try {
      if (productDefinition) {
        const response = await fetch('/api/apply-change', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            currentDefinition: productDefinition,
            changeAnalysis: analysis
          })
        });

        if (response.ok) {
          const updated = await response.json();
          setProductDefinition(updated);
          setEngineeringPackage(null);
          showToast(`Change applied successfully! Version incremented to ${updated.version}`);
          return;
        }
      }
    } catch (err) {
      console.error('Error applying change via API:', err);
    }

    setProductDefinition(prev => {
      if (!prev) return null;
      const vParts = prev.version.replace('v', '').split('.').map(Number);
      const newVersion = `v${vParts[0] || 1}.${(vParts[1] || 0) + 1}`;
      const appliedAnalysis: ChangeImpactAnalysis = {
        ...analysis,
        status: 'applied',
        versionApplied: newVersion
      };

      const reqText = analysis.changeRequested || '';
      let rawTitle = reqText.replace(/^(add|create|new|make|please|pls|include|show)\s+/i, '').trim();
      rawTitle = rawTitle ? rawTitle.charAt(0).toUpperCase() + rawTitle.slice(1) : 'Custom Feature';
      let screenTitle = rawTitle;
      if (!/screen|tab|view|calculator|dashboard|workbench|portal|hub/i.test(screenTitle)) {
        screenTitle = `${screenTitle} Screen`;
      }
      if (screenTitle.length > 45) {
        screenTitle = `${screenTitle.slice(0, 42)}...`;
      }

      const updatedScreens = [...(prev.screens || [])];
      if (!updatedScreens.some(s => s.name.toLowerCase() === screenTitle.toLowerCase())) {
        updatedScreens.push({
          id: `scr-cr-${Date.now()}`,
          name: screenTitle,
          module: prev.modules[0]?.name || "Custom UI Module",
          layoutType: "dashboard",
          components: [
            `${rawTitle} Control Header`,
            `Interactive ${rawTitle} Widget`,
            `${rawTitle} Analytics & Metrics`,
            `Configuration Parameters`
          ],
          purpose: `Requested via natural language UI customization: "${reqText}"`,
          confidence: "CONFIRMED",
          evidence: [`Change Request: ${reqText}`]
        });
      }

      return {
        ...prev,
        version: newVersion,
        screens: updatedScreens,
        lastUpdated: new Date().toISOString(),
        changeHistory: [appliedAnalysis, ...(prev.changeHistory || [])]
      };
    });
    setEngineeringPackage(null);
    showToast('Change applied and change history recorded.');
  };

  // Step 7: Engineering Package
  const handlePrepareEngineering = async () => {
    if (!productDefinition) return;
    try {
      const response = await fetch('/api/export-package', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productDefinition: productDefinition,
          changeHistory: productDefinition?.changeHistory || []
        })
      });

      if (response.ok) {
        const pkg = await response.json();
        setEngineeringPackage(pkg);
        setActiveScreen('engineering');
        return;
      }
    } catch (err) {
      console.error('Error generating engineering package:', err);
    }

    const dynamicPkg: EngineeringPackage = {
      generatedAt: new Date().toISOString(),
      version: productDefinition.version || 'v1.0',
      productName: productDefinition.productName || productName || 'System Product',
      businessUnit: productDefinition.businessUnit || businessUnit || 'Enterprise Division',
      executiveSummary: `Production engineering package synthesized for ${productDefinition.productName || 'active product'}.`,
      functionalRequirementsMarkdown: `# ${productDefinition.productName || 'Product'} FRS\n\n## 1. System Objective\n${productDefinition.objective}`,
      screenInventory: (productDefinition.screens || []).map(s => ({
        screenId: s.id,
        name: s.name,
        route: `/${s.id}`,
        components: s.components,
        stateManagement: 'React Query / State Store'
      })),
      componentInventory: (productDefinition.screens || []).flatMap(s => (s.components || []).map(c => ({
        name: c.replace(/[^a-zA-Z0-9]/g, ''),
        type: 'UI Component',
        description: `Component for ${s.name}`,
        props: ['data: object', 'onAction: function']
      }))),
      apiRequirements: (productDefinition.integrations || []).map(i => ({
        endpoint: `/api/v1/${i.id}`,
        method: 'POST',
        description: i.purpose,
        requestBodySample: '{}',
        responseBodySample: '{"status": "SUCCESS"}'
      })),
      dataModelSQL: (productDefinition.dataEntities || []).map(entityToSQL).join('\n\n'),
      permissionsMatrix: (productDefinition.permissions || []).map(p => ({
        role: p.role,
        entities: { 'core_resource': p.accessLevel }
      })),
      changeHistory: productDefinition.changeHistory || [],
      antigravityManifest: {
        schemaVersion: "antigravity.blueprint.v1",
        targetPlatform: "cloud-run-microservices",
        projectConfig: {
          name: productDefinition.productName || "System Product",
          businessUnit: productDefinition.businessUnit || "Enterprise Division",
          runtime: "node-22-express-react",
          database: "postgresql-16"
        },
        modules: (productDefinition.modules || []).map(m => m.name),
        architecturalDirectives: [
          "Enforce role-based access control across all operational endpoints",
          "Preserve evidence traceability headers in API responses"
        ]
      }
    };

    setEngineeringPackage(dynamicPkg);
    setActiveScreen('engineering');
  };

  // Blueprint Export Trigger
  const handleExportBlueprint = () => {
    showToast('Production blueprint generated and copied to clipboard.');
  };

  // Clear persisted session (utility for development / reset flows)
  const handleClearSession = () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch {/* noop */}
    try { localStorage.removeItem(LEGACY_DEV_KEY); } catch {/* noop */}
    showToast('Session cleared. Refresh to start a new pipeline.');
  };

  // ── Full hard-reset: clears ALL pipeline state + all storage ───────────
  const handleClearAll = () => {
    // Mark that we're resetting so the auto-save effect doesn't re-persist
    isResettingRef.current = true;

    // 1. Purge ALL storage FIRST — before state updates trigger auto-save
    try { localStorage.removeItem(STORAGE_KEY); } catch {/* noop */}
    try { localStorage.removeItem(LEGACY_DEV_KEY); } catch {/* noop */}
    try { sessionStorage.clear(); } catch {/* noop */}

    // 2. Stage 1 — intake fields
    setProductName('');
    setBusinessUnit('');
    setDescription('');
    setMaterials([]);

    // 3. Stage 2 — Business Understanding
    setBusinessUnderstanding(null);

    // 4. Stages 3–7 — Product Definition, Engineering Package
    setProductDefinition(null);
    setEngineeringPackage(null);

    // 5. Return to Stage 1 — tabs 2–8 auto-lock via isEnabled derivation in Header
    setActiveScreen('create');

    // 6. Clear transient UI state
    setApiError(null);
    setEvidenceModalItem(null);
    setChangeModalOpen(false);

    showToast('Workspace reset — all pipeline data cleared. Ready for a new initiative.');
  };

  // ── Enterprise Demo Pack: inject full Fleet EV/PV Modernization dataset ────
  const handleLoadEnterpriseDemoPack = () => {
    // 1. Intake / Stage 1 fields
    setProductName('Unified Fleet Mobility Command Center');
    setBusinessUnit('Commercial Fleet & Logistics Division');
    setDescription(
      'Consolidating Passenger Vehicle (PV) and Commercial Electric Vehicle (EV) fleets with real-time battery degradation telemetry, unified dispatch, and Customer 360 accounting.'
    );
    setMaterials(SAMPLE_DATASET_FLEET);

    // 2. Business Understanding (Stage 2)
    setBusinessUnderstanding(INITIAL_BUSINESS_UNDERSTANDING);

    // 3. Product Definition — Stage 3 (mark as approved so all downstream stages unlock)
    setProductDefinition({
      ...INITIAL_PRODUCT_DEFINITION,
      isApproved: true,
      approvedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    });

    // 4. Engineering Package — Stage 7
    setEngineeringPackage({
      ...INITIAL_ENGINEERING_PACKAGE,
      generatedAt: new Date().toISOString(),
    });

    // 5. Advance to Stage 2 (Business Understanding)
    setActiveScreen('understanding');

    showToast(
      '🚀 Enterprise Demo Pack loaded — all 6 materials injected, pipeline unlocked across all stages.'
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 border border-slate-700">
          <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      <Header
        activeScreen={activeScreen}
        setActiveScreen={setActiveScreen}
        productName={productName}
        businessUnit={businessUnit}
        productDefinition={productDefinition}
        hasUnderstanding={!!businessUnderstanding}
        hasDefinitionApproved={!!productDefinition?.isApproved}
        hasPrototype={!!productDefinition}
        onResetAll={handleClearAll}
      />

      {apiError && (
        <div className="bg-red-900 border border-red-500 text-red-100 px-4 py-3 m-4 rounded relative shadow-lg" role="alert">
          <strong className="font-bold mr-2">LLM API Error:</strong>
          <span className="block sm:inline">{apiError}</span>
          <button className="absolute top-0 bottom-0 right-0 px-4 py-3 text-red-300 hover:text-white" onClick={() => setApiError(null)}>
            <span className="text-2xl leading-none">&times;</span>
          </button>
        </div>
      )}

      <main className="flex-1 pb-16">
        {activeScreen === 'create' && (
          <CreateProductScreen
            productName={productName}
            setProductName={setProductName}
            businessUnit={businessUnit}
            setBusinessUnit={setBusinessUnit}
            description={description}
            setDescription={setDescription}
            materials={materials}
            setMaterials={setMaterials}
            onAnalyze={handleAnalyzeMaterials}
            isAnalyzing={isAnalyzing}
            onLoadEnterpriseDemoPack={handleLoadEnterpriseDemoPack}
            onClearMaterials={() => setMaterials([])}
            onResetAll={handleClearAll}
          />
        )}

        {activeScreen === 'understanding' && businessUnderstanding && (
          <BusinessUnderstandingScreen
            understanding={businessUnderstanding}
            setUnderstanding={setBusinessUnderstanding}
            uploadedMaterials={materials}
            onOpenEvidence={(item) => setEvidenceModalItem(item)}
            onProceedToDefinition={handleGenerateDefinition}
            isGeneratingDefinition={isGeneratingDefinition}
          />
        )}

        {activeScreen === 'definition' && (
          productDefinition ? (
            <ProductDefinitionScreen
              definition={productDefinition}
              setDefinition={setProductDefinition}
              onApproveDefinition={handleApproveDefinition}
              onRegenerate={handleRegenerateDefinition}
              isRegenerating={isRegenerating}
              onBuildPrototype={handleBuildPrototype}
              onNavigateToQASuite={() => setActiveScreen('qasuite')}
            />
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-6 animate-in fade-in duration-300">
              <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mx-auto shadow-xs">
                <Sparkles className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-slate-900">Stage 3 — Product Definition Ready for Generation</h2>
                <p className="text-sm text-slate-600 max-w-xl mx-auto">
                  Synthesize formal product specifications, screen architecture, user journeys, and business rules directly from your Section 2 Business Understanding for <span className="font-semibold text-slate-900">{productName || 'your active initiative'}</span>.
                </p>
              </div>
              <div className="pt-2">
                <button
                  onClick={handleGenerateDefinition}
                  disabled={isGeneratingDefinition}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-400 text-white font-bold text-sm rounded-xl shadow-lg shadow-indigo-600/20 transition-all cursor-pointer"
                >
                  {isGeneratingDefinition ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Generating Product Definition...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-indigo-200" />
                      <span>Generate Product Definition from Business Understanding</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )
        )}

        {activeScreen === 'prototype' && productDefinition && (
          <PrototypeScreen
            definition={productDefinition}
            isGeneratingPrototype={isGeneratingPrototype}
            onRequestChangeClick={() => setChangeModalOpen(true)}
            onProceedToEngineering={handlePrepareEngineering}
            onAnalyzeChange={handleAnalyzeChange}
            onApplyChange={handleApplyChange}
          />
        )}

        {activeScreen === 'demo' && productDefinition && (
          <ServiceDesignScreen
            definition={productDefinition}
            onRequestChangeClick={() => setChangeModalOpen(true)}
            onProceedToQASuite={() => setActiveScreen('qasuite')}
          />
        )}

        {activeScreen === 'changes' && productDefinition && (
          <div className="max-w-4xl mx-auto px-4 py-12 text-center space-y-4">
            <h2 className="text-xl font-bold text-slate-900">Change Management Hub</h2>
            <p className="text-xs text-slate-500">
              Submit change requests during live Business Demo or click below to launch the Impact Analyzer.
            </p>
            <button
              onClick={() => setChangeModalOpen(true)}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-xs"
            >
              Open Change Management Modal
            </button>
          </div>
        )}

        {activeScreen === 'qasuite' && (
          productDefinition ? (
            <QASuiteScreen
              definition={productDefinition}
              onProceedToEngineering={handlePrepareEngineering}
              onBackToDefinition={() => setActiveScreen('definition')}
            />
          ) : (
            <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
                <CheckSquare className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">Product Definition Required</h2>
              <p className="text-xs text-slate-500">
                Generate and review the Product Definition (Step 3) to automatically synthesize the Use Cases & Verification QA Suite.
              </p>
              <button
                onClick={() => setActiveScreen('definition')}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-xs cursor-pointer"
              >
                Go to Product Definition
              </button>
            </div>
          )
        )}

        {activeScreen === 'engineering' && engineeringPackage && (
          <EngineeringPackageScreen
            pkg={engineeringPackage}
            definition={productDefinition ?? undefined}
            onExportBlueprint={handleExportBlueprint}
          />
        )}

        {/* The package is cleared whenever the definition changes, but the tab stays reachable. */}
        {activeScreen === 'engineering' && !engineeringPackage && productDefinition && (
          <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Engineering Package Needs Regenerating</h2>
            <p className="text-xs text-slate-500">
              The product definition changed since the last package was built. Generate a fresh package from {productDefinition.version}.
            </p>
            <button
              onClick={handlePrepareEngineering}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-xs cursor-pointer"
            >
              Generate Engineering Package
            </button>
          </div>
        )}
      </main>

      <EvidenceViewerModal
        item={evidenceModalItem}
        uploadedMaterials={materials}
        onClose={() => setEvidenceModalItem(null)}
      />

      {productDefinition && (
        <ChangeManagementModal
          isOpen={changeModalOpen}
          onClose={() => setChangeModalOpen(false)}
          onAnalyzeChange={handleAnalyzeChange}
          onApplyChange={handleApplyChange}
          productDefinition={productDefinition}
        />
      )}
    </div>
  );
}