export type ConfidenceStatus = 'CONFIRMED' | 'INFERRED' | 'AMBIGUOUS' | 'MISSING';

export type MaterialType = 'image' | 'pdf' | 'pptx' | 'docx' | 'excel' | 'text' | 'audio';

/** How the text of an uploaded file was read (src/services/materialExtractor.ts). */
export interface MaterialExtraction {
  /** read: all text used; partial: some text (long file cut, or scanned); not-read: unsupported type; error: unreadable. */
  status: 'read' | 'partial' | 'not-read' | 'error';
  /** Plain-language explanation for the BA, empty when everything was read. */
  note: string;
  chars: number;
  truncated: boolean;
}

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
  /** Set for uploaded files once their text has been read. */
  extraction?: MaterialExtraction;
}

/** Who a question is for: the BU Team (business only) or the BA & Tech Team (src/services/questionAudience.ts). */
export type Audience = 'BU' | 'TECH';

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
  /** For gaps and conflicts: which team must answer. */
  audience?: Audience;
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
  /** Which team must answer; older saved items are labelled on the fly. */
  audience?: Audience;
}

/** Structure the local engine reads from the BU's own words when no LLM is available (server/briefParser.ts). */
export interface BlueprintBrief {
  /** The record that moves through the process, e.g. from "X 360" or the stage names. */
  subject?: string;
  /** Ordered lifecycle stages from an arrow chain ("A → B → C"). */
  stages: string[];
  /** People and organisations the brief names. */
  parties: string[];
  /** The party that performs each stage, when the brief says so ("clerks log requests"). */
  stageOwners?: string[];
  /** Child records from a "<things> such as a, b, c" list. */
  parts?: { name: string; types: string[] };
  /** The BU's own statement of purpose ("Goal: ..."). */
  goal?: string;
  /** What goes wrong today ("Pain points: a; b; c"). */
  painPoints?: string[];
  /** Business rules the BU wrote down ("Rules: a; b; c"), one item each. */
  rules?: string[];
  /** How success is measured ("KPIs: a, b, c"). */
  kpis?: string[];
  /** Systems the product connects to ("Integrations: a, b, c"). */
  integrations?: string[];
  /** What each party does ("clerks log requests and file notes"), by party. */
  partyDuties?: Record<string, string[]>;
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
  /** Who designed it: an AI model ('AI') or the offline engine (absent or 'OFFLINE'). Build Prototype reuses only AI designs. */
  origin?: 'AI' | 'OFFLINE';
  /** 'phone' for screens an outside party uses on a mobile phone; shown in a phone frame. */
  device?: 'desktop' | 'phone';
  /** One chart for the screen's main trend or split. Values are sample numbers. */
  chart?: ScreenChart;
  /** Cards grouped in columns (usually one per stage or status), shown as a board. */
  board?: { columns: Array<{ title: string; cards: Array<{ title: string; subtitle: string; tag: string }> }> };
  /** Recent activity on the selected record or the whole screen, newest first. */
  timeline?: Array<{ when: string; who: string; what: string }>;
  /**
   * For a 'transaction' screen: the business document users create and move through its workflow here
   * (whatever the BU calls it). The list of existing documents is `table`; `document` describes one document.
   */
  document?: TransactionDocument;
}

/** Input kinds a document field can have. Generic: every business supplies its own labels and options. */
export type DocumentFieldKind = 'text' | 'long-text' | 'number' | 'money' | 'percent' | 'date' | 'select' | 'lookup' | 'email' | 'phone' | 'checkbox';

export interface DocumentField {
  label: string;
  kind: DocumentFieldKind;
  required?: boolean;
  /** Choices for 'select' and suggestions for 'lookup' (e.g. existing parties or items). */
  options?: string[];
  /** A realistic sample value, used when an existing document is opened. */
  sample?: string;
  /** Filled in by the system, e.g. a number or a date; shown but not editable. */
  readOnly?: boolean;
}

/** The line items of a document: a grid the user adds rows to. Amounts and totals are calculated. */
export interface DocumentLines {
  title: string;
  columns: Array<{ label: string; kind: 'text' | 'number' | 'money' | 'percent' | 'select'; options?: string[] }>;
  /** Sample lines for an existing document; each has exactly as many cells as there are columns. */
  rows: string[][];
  /** Column labels used to calculate each line's amount: quantity x price, less discount %. All optional. */
  quantityColumn?: string;
  priceColumn?: string;
  discountColumn?: string;
  /** Column holding the calculated line amount (read only). */
  amountColumn?: string;
}

export interface DocumentAction {
  label: string;
  /** Statuses in which this action is offered; empty = every status that is not final. */
  from: string[];
  /** Status after the action. */
  to: string;
  /** Who may do it, from the users of the product. */
  role?: string;
  /** The user must give a reason (e.g. rejecting). */
  needsReason?: boolean;
  /** Name of the next document this action creates (e.g. converting one document into the next one). */
  creates?: string;
}

/** A business document as the users know it: header fields in sections, optional line items, totals and a workflow. */
export interface TransactionDocument {
  /** Singular name in the BU's words. */
  name: string;
  /** Prefix of the document number, e.g. "AB-". */
  numberPrefix: string;
  sections: Array<{ title: string; fields: DocumentField[] }>;
  lines?: DocumentLines;
  /** Totals under the lines: subtotal always; discount and tax only when they apply. */
  totals?: { currency: string; discountPercent?: number; taxLabel?: string; taxPercent?: number };
  /** Statuses in order; the first is where a new document starts. */
  states: string[];
  actions: DocumentAction[];
  /** The document this one usually comes from, and the ones created from it: the chain shown on the document. */
  related?: { from?: string; next?: string[] };
}

export interface ScreenChart {
  title: string;
  kind: 'bar' | 'line' | 'donut';
  labels: string[];
  values: number[];
}

/** The application's look, chosen by the AI design step (or derived offline from the product name). */
export interface UITheme {
  /** Hex colours, e.g. "#2563eb". */
  primaryColor: string;
  accentColor: string;
  sidebarStyle: 'dark' | 'light' | 'brand';
  density: 'comfortable' | 'compact';
}

/** What the AI found before designing: comparable apps, what to borrow, and the visual direction. */
export interface DesignResearch {
  comparableApps: Array<{ name: string; category: string; whatToBorrow: string[] }>;
  designDirection: string;
  screenPatterns: Array<{ screenId: string; pattern: string; why: string }>;
  /** Web pages the research read, when the provider searched the web. */
  sources: Array<{ title: string; url: string }>;
  /** Who did the research, e.g. "gemini-3.1-pro-preview with Google Search". */
  model?: string;
}

export interface ScreenDefinition {
  ui?: ScreenUISpec;
  id: string;
  name: string;
  module: string;
  layoutType: 'dashboard' | 'table-detail' | 'form-wizard' | 'split-view' | 'profile-360' | 'transaction';
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
  /** Which team must answer; older saved items are labelled on the fly. */
  audience?: Audience;
}

export interface ProductDefinition {
  benchmark?: BenchmarkInfo;
  /** Set by the local engine; carries the parsed brief to the definition and prototype steps. */
  blueprintBrief?: BlueprintBrief;
  /** Problems found while normalising inferred field constraints (dropped patterns, clamped ranges). */
  constraintWarnings?: string[];
  /** Look of the prototype, set by the AI design step. */
  uiTheme?: UITheme;
  /** Research the AI did before designing the prototype (absent when a reference screen was given or offline). */
  designResearch?: DesignResearch;
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
