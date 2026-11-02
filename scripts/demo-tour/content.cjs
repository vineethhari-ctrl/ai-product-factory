/** What to say about each screen, and what to point at. Merged over the shot specs in spec.cjs by id. */
module.exports = {
  'evidence-modal': {
    chapter: 'understand', title: 'Click any item to see where it came from',
    lead: 'Every role, module, screen and rule can be opened to show the requirement as the factory understood it, whether it was stated or proposed, and the evidence behind it. With uploaded documents the citation names the file and the passage.',
    value: 'This is the answer to \u201cwhere did that come from?\u201d, available on every item.',
    pins: [
      { at: 'text:EXTRACTED REQUIREMENT DETAIL', label: 'The requirement', note: 'What the factory understood, in plain words.' },
      { at: 'text:CORROBORATING EVIDENCE CITATIONS', label: 'The evidence', note: 'The source: a passage of your file, or the comparable practice it was proposed from.' },
    ],
  },
  'eng-api': {
    title: 'API contracts for every record',
    lead: 'For each record the plan lists the calls a developer needs: list, create, read, change and status change, plus one per integration. A row opens to show the request and the response with sample data, and the description names the roles allowed and the error cases.',
    pins: [
      { at: 'up:2:text:API contracts (', label: 'Contracts', note: 'Method, endpoint and what it does.' },
    ],
  },
  'eng-backlog': {
    title: 'A backlog the team can start from',
    lead: 'Stories are grouped into epics, each with acceptance lines and a trace back to the BRD item it implements.',
    value: 'A story that traces to no requirement does not exist, and a requirement with no story is visible.',
    pins: [
      { at: 'up:2:text:Backlog (', label: 'Epics and stories', note: 'Each story says what \u201cdone\u201d means.' },
    ],
  },
  'brd-overview': {
    title: 'Executive overview: the one-page version',
    lead: 'A leadership reader gets the problem, the objective and the product modules on one page, without opening the full document. Each module shows its confidence and where it came from.',
    value: 'This is the page to put in front of a sponsor first.',
    pins: [
      { at: 'up:2:text:PRODUCT PROBLEM STATEMENT & OBJECTIVE', label: 'Problem and objective', note: 'Written from the business’s own words: the goal, the pains and how success is measured.' },
      { at: 'up:2:text:CORE FUNCTIONAL MODULES', label: 'Product modules', note: 'The product broken into modules the business recognises. Here, the joiner stages grouped into delivery phases.' },
      { at: 'textx:INFERRED', label: 'Stated or proposed', note: 'A blue INFERRED badge means the factory proposed it. Stated items show CONFIRMED in green.' },
      { at: 'text:Evidence: Industry benchmark', label: 'Where it came from', note: 'Each item says whether it came from the business’s file or from comparable practice.' },
    ],
  },
  'brd-approach': {
    title: 'Solution Approach Note for leadership',
    lead: 'A short leadership note: the problems, the proposed solution, the choices considered, the rollout in phases, the risks and the decisions needed. With an AI key it is written by Gemini or Claude for this product; without one it is derived by rules, and the screen says which.',
    value: 'The same note goes into the BU pack as a Word file.',
    pins: [
      { at: 'up:2:text:Enterprise Solution Approach Note', label: 'Document header', note: 'A document ID and the review audience.' },
      { at: 'btn:Copy Approach Note for BU / Leadership', label: 'Copy for email', note: 'The whole note as plain text.' },
      { at: 'up:1:text:Derived from the BRD by rules', label: 'Who wrote it', note: 'Derived by rules, or written by the AI. One click to ask the AI.' },
      { at: 'btn:Write with AI', label: 'Write with AI', note: 'Asks the AI to write the note for this specific BRD.' },
      { at: 'up:2:text:2. PROBLEMS TODAY', label: 'Problems today', note: 'The pains the business stated, one per line.' },
      { at: 'up:2:text:3. PROPOSED SOLUTION', label: 'Proposed solution', note: 'How the product answers each problem.' },
    ],
  },
  'fitgap-top': {
    title: 'The SAP fit-gap: how the platform meets each requirement',
    lead: 'Because this initiative is an SAP implementation, the factory adds a fit-gap: every requirement is placed as Standard (works as delivered), Configuration (met by settings), Development (something is built), Process change (the business adopts SAP’s standard way) or Third-party. Each row says how SuccessFactors meets it and how any gap is closed.',
    value: 'This is the page a SAP consultant would build in the fit-gap workshops, produced in minutes as a first view. With an AI key it is written using the model’s SAP knowledge and flags every uncertain fit “to be confirmed”.',
    pins: [
      { at: 'text:PACKAGE IMPLEMENTATION', label: 'Appears for SAP projects', note: 'The tab and the rest of the pack change with the delivery type you chose on the first screen.' },
      { at: 'text:A platform consultant must confirm', label: 'Honest about its limits', note: 'In rules mode it says the fits are a first view. A SAP consultant confirms each one in the workshops.' },
      { at: 'union:btn:Copy fit-gap||btn:Assess with AI', label: 'Copy or reassess', note: 'Copy the fit-gap as text, or ask the AI to assess it against SAP.' },
      { at: 'text:requirements assessed against', label: 'The headline', note: 'How much is standard, configuration or development, and how many record types must be migrated.' },
      { at: 'union:btn:All (||btn:Standard (||btn:Configuration (||btn:Development (', label: 'Filter by fit', note: 'Click Development to see only what has to be built.' },
      { at: 'text:Gap and how it is closed', label: 'How the gap is closed', note: 'For everything that is not standard: what is missing and how it is covered.' },
    ],
  },
  'fitgap-rows': {
    title: 'Development objects and data migration',
    lead: 'Everything that has to be built is listed by type: reports, interfaces, conversions, enhancements, forms and workflows, each with its complexity. Every record type to migrate is listed with where its data comes from today.',
    value: 'These two lists size the work: they are what the effort estimate in the proposal is built from.',
    pins: [
      { at: 'up:2:text:Development objects', label: 'What will be built', note: 'Grouped by type, so a delivery lead sees at once how many reports, interfaces and conversions are needed.' },
      { at: 'up:2:text:Data migration (', label: 'What must be migrated', note: 'Each record type, its source and its complexity.' },
    ],
  },
  'brd-personas': {
    title: 'Roles and what each can do',
    lead: 'Every role has goals and permissions. The BU confirms who exists and what each role may see and change before anything is built.',
    pins: [
      { at: 'up:2:text:ENTERPRISE PERSONAS & ACCESS ROLES', label: 'Role cards', note: 'One card per role, with its confidence badge.' },
      { at: 'text:KEY RESPONSIBILITIES', label: 'What the role does', note: 'Taken from the “who does what” line of the note.' },
      { at: 'text:Permissions:', label: 'What it may do', note: 'Read, write, approve. Becomes the access design in SAP.' },
    ],
  },
  'brd-screens': {
    title: 'Screens, one per job',
    lead: 'The screens the users will work in, grouped by module, with the components each one carries. This is what the prototype is built from.',
    pins: [
      { at: 'up:2:text:SCREEN INVENTORY & COMPONENT TOPOLOGY', label: 'Screen inventory', note: 'Eight screens for this process: a command centre, an intake form, a work queue per stage, a joiner 360 view and a performance page.' },
      { at: 'text:Module:', label: 'Which module', note: 'Each screen belongs to a module.' },
      { at: 'text:EMBEDDED COMPONENTS', label: 'Components', note: 'The building blocks on the screen: tiles, queues, hand-off details, proof of record.' },
    ],
  },
  'brd-rules': {
    title: 'Business rules, stated so they can be tested',
    lead: 'Each rule has a code, a plain sentence, where it applies and whether the business stated it. The five rules in the note are CONFIRMED; the rest are proposed from how comparable processes are controlled (an audit trail, SLA flags, masking of personal data).',
    value: 'Every rule becomes a test case and an SAP configuration or development line later, so none can be lost.',
    pins: [
      { at: 'up:2:text:BUSINESS RULES CATALOG', label: 'Rule catalogue', note: 'Eleven rules for this process.' },
      { at: 'text:BR-001', label: 'Rule code', note: 'A stable code used by tests, fit-gap rows and the proposal.' },
      { at: 'textx:CONFIRMED', label: 'Stated by the business', note: 'Green means the business said it. The rest are proposals.' },
      { at: 'text:Evidence Citation: BU brief', label: 'Evidence', note: 'Points back to the source.' },
    ],
  },
  'brd-data': {
    title: 'Data model with field rules',
    lead: 'For every record the factory proposes the fields, which are required, and the rule on each value: length, format, range, allowed values, whether it is personal or financial data. The business can confirm a field or mark it required here.',
    value: 'Field rules are written once and used by the prototype form, the test cases and the engineering plan.',
    pins: [
      { at: 'text:DATA ENTITIES & FIELD SPECIFICATIONS', label: 'Records', note: 'The business records and their fields.' },
      { at: 'text:CONSTRAINTS', label: 'Constraints', note: 'Length, pattern, range, allowed values, personal data flags.' },
      { at: 'text:ORIGIN', label: 'Who defined it', note: 'SYSTEM for fields the platform adds; INFERRED for proposals.' },
      { at: 'text:Confirm', label: 'Confirm a field', note: 'One click turns a proposed field into a decision.' },
    ],
  },
  'brd-integrations': {
    title: 'Systems it must talk to',
    lead: 'The five systems named in the note (SuccessFactors Recruiting, S/4HANA cost centres and positions, payroll, identity and access, e-signature) are listed with the reason for each. The integration choice (API or file) is left “to confirm”.',
    value: 'Each one becomes an interface line in the SAP fit-gap and an activity in the estimate.',
    pins: [
      { at: 'text:SYSTEM INTEGRATIONS & APIS', label: 'Connections', note: 'One card per system.' },
      { at: 'text:REST API or file exchange', label: 'To be confirmed', note: 'The technical method is a question for the technology team, not an invented answer.' },
      { at: 'textx:CONFIRMED', label: 'Named by the BU', note: 'These came from the business’s own list.' },
    ],
  },
  'brd-governance': {
    title: 'Access control and governance',
    lead: 'A role-based access matrix shows what each role may do, with the approval and risk points the process needs.',
    pins: [
      { at: 'text:ROLE-BASED ACCESS CONTROL (RBAC) MATRIX', label: 'Access matrix', note: 'Role by role: read, write or approve.' },
      { at: 'text:Read/Write', label: 'Access level', note: 'The level each role gets.' },
    ],
  },
  'brd-tests': {
    title: 'Use cases and tests come from the same BRD',
    lead: 'Because every rule, journey and record is already written down, the factory derives use cases and test scenarios from them. Each use case lists who, before, trigger, flow and after.',
    value: 'The next chapter shows the full test suite.',
    pins: [
      { at: 'text:Baseline Verified', label: 'Traceability', note: 'Every rule has a test.' },
      { at: 'union:btn:Export Test Suite||btn:Open Dedicated QA Suite', label: 'Open the QA suite', note: 'The dedicated page for the test team.' },
      { at: 'text:UC-001', label: 'Use case', note: 'Actor, trigger, pre-condition, main flow.' },
      { at: 'text:Post-Condition', label: 'Expected outcome', note: 'What must be true at the end.' },
    ],
  },
  'approved': {
    title: 'Approval locks the baseline',
    lead: 'When the BU is happy, Approve locks the BRD as the baseline. The status changes to Locked & Approved, a change after that goes through change control, and the prototype is unlocked.',
    pins: [
      { at: 'text:Locked & Approved by Business', label: 'Locked and approved', note: 'The status the BU signs for.' },
      { at: 'btn:Lock Baseline & Notify BU', label: 'Notify the BU', note: 'Sends the baseline to the BU for sign-off.' },
      { at: 'btn:Build Prototype', label: 'Build the prototype', note: 'Turns the BRD into a working application. The green Launch Prototype button above does the same.' },
    ],
  },
  'proto-app': {
    title: 'The prototype: the finished application, working',
    lead: 'The BRD becomes a clickable application with a menu, a search, a signed-in user and real workflow. The BU can move a joiner from one stage to the next, see each role’s view, and judge the product as a user, not as a document.',
    value: 'Prototype screens are designed from the process, the roles and the rules. With an AI key the AI designs each screen for its job, after researching comparable apps.',
    pins: [
      { at: 'union:btn:Application view||btn:Data & schema', label: 'Two views', note: 'The application as a user sees it, or the data behind it.' },
      { at: 'btn:Design tools', label: 'Design tools', note: 'Add a reference screenshot, or ask the AI to design the screens.' },
      { at: 'up:1:text:Role:', label: 'Switch role', note: 'See the application as each role sees it.' },
      { at: 'btn:Request Change', label: 'Request a change', note: 'Opens change control with an impact analysis.' },
      { at: 'union:btn:Export prototype||btn:BU demo pack||btn:All docs (Word)', label: 'Take it with you', note: 'Export the prototype, the BU pack or every document as Word.' },
      { at: 'rect:20,334,258,566', label: 'Application menu', note: 'Screens grouped by module, in the order of the process.' },
      { at: 'rect:304,520,1090,380', label: 'Work queue', note: 'Real documents with status chips. Click any row to open it.' },
    ],
  },
  'proto-doc': {
    title: 'Open a joiner: the workflow is real',
    lead: 'Each joiner is a document that moves through the lifecycle. The stage buttons only offer the moves the rules allow, the status stepper shows where it is, and fields lock once the joiner has moved on.',
    value: 'This is where the BU feels whether the process is right. A change here costs minutes; a change after build costs weeks.',
    pins: [
      { at: 'union:btn:Move to First 90 Days||btn:Move to On Hold', label: 'Only legal moves', note: 'The buttons shown are the transitions the rules permit from this stage.' },
      { at: 'up:3:text:Offer Accepted', label: 'Status stepper', note: 'Done stages are ticked; the current stage is highlighted.' },
      { at: 'up:2:text:Joiner Onboarding details', label: 'Fields with rules', note: 'Required fields are starred and checked as you type.' },
      { at: 'up:2:text:Summary', label: 'Summary and next steps', note: 'Number, status and what can happen next, plus why fields are locked.' },
    ],
  },
  'proto-role': {
    title: 'Every role sees its own view',
    lead: 'Switch the role and the same joiner is shown the way that role may see it. The Compliance Auditor here sees every field but cannot change anything: the stage buttons are greyed out and the screen says View only.',
    value: 'The BU can check who can see and change what, before access is designed in SAP.',
    pins: [
      { at: 'text:View only', label: 'View only', note: 'A role without write access sees the record locked.' },
      { at: 'union:btn:Move to First 90 Days||btn:Move to On Hold', label: 'Stage buttons greyed out', note: 'Moves are not offered to a read-only role.' },
    ],
  },
  'proto-dashboard': {
    title: 'Command centre for HR leadership',
    lead: 'The command centre shows the numbers a CHRO asks for: how many joiners are in flight, how many are stalled beyond SLA, the average days from offer to record, and a trend. Clicking a stage filters the list.',
    value: 'The figures are sample data, shaped by the lifecycle, so the BU reacts to the layout and the questions it answers.',
    pins: [
      { at: 'text:ACTIVE JOINER ONBOARDINGS', label: 'KPI tiles', note: 'The KPIs named in the note, with trend.' },
      { at: 'up:2:text:Work by stage', label: 'Work by stage', note: 'Click a stage to filter.' },
      { at: 'up:2:text:completed per week', label: 'Trend', note: 'A live chart drawn from the sample data.' },
      { at: 'btn:Review Stalled', label: 'Main action', note: 'The one thing a leader does from this page.' },
    ],
  },
  'proto-360': {
    title: 'Joiner 360: one joiner, every stage, with proof',
    lead: 'One page shows where a joiner stands, who completed each stage, when and with what evidence. Evidence can be attached and the proof of record exported for audit.',
    pins: [
      { at: 'text:CURRENT STAGE', label: 'Where the joiner is', note: 'Stage, days since start, open issues.' },
      { at: 'union:btn:Attach Evidence||btn:Export Proof of Record', label: 'Evidence and proof', note: 'Attach a document; export the proof of record.' },
      { at: 'up:2:text:Recent activity', label: 'Recent activity', note: 'Who did what, when.' },
    ],
  },
  'proto-form': {
    title: 'Intake form with rules built in',
    lead: 'The intake screen is a real form. Required fields are starred, each field says whether it is stated or proposed, and character limits are shown. The field rules from the data model are applied as you type.',
    pins: [
      { at: 'text:Step 1', label: 'Steps', note: 'A long form is split into steps.' },
      { at: 'text:inferred', label: 'Proposed field', note: 'Marks fields the BU has not yet confirmed.' },
      { at: 'text:0/120', label: 'Limits shown', note: 'The length limit from the data model.' },
      { at: 'text:Next', label: 'Next', note: 'Moves on only when the step is valid.' },
    ],
  },
  'proto-form-error': {
    title: 'Mistakes are caught as you type',
    lead: 'A title that is too short and an email that is not an email are flagged as soon as you leave the field, with a message in plain words. The same field rules run on the server, so the prototype and the real build behave alike.',
    value: 'The BU sees the validation rules they agreed to, working.',
    pins: [
      { at: 'text:title must be at least 5', label: 'Length rule', note: 'The title must be 5 to 120 characters.' },
      { at: 'text:contactEmail must be a valid email', label: 'Email rule', note: 'The email must be a valid address.' },
      { at: 'text:Recent Offer Accepted Records', label: 'The queue below', note: 'Saved records appear underneath, with their stage and owner.' },
    ],
  },
  'proto-schema': {
    title: 'Data and schema view',
    lead: 'The same prototype can be flipped to its data: the scope, the rules in force, the main journey and the record layout with sample rows.',
    pins: [
      { at: 'text:FUNCTIONAL SCOPE', label: 'Scope tiles', note: 'Modules, screens, rules and the main record at a glance.' },
      { at: 'up:2:text:DATA SCHEMA GRID', label: 'Schema grid', note: 'Fields of the main record with sample values.' },
    ],
  },
  'proto-design': {
    title: 'Design tools: make it look like your own application',
    lead: 'Add a screenshot of a screen you like and the AI copies its layout, never its words or data. Or type a change in plain words and apply it instantly. With an AI key, Design with AI researches comparable applications and designs each screen for its job.',
    pins: [
      { at: 'up:2:text:Screens made by the offline engine', label: 'Who designed it', note: 'Says plainly whether the AI or the built-in engine made the screens.' },
      { at: 'btn:Add reference screen', label: 'Reference screen', note: 'Optional screenshot; the AI follows its layout.' },
      { at: 'btn:Design with AI', label: 'Design with AI', note: 'Research, then design, in one click.' },
      { at: 'text:Instant UI Customizer', label: 'Instant changes', note: 'Type “add a cost calculator screen” and apply.' },
    ],
  },
  'change-modal': {
    title: 'Change control, in plain words',
    lead: 'During a demo the BU will ask for changes. Type the change, or pick a common one, and the factory works out what it touches.',
    pins: [
      { at: 'up:2:text:Describe desired business change', label: 'Describe the change', note: 'In the business’s own words.' },
      { at: 'text:Add advanced audit logging', label: 'Common changes', note: 'One-click starters.' },
      { at: 'btn:Analyze Impact', label: 'Analyze impact', note: 'A small fast AI step.' },
    ],
  },
  'change-result': {
    title: 'Impact before commitment',
    lead: 'The factory shows which screens, workflows, rules and data are affected, then lets the BA apply the change to the prototype and the specification, or reject it. Every change is logged in the version history.',
    value: 'This is how “can we also add…” becomes a conversation about scope and cost, with the facts on the table.',
    pins: [
      { at: 'text:Synthesized Impact Matrix', label: 'Impact matrix', note: 'What the change touches.' },
      { at: 'text:Affected Screens', label: 'Screens', note: 'Which screens change.' },
      { at: 'text:Affected Workflows', label: 'Workflows', note: 'Which journeys change.' },
      { at: 'union:btn:Reject Change||btn:Apply Change to Prototype & Specs', label: 'Decide', note: 'Reject it, or apply it to both the prototype and the BRD.' },
    ],
  },
  'blueprint': {
    title: 'Service blueprint: what the user sees and what happens behind',
    lead: 'The journey is drawn in layers: what the user does, what they see, and the business logic behind it. Press Simulate Step to walk through it. Each step lights up in every layer at once.',
    pins: [
      { at: 'union:btn:Reset Demo||btn:Simulate Step', label: 'Walk the journey', note: 'Step through the journey.' },
      { at: 'text:CUSTOMER / USER LAYER', label: 'User layer', note: 'Who does what.' },
      { at: 'text:FRONTSTAGE (VISIBLE UI)', label: 'What is visible', note: 'The screen at each step.' },
      { at: 'text:BACKSTAGE (BUSINESS LOGIC)', label: 'What happens behind', note: 'The rules applied at each step.' },
      { at: 'btn:Proceed to QA Suite', label: 'Next', note: 'Move on to the test suite.' },
    ],
  },
  'blueprint-kpi': {
    title: 'KPI commitments tied to rules',
    lead: 'Each rule carries a measurable service target, such as response time or availability, with a status. The BU sees what the product promises.',
    pins: [
      { at: 'text:SLA Commitments & KPI Targets', label: 'Commitments', note: 'Targets derived from the rules.' },
      { at: 'text:ON TARGET', label: 'Status', note: 'Shown on each tile.' },
    ],
  },
  'qa-top': {
    title: 'Use Cases and QA: a test suite from the same BRD',
    lead: 'Five formal use cases, 36 scenarios and 36 executable test cases, with every one of the 11 rules traced to at least one test. This version is derived by rules; the AI writes a richer suite when a key is attached, and holds each test case to a quality bar: at least three steps and a measurable expected result.',
    pins: [
      { at: 'text:11 of 11 rules traced to tests', label: 'Full rule coverage', note: 'No rule can slip through untested.' },
      { at: 'up:2:text:Derived from this BRD by rules', label: 'Who wrote it', note: 'Rules or AI, always stated.' },
      { at: 'btn:Copy Test Suite for Jira / UAT', label: 'Copy to Jira', note: 'Paste into a ticket or a UAT sheet.' },
      { at: 'text:BUSINESS RULE COVERAGE', label: 'Coverage tiles', note: 'Use cases, scenarios, test cases and rule coverage.' },
      { at: 'text:1. Formal Use Cases', label: 'Four views', note: 'Use cases, scenario matrix, executable test cases and the automated feature file.' },
    ],
  },
  'qa-matrix': {
    title: 'Scenario coverage matrix',
    lead: 'Every scenario is positive, negative, boundary or edge, with the target module, a risk rating and how it is verified. Each rule appears twice: once when it holds and once when it is broken.',
    pins: [
      { at: 'text:Scenario Coverage & Risk Categorization Matrix', label: 'Matrix', note: 'Coverage by vector and risk.' },
      { at: 'css:table tbody tr:first-child td:nth-child(2)', label: 'Vector type', note: 'Positive, negative, boundary, edge.' },
      { at: 'text:CRITICAL', label: 'Risk rating', note: 'Critical, high, medium or low.' },
    ],
  },
  'qa-cases': {
    title: 'Executable test cases with real test data',
    lead: 'Each test case carries its preconditions, a test payload in the product’s own field names, numbered steps and an expected result.',
    pins: [
      { at: 'text:TC-001', label: 'Test case', note: 'Id, vector and status.' },
      { at: 'text:TEST INPUT PAYLOAD', label: 'Test data', note: 'Ready to use in a test tool.' },
      { at: 'text:EXECUTION STEPS', label: 'Steps', note: 'Numbered, in order.' },
      { at: 'text:Expected Result', label: 'Expected result', note: 'A measurable outcome.' },
    ],
  },
  'qa-bdd': {
    title: 'Automated checks as a feature file',
    lead: 'The same scenarios are written as a Gherkin feature file that automated test tools can run. Download it or copy it.',
    pins: [
      { at: 'btn:Download .feature File', label: 'Download', note: 'A ready-made feature file.' },
      { at: 'text:Gherkin v6', label: 'Gherkin', note: 'Given, When, Then.' },
    ],
  },
  'eng-top': {
    title: 'Engineering package: the hand-off to the delivery team',
    lead: 'The package turns the BRD into what a delivery team needs: architecture, services, API contracts, events, quality targets, security controls, a backlog with acceptance criteria, deployment and a test strategy. One click downloads everything.',
    pins: [
      { at: 'btn:All documents as Word (.docx)', label: 'Every document as Word', note: 'Real Word files for the team: BRD, approach note, review sheet, test suite, engineering plan and proposal.' },
      { at: 'btn:Download All Deliverables (.ZIP)', label: 'Full bundle', note: 'Adds the prototype, SQL, JSON and the feature file.' },
      { at: 'union:btn:JSON||btn:Download BRD (.PDF)', label: 'JSON and PDF', note: 'Machine-readable and print-ready.' },
      { at: 'text:Autonomous Engineering Handoff', label: 'Hand-off', note: 'Contracts, schemas and deployment notes.' },
    ],
  },
  'eng-plan': {
    title: 'Architecture and delivery plan',
    lead: 'A written architecture for this product: where the rules are enforced, how history is kept, how data is protected. Below it come the services, the API contracts per record, events, quality targets with how each is verified, the backlog and the risks.',
    pins: [
      { at: 'up:2:text:Architecture & Delivery Plan', label: 'Plan', note: 'Written for this product, not a template.' },
      { at: 'text:Where the business rules are enforced', label: 'Rules enforced', note: 'Each rule is mapped to where it is enforced.' },
      { at: 'text:Audit and integrity', label: 'Audit and integrity', note: 'History that cannot be changed.' },
    ],
  },
  'prop-scope': {
    title: 'Part 2: scope, effort, cost, RASIC and the proposal',
    lead: 'The BU rarely approves the first draft: it trims, adds and rewords. So the proposal is built from the approved scope, not from the first BRD. Upload the BU’s final BRD and the factory matches it to the draft, or tick items in and out by hand.',
    value: 'Everything below prices exactly the scope the BU approved.',
    pins: [
      { at: 'btn:Upload final BRD', label: 'Upload the final BRD', note: 'The tool compares it to the draft and proposes what was kept, removed or added. You review every line.' },
      { at: 'union:text:43 kept||text:36 kept||text:kept', label: 'Counts', note: 'How many items are in, out and newly added.' },
      { at: 'text:The scope is not yet confirmed', label: 'Draft until confirmed', note: 'The proposal stays marked DRAFT until the BA confirms the scope.' },
      { at: 'up:2:text:Effort', label: 'Headline figures', note: 'Effort in days and person-months, duration and total.' },
      { at: 'union:btn:1. Approved scope||btn:5. Proposal / SOW', label: 'Five tabs', note: 'Scope, effort, cost and team, RASIC and the document.' },
    ],
  },
  'prop-confirmed': {
    title: 'Confirm the BU-approved scope',
    lead: 'Enter who approved the scope and when, then confirm. From that moment the effort, cost and document price exactly this scope, and the DRAFT mark disappears.',
    pins: [
      { at: 'text:Confirmed as BU-approved', label: 'Confirmed', note: 'Recorded with name and date.' },
      { at: 'ph:Approved by (name, role)', label: 'Who approved', note: 'Appears in the document.' },
    ],
  },
  'prop-effort': {
    title: 'Effort per activity, functional and technical',
    lead: 'Each activity shows functional days (workshops, configuration, acceptance) and technical days (architecture, development, interfaces, migration) and a plain statement of what the size depends on. Any figure can be changed by hand and is then marked as adjusted.',
    value: 'For an SAP project the activities are the ones a consultant expects: fit-gap workshops, configuration by process area, development by object type, interfaces, data migration, cutover and hypercare.',
    pins: [
      { at: 'text:Functional days', label: 'Functional days', note: 'Analysis, design and acceptance work.' },
      { at: 'text:Technical days', label: 'Technical days', note: 'Architecture, build, interface and migration work.' },
      { at: 'text:How estimated', label: 'How it was sized', note: 'What each activity depends on, in plain words.' },
      { at: 'text:Fit-gap workshops and solution design', label: 'SAP activities', note: 'Sized from the fit-gap rows and process areas.' },
      { at: 'text:Phase 1: Realise', label: 'SAP phases', note: 'Prepare and explore, realise, test and deploy, hypercare.' },
    ],
  },
  'prop-cost': {
    title: 'Cost and team, in your rates',
    lead: 'Set your own day rate per role. The price is exactly days times rate. The team table shows days, rate, cost and the indicative number of people per role. A package team has functional, technical, integration and data migration consultants and a platform administrator.',
    value: 'Rates shown are illustrative defaults until you replace them with your own.',
    pins: [
      { at: 'up:2:text:Rate card', label: 'Rate card', note: 'Edit any day rate. Everything recalculates.' },
      { at: 'text:Functional Consultant (per day)', label: 'SAP roles', note: 'Roles for a package implementation.' },
      { at: 'text:Indicative people', label: 'Team size', note: 'People per role over the indicative duration.' },
    ],
  },
  'prop-rasic': {
    title: 'RASIC: who is responsible, accountable, supports, is consulted and informed',
    lead: 'Every activity has one accountable party and at least one responsible party, across the client sponsor, the BU lead, the client key users, the project manager and the consultants. Key users own their data and acceptance testing.',
    pins: [
      { at: 'text:Responsible', label: 'Legend', note: 'R, A, S, C, I.' },
      { at: 'text:Client key users', label: 'Client side', note: 'The client’s own roles are on the chart too.' },
      { at: 'text:Data migration', label: 'Migration lead', note: 'A column for the data migration lead.' },
    ],
  },
  'prop-doc': {
    title: 'The proposal and statement of work',
    lead: 'The document is written from the approved scope: summary, background, objectives, approach, deliverables, assumptions, exclusions, client responsibilities, risks, acceptance criteria, governance, change control, commercial terms, effort, team, RASIC and milestones. It downloads as Word.',
    value: 'Standard terms are starting wording for your legal team to review. The numbers always come from the estimate, never from the AI.',
    pins: [
      { at: 'text:Download Word', label: 'Download as Word', note: 'A real .docx file.' },
      { at: 'text:Words derived by rules', label: 'Who wrote the words', note: 'AI or rules. The numbers never come from the AI.' },
      { at: 'btn:Copy', label: 'Copy', note: 'Copy the document as Markdown.' },
    ],
  },
  'usage': {
    title: 'Control: every AI click is counted',
    lead: 'The AI panel shows who spent what: tokens and clicks per person and per project, limits per button, a monthly budget and how many answers were reused from the cache at no cost. Over a limit the factory answers with the built-in engine instead of failing.',
    value: 'A team can use the tool daily without a surprise bill.',
    pins: [
      { at: 'up:2:text:Your tokens, last 24 hours', label: 'Your tokens', note: 'What you have used in the last 24 hours and what is left.' },
      { at: 'up:2:text:Team this month', label: 'The team\u2019s month', note: 'Clicks, tokens and cost by person and by day against the monthly budget.' },
    ],
  },
};
