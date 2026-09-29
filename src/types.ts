export type ConfidenceStatus = 'CONFIRMED' | 'INFERRED' | 'AMBIGUOUS' | 'MISSING';

export type MaterialType = 'image' | 'pdf' | 'pptx' | 'docx' | 'excel' | 'text' | 'audio';

export interface UploadedMaterial {
  id: string;
  filename: string;
  fileType: MaterialType;
  sizeBytes: number;
  uploadedAt: string;
  previewUrl?: string;
  contentSnippet?: string;
  status: 'uploaded' | 'processing' | 'ready' | 'error';
  tags?: string[];
}

export interface EvidenceItem {
  id: string;
  title: string;
  description: string;
  status: ConfidenceStatus;
  evidenceReferences: string[];
  supportingDetail?: string;
  contradictions?: string;
  category?: string;
  name?: string;
  role?: string;
  path?: string;
  evidenceRef?: string;
}

export interface ClarificationItem {
  id: string;
  type: 'BLOCKER: CONTRADICTION' | 'HIGH: MISSING LOGIC' | 'MEDIUM: PERMISSION GAP';
  question: string;
  impactIfIgnored: string;
  askedAt: string; // ISO timestamp or formatted
  status: 'OPEN' | 'ANSWERED';
  answer?: string;
  answeredAt?: string; // Timestamp when user submits answer
  answeredBy?: string; // Default: 'Business Unit / Product Lead'
}

/** Set when the BU input was thin and requirements were predicted from industry patterns. */
export interface BenchmarkInfo {
  applied: boolean;
  industry: string;
  reason: string;
}

export interface BusinessUnderstanding {
  benchmark?: BenchmarkInfo;
  businessObjective: EvidenceItem;
  personas: EvidenceItem[];
  modules: EvidenceItem[];
  screens: EvidenceItem[];
  userJourneys: EvidenceItem[];
  businessRules: EvidenceItem[];
  dataEntities: EvidenceItem[];
  integrations: EvidenceItem[];
  uiObservations: EvidenceItem[];
  conflicts: EvidenceItem[];
  missingInformation: EvidenceItem[];
  clarifications?: ClarificationItem[];
  overallSummary: string;
  summary?: string;
  extractedAt: string;
}

export interface PersonaDefinition {
  id: string;
  name: string;
  role: string;
  keyGoals: string[];
  permissions: string[];
  confidence: ConfidenceStatus;
  evidence: string[];
}

export interface ModuleDefinition {
  id: string;
  name: string;
  description: string;
  screens: string[];
  confidence: ConfidenceStatus;
  evidence: string[];
}

/** Data-driven UI blueprint for a screen. Sample values are illustrative, not real data. */
export interface ScreenUISpec {
  kpis: Array<{ label: string; value: string; trend: 'up' | 'down' | 'flat'; delta: string }>;
  filters: string[];
  table: { title: string; columns: string[]; rows: string[][] };
  detailPanels: Array<{ title: string; items: Array<{ label: string; value: string }> }>;
  primaryActions: string[];
  /** Why this layout was chosen, e.g. which industry pattern it mirrors. */
  benchmarkNote?: string;
}

export interface ScreenDefinition {
  ui?: ScreenUISpec;
  id: string;
  name: string;
  module: string;
  layoutType: 'dashboard' | 'table-detail' | 'form-wizard' | 'split-view' | 'profile-360';
  components: string[];
  purpose: string;
  confidence: ConfidenceStatus;
  evidence: string[];
}

export interface NavigationItem {
  id: string;
  label: string;
  screenId: string;
  icon: string;
  badge?: string;
  allowedRoles: string[];
}

export interface UserJourneyDefinition {
  id: string;
  name: string;
  persona: string;
  steps: string[];
  outcome: string;
  confidence: ConfidenceStatus;
  evidence: string[];
}

export interface BusinessRuleDefinition {
  id: string;
  code: string;
  rule: string;
  context: string;
  confidence: ConfidenceStatus;
  evidence: string[];
}

export interface DataFieldDefinition {
  name: string;
  type: string;
  required: boolean;
  notes?: string;
}

export interface DataEntityDefinition {
  id: string;
  name: string;
  description: string;
  fields: DataFieldDefinition[];
  relationships: string[];
  confidence: ConfidenceStatus;
  evidence: string[];
}

export interface IntegrationDefinition {
  id: string;
  system: string;
  protocol: string;
  purpose: string;
  confidence: ConfidenceStatus;
  evidence: string[];
}

export interface PermissionRule {
  role: string;
  accessLevel: 'Full Admin' | 'Read/Write' | 'Read Only' | 'Restricted Segment';
  constraints: string;
}

export interface NotificationRule {
  event: string;
  channel: string;
  recipient: string;
}

export interface ValidationRule {
  field: string;
  validationRule: string;
  errorMessage: string;
}

export interface AssumptionItem {
  id: string;
  statement: string;
  riskLevel: 'low' | 'medium' | 'high';
  status: 'pending-validation' | 'accepted' | 'challenged';
}

export interface OpenQuestionItem {
  id: string;
  question: string;
  urgency: 'blocking' | 'important' | 'nice-to-have';
  assignedTo?: string;
  status: 'open' | 'answered';
}

export interface ProductDefinition {
  benchmark?: BenchmarkInfo;
  id: string;
  version: string;
  productName: string;
  businessUnit: string;
  objective: string;
  personas: PersonaDefinition[];
  modules: ModuleDefinition[];
  screens: ScreenDefinition[];
  navigation: NavigationItem[];
  userJourneys: UserJourneyDefinition[];
  businessRules: BusinessRuleDefinition[];
  dataEntities: DataEntityDefinition[];
  integrations: IntegrationDefinition[];
  permissions: PermissionRule[];
  notifications: NotificationRule[];
  validations: ValidationRule[];
  assumptions: AssumptionItem[];
  openQuestions: OpenQuestionItem[];
  evidenceMapping: Record<string, string[]>;
  changeHistory: ChangeImpactAnalysis[];
  isApproved: boolean;
  approvedAt?: string;
  lastUpdated: string;
}

export interface ChangeImpactAnalysis {
  id: string;
  timestamp: string;
  changeRequested: string;
  affectedAreas: {
    screens: string[];
    workflows: string[];
    businessRules: string[];
    data: string[];
    apis: string[];
    integrations: string[];
    permissions: string[];
  };
  newRequirement: string;
  potentialSideEffects: string[];
  status: 'pending' | 'applied' | 'rejected';
  versionApplied?: string;
}

export interface EngineeringPackage {
  generatedAt: string;
  version: string;
  productName: string;
  businessUnit: string;
  executiveSummary: string;
  functionalRequirementsMarkdown: string;
  screenInventory: Array<{
    screenId: string;
    name: string;
    route: string;
    components: string[];
    stateManagement: string;
  }>;
  componentInventory: Array<{
    name: string;
    type: string;
    description: string;
    props: string[];
  }>;
  apiRequirements: Array<{
    endpoint: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    description: string;
    requestBodySample: string;
    responseBodySample: string;
  }>;
  dataModelSQL: string;
  permissionsMatrix: Array<{
    role: string;
    entities: Record<string, string>;
  }>;
  changeHistory: ChangeImpactAnalysis[];
  antigravityManifest: {
    schemaVersion: string;
    targetPlatform: string;
    projectConfig: Record<string, any>;
    modules: string[];
    architecturalDirectives: string[];
  };
  endpoints?: string[];
  schemas?: string[];
}

export type ActiveScreen = 
  | 'create' 
  | 'understanding' 
  | 'definition' 
  | 'prototype' 
  | 'demo' 
  | 'changes' 
  | 'qasuite'
  | 'engineering';
