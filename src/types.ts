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
  /** Field specifications carried by data-entity evidence items (used by the deterministic engine). */
  fields?: DataFieldDefinition[];
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

/** Structure the local engine reads from the BU's own words when no LLM is available (server/briefParser.ts). */
export interface BlueprintBrief {
  /** The record that moves through the process, e.g. from "X 360" or the stage names. */
  subject?: string;
  /** Ordered lifecycle stages from an arrow chain ("A → B → C"). */
  stages: string[];
  /** People and organisations the brief names. */
  parties: string[];
  /** Child records from a "<things> such as a, b, c" list. */
  parts?: { name: string; types: string[] };
}

/** Set when the BU input was thin and requirements were predicted from industry patterns. */
export interface BenchmarkInfo {
  applied: boolean;
  industry: string;
  reason: string;
}

export interface BusinessUnderstanding {
  benchmark?: BenchmarkInfo;
  /** Set by the local engine; carries the parsed brief to the definition and prototype steps. */
  blueprintBrief?: BlueprintBrief;
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
  /** Name of the data entity a form-wizard screen creates or edits, exactly as in dataEntities. */
  entity?: string;
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

/** Generic value shapes. Domains supply values for these; the engine has no domain knowledge. */
export type FieldFormat =
  | 'text' | 'free-text' | 'identifier'
  | 'email' | 'phone' | 'url' | 'uuid'
  | 'date' | 'datetime' | 'time'
  | 'integer' | 'decimal' | 'percentage' | 'boolean' | 'enum'
  | 'currency-code' | 'country-code' | 'postal-code';

export type FieldSensitivity = 'none' | 'pii' | 'financial' | 'credential';

/** Where a constraint or field came from: stated by the BU, predicted by the model, or added by the system. */
export type ConstraintOrigin = 'BU' | 'INFERRED' | 'SYSTEM';

export interface FieldConstraints {
  format?: FieldFormat;
  minLength?: number;
  maxLength?: number;
  /** Regular expression source (no delimiters). Untrusted: checked by isSafePattern before use. */
  pattern?: string;
  min?: number;
  max?: number;
  step?: number;
  /** Maximum decimal places for decimal/percentage values. */
  precision?: number;
  enumValues?: string[];
  unique?: boolean;
  immutable?: boolean;
  sensitivity?: FieldSensitivity;
}

export interface DataFieldDefinition {
  name: string;
  type: string;
  required: boolean;
  notes?: string;
  /** Explicit constraints. Legacy `type` strings such as "string(17)" or "enum(A, B)" are still honoured. */
  constraints?: FieldConstraints;
  origin?: ConstraintOrigin;
  /** 'system' fields are set by the server and rejected if a client sends them. */
  source?: 'user' | 'system' | 'derived';
}

export type RuleOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'notIn' | 'present' | 'absent';

/** Small fixed rule vocabulary; each domain only supplies field names and values. */
export interface EntityRule {
  id: string;
  kind: 'conditional' | 'compare' | 'requiredTogether' | 'mutuallyExclusive';
  message: string;
  /** conditional: when `when` holds, `target` becomes required or forbidden. */
  when?: { field: string; op: RuleOp; value?: string };
  effect?: 'required' | 'forbidden';
  target?: string;
  /** compare: `left op right` must hold when both are present. */
  left?: string;
  op?: 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'neq';
  right?: string;
  /** requiredTogether / mutuallyExclusive: the fields involved. */
  fields?: string[];
  origin?: ConstraintOrigin;
}

export interface EntityLifecycle {
  statusField: string;
  states: string[];
  initial: string;
  transitions: Array<{ from: string; to: string }>;
}

export interface DataEntityDefinition {
  id: string;
  name: string;
  description: string;
  fields: DataFieldDefinition[];
  relationships: string[];
  confidence: ConfidenceStatus;
  evidence: string[];
  lifecycle?: EntityLifecycle;
  rules?: EntityRule[];
  /** Rules that need storage to enforce (uniqueness, capacity, references). Documented for the real backend. */
  crossRecordRules?: string[];
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
  /** Set by the local engine; carries the parsed brief to the definition and prototype steps. */
  blueprintBrief?: BlueprintBrief;
  /** Problems found while normalising inferred field constraints (dropped patterns, clamped ranges). */
  constraintWarnings?: string[];
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
