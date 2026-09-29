import { 
  BusinessUnderstanding, 
  ProductDefinition, 
  EngineeringPackage, 
  ChangeImpactAnalysis 
} from '../types';

export const INITIAL_BUSINESS_UNDERSTANDING: BusinessUnderstanding = {
  overallSummary: "Modernization mandate to unify commercial passenger vehicles (PV) and commercial electric vehicles (EV) under a single command center for Commercial Fleet & Logistics Division, eliminating dual credentials, reconciling telemetry streaming rates, and monitoring EV battery cell degradation in real-time.",
  extractedAt: new Date().toISOString(),
  businessObjective: {
    id: "bo-1",
    title: "Unified Fleet Mobility & Telemetry Command Platform",
    description: "Consolidate Commercial Passenger Vehicles (PV) and Commercial Electric Vehicles (EV) into a singular operational console to eliminate duplicate logins, track high-mileage battery degradation in real-time, and provide unified client 360 accounting.",
    status: "CONFIRMED",
    evidenceReferences: ["Q3_Fleet_Mobility_Modernization_v4_FINAL.pptx Slide 4", "Meeting_Audio_Transcript_Operations_Sync.txt"],
    supportingDetail: "Explicitly stated in executive deck Slide 4 and confirmed during operations sync."
  },
  personas: [
    {
      id: "per-1",
      title: "Fleet Operations Specialist",
      description: "Frontline operational actor who monitors vehicle health, dispatches routes, and coordinates preventive depot maintenance.",
      status: "CONFIRMED",
      evidenceReferences: ["Q3_Fleet_Mobility_Modernization_v4_FINAL.pptx Slide 14", "Screenshot_07_EV_Battery_Telemetry_View.png"],
      supportingDetail: "Needs active dispatch and override capabilities."
    },
    {
      id: "per-2",
      title: "Commercial Fleet Underwriter / Risk Officer",
      description: "Conducts audit reviews on battery warranty terms, insurance compliance, and lease degradation metrics.",
      status: "CONFIRMED",
      evidenceReferences: ["Q3_Fleet_Mobility_Modernization_v4_FINAL.pptx Slide 14"],
      supportingDetail: "Confirmed constraint: Requires read-only audit log access."
    },
    {
      id: "per-3",
      title: "Enterprise Fleet Account Manager",
      description: "Manages mid-market and enterprise customer contracts spanning mixed PV and EV fleets.",
      status: "INFERRED",
      evidenceReferences: ["Meeting_Audio_Transcript_Operations_Sync.txt", "Screenshot_11_PV_Customer_Profile.png"],
      supportingDetail: "Derived by AI: Currently forced to use dual credentials to view customer accounts."
    }
  ],
  modules: [
    {
      id: "mod-1",
      title: "Unified Mobility Command Dashboard",
      description: "Real-time overview of fleet allocation, operational uptime, battery health thresholds, and active route alerts.",
      status: "CONFIRMED",
      evidenceReferences: ["Q3_Fleet_Mobility_Modernization_v4_FINAL.pptx Slide 4", "Screenshot_07_EV_Battery_Telemetry_View.png"]
    },
    {
      id: "mod-2",
      title: "EV Telematics & Battery Health Center",
      description: "Deep diagnostic subsystem tracking cell temperature, State of Charge (SoC), and thermal degradation.",
      status: "CONFIRMED",
      evidenceReferences: ["Screenshot_07_EV_Battery_Telemetry_View.png", "Fleet_Telemetry_Entity_Dictionary.xlsx"]
    },
    {
      id: "mod-3",
      title: "Customer Fleet 360 & Account Profiler",
      description: "Aggregates commercial enterprise leases, vehicle allocations (PV/EV split), and driver customer feedback.",
      status: "CONFIRMED",
      evidenceReferences: ["Screenshot_11_PV_Customer_Profile.png"]
    },
    {
      id: "mod-4",
      title: "Operations Dispatch & Override Console",
      description: "Enables operators to reassign routes, schedule mobile maintenance, and acknowledge critical vehicle warnings.",
      status: "INFERRED",
      evidenceReferences: ["Screenshot_07_EV_Battery_Telemetry_View.png", "Q3_Fleet_Mobility_Modernization_v4_FINAL.pptx Slide 14"]
    }
  ],
  screens: [
    {
      id: "scr-1",
      title: "Command Center Executive Overview",
      description: "Top-level KPI widgets, active vehicle map summary, fleet split (PV vs EV), and priority alert feed.",
      status: "CONFIRMED",
      evidenceReferences: ["Q3_Fleet_Mobility_Modernization_v4_FINAL.pptx Slide 4"]
    },
    {
      id: "scr-2",
      title: "Vehicle Telematics & Battery Diagnostic Detail",
      description: "Unit-level diagnostic screen with SoC gauges, thermal status warnings, and remote diagnostic dispatch buttons.",
      status: "CONFIRMED",
      evidenceReferences: ["Screenshot_07_EV_Battery_Telemetry_View.png"]
    },
    {
      id: "scr-3",
      title: "Customer Fleet 360 Profile",
      description: "Account summary screen displaying contract duration, vehicle allocation (PV/EV split), and operator restrictions.",
      status: "CONFIRMED",
      evidenceReferences: ["Screenshot_11_PV_Customer_Profile.png"]
    },
    {
      id: "scr-4",
      title: "Compliance & Pre-Trip Thermal Sign-Off Form",
      description: "Wizard-style regulatory inspection form for commercial EV operators over 10,000 lbs.",
      status: "INFERRED",
      evidenceReferences: ["Meeting_Audio_Transcript_Operations_Sync.txt"]
    }
  ],
  userJourneys: [
    {
      id: "uj-1",
      title: "Real-Time Thermal Alert Triage & Reroute",
      description: "Operator receives high temperature battery warning -> inspects cell degradation -> triggers remote diagnostic -> dispatches vehicle to Depot 3 fast-charger.",
      status: "CONFIRMED",
      evidenceReferences: ["Screenshot_07_EV_Battery_Telemetry_View.png", "Meeting_Audio_Transcript_Operations_Sync.txt"]
    },
    {
      id: "uj-2",
      title: "Unified PV & EV Customer Review",
      description: "Account manager views Enterprise Client profile -> toggles between combustion and electric fleet metrics without re-authenticating.",
      status: "INFERRED",
      evidenceReferences: ["Meeting_Audio_Transcript_Operations_Sync.txt", "Screenshot_11_PV_Customer_Profile.png"]
    }
  ],
  businessRules: [
    {
      id: "br-1",
      title: "BR-EV-101: Mandatory Pre-Trip Thermal Sign-Off",
      description: "All commercial electric vehicles exceeding 10,000 lbs gross weight must complete a digital battery thermal check prior to dispatch.",
      status: "CONFIRMED",
      evidenceReferences: ["Meeting_Audio_Transcript_Operations_Sync.txt"]
    },
    {
      id: "br-2",
      title: "BR-AUTH-204: Segregated Fleet Underwriter Role",
      description: "Underwriters and external risk auditors possess strict read-only permissions across telemetry and financial logs.",
      status: "CONFIRMED",
      evidenceReferences: ["Q3_Fleet_Mobility_Modernization_v4_FINAL.pptx Slide 14"]
    },
    {
      id: "br-3",
      title: "BR-TELE-305: Asynchronous Ingestion Cadence",
      description: "EV battery telemetry stream operates in near real-time (WebSocket), whereas PV GPS updates are processed on a 5-minute batch polling cycle.",
      status: "INFERRED",
      evidenceReferences: ["Meeting_Audio_Transcript_Operations_Sync.txt"]
    }
  ],
  dataEntities: [
    {
      id: "de-1",
      title: "Vehicle (Core Asset Entity)",
      description: "Attributes: VIN, Make, Model, PropulsionType (PV | EV), DepotID, OdometerMiles, OperationalStatus.",
      status: "CONFIRMED",
      evidenceReferences: ["Fleet_Telemetry_Entity_Dictionary.xlsx"]
    },
    {
      id: "de-2",
      title: "BatteryTelemetry (EV Health Stream)",
      description: "Attributes: VehicleID, Timestamp, SoC_Percent, CellTemp_Celsius, HealthDegradationIndex, ThermalWarningFlag.",
      status: "CONFIRMED",
      evidenceReferences: ["Fleet_Telemetry_Entity_Dictionary.xlsx", "Screenshot_07_EV_Battery_Telemetry_View.png"]
    },
    {
      id: "de-3",
      title: "FleetAccount (Commercial Client)",
      description: "Attributes: AccountID, CompanyName, Tier, AssignedFleetManager, ActiveContractID, VoiceOfCustomerScore.",
      status: "CONFIRMED",
      evidenceReferences: ["Fleet_Telemetry_Entity_Dictionary.xlsx", "Screenshot_11_PV_Customer_Profile.png"]
    }
  ],
  integrations: [
    {
      id: "int-1",
      title: "Enterprise IoT Telematics Gateway",
      description: "Streaming telemetry for EV battery temperatures, SoC, and critical diagnostic fault codes via WebSocket / MQTT.",
      status: "CONFIRMED",
      evidenceReferences: ["Screenshot_07_EV_Battery_Telemetry_View.png"]
    },
    {
      id: "int-2",
      title: "Depot Fast-Charging Network",
      description: "Automated booking and reservation of high-output DC charging bays across regional depots.",
      status: "INFERRED",
      evidenceReferences: ["Q3_Fleet_Mobility_Modernization_v4_FINAL.pptx Slide 16"]
    }
  ],
  uiObservations: [
    {
      id: "ui-1",
      title: "Missing Voice of Customer Widget in Account View",
      description: "Annotations on Screenshot 11 identify that driver satisfaction and NPS scores were missing from the legacy profile.",
      status: "INFERRED",
      evidenceReferences: ["Screenshot_11_PV_Customer_Profile.png"]
    },
    {
      id: "ui-2",
      title: "Dual Authenticated Operational Views",
      description: "Screens reveal separate permissions badges preventing PV operators from inspecting battery cell degradation.",
      status: "CONFIRMED",
      evidenceReferences: ["Screenshot_07_EV_Battery_Telemetry_View.png", "Screenshot_11_PV_Customer_Profile.png"]
    }
  ],
  conflicts: [
    {
      id: "conf-1",
      title: "EV Low-Battery Return Penalty Policy Dispute",
      description: "Operations VP notes demand a $45 penalty fee for vehicles returned under 20% SoC, but Finance guidelines specify complimentary charging in Enterprise contracts.",
      status: "AMBIGUOUS",
      evidenceReferences: ["Slack_Dump_Unresolved_Business_Rules.txt", "Q3_Fleet_Mobility_Modernization_v4_FINAL.pptx"],
      contradictions: "Operations ($45 surcharge) vs Finance Policy (no fee on premium lease tier)."
    }
  ],
  missingInformation: [
    {
      id: "mi-1",
      title: "Emergency Roadside Battery Replacement SLA",
      description: "No source defines guaranteed emergency roadside turnaround times for stalled EVs outside depot corridors.",
      status: "MISSING",
      evidenceReferences: ["Slack_Dump_Unresolved_Business_Rules.txt"]
    },
    {
      id: "mi-2",
      title: "Driver EV High-Voltage Endorsement Workflow",
      description: "Notes specify commercial drivers must be 'Certified EV Operators' but provide no credential authentication spec.",
      status: "MISSING",
      evidenceReferences: ["Fleet_Telemetry_Entity_Dictionary.xlsx"]
    }
  ]
};

export const INITIAL_PRODUCT_DEFINITION: ProductDefinition = {
  id: "prod-def-initial",
  version: "v1.0",
  productName: "Unified Fleet Mobility Command Center",
  businessUnit: "Commercial Fleet & Logistics Division",
  objective: "Consolidate Commercial Passenger Vehicles (PV) and Commercial Electric Vehicles (EV) into a singular operational console to eliminate duplicate logins, track high-mileage battery degradation in real-time, and provide unified client 360 accounting.",
  personas: [
    {
      id: "per-1",
      name: "Fleet Operations Specialist",
      role: "Fleet Operations Specialist",
      keyGoals: [
        "Monitor fleet uptime across PV and EV units",
        "Triage thermal alerts before cell degradation",
        "Dispatch routes and schedule mobile servicing"
      ],
      permissions: ["Full Dispatch", "Diagnostic Trigger", "Route Override"],
      confidence: "CONFIRMED",
      evidence: ["Q3_Fleet_Mobility_Modernization_v4_FINAL.pptx Slide 14", "Screenshot_07_EV_Battery_Telemetry_View.png"]
    },
    {
      id: "per-2",
      name: "Commercial Fleet Underwriter / Risk Officer",
      role: "Commercial Fleet Underwriter",
      keyGoals: [
        "Audit battery warranty terms and wear",
        "Inspect compliance attestations",
        "Review insurance loss histories"
      ],
      permissions: ["Read Only Audit Logs", "Telemetry Inspector"],
      confidence: "CONFIRMED",
      evidence: ["Q3_Fleet_Mobility_Modernization_v4_FINAL.pptx Slide 14"]
    },
    {
      id: "per-3",
      name: "Enterprise Fleet Account Manager",
      role: "Enterprise Fleet Account Manager",
      keyGoals: [
        "Manage mixed PV and EV commercial leases",
        "Review driver satisfaction and contract renewals",
        "Access client telemetry without dual logins"
      ],
      permissions: ["Client Account Manager", "Contract Billing View"],
      confidence: "INFERRED",
      evidence: ["Meeting_Audio_Transcript_Operations_Sync.txt", "Screenshot_11_PV_Customer_Profile.png"]
    }
  ],
  modules: [
    {
      id: "mod-1",
      name: "Unified Mobility Command Dashboard",
      description: "Real-time overview of fleet allocation, operational uptime, battery health thresholds, and active route alerts.",
      screens: ["scr-dashboard"],
      confidence: "CONFIRMED",
      evidence: ["Q3_Fleet_Mobility_Modernization_v4_FINAL.pptx Slide 4", "Screenshot_07_EV_Battery_Telemetry_View.png"]
    },
    {
      id: "mod-2",
      name: "EV Telematics & Battery Health Center",
      description: "Deep diagnostic subsystem tracking cell temperature, State of Charge (SoC), and thermal degradation.",
      screens: ["scr-telematics"],
      confidence: "CONFIRMED",
      evidence: ["Screenshot_07_EV_Battery_Telemetry_View.png", "Fleet_Telemetry_Entity_Dictionary.xlsx"]
    },
    {
      id: "mod-3",
      name: "Customer Fleet 360 & Account Profiler",
      description: "Aggregates commercial enterprise leases, vehicle allocations (PV/EV split), and driver customer feedback.",
      screens: ["scr-customer360"],
      confidence: "CONFIRMED",
      evidence: ["Screenshot_11_PV_Customer_Profile.png"]
    },
    {
      id: "mod-4",
      name: "Operations Dispatch & Override Console",
      description: "Enables operators to reassign routes, schedule mobile maintenance, and acknowledge critical vehicle warnings.",
      screens: ["scr-compliance"],
      confidence: "INFERRED",
      evidence: ["Meeting_Audio_Transcript_Operations_Sync.txt"]
    }
  ],
  screens: [
    {
      id: "scr-dashboard",
      name: "Fleet Command Center",
      module: "Unified Mobility Command Dashboard",
      layoutType: "dashboard",
      components: [
        "Enterprise Fleet Metrics Bar",
        "Vehicle Propulsion Split Gauge (PV vs EV)",
        "Active Thermal Warnings Live Ticker",
        "Interactive Fleet Map & Telemetry Status Grid"
      ],
      purpose: "Single-pane-of-glass executive and operational overview",
      confidence: "CONFIRMED",
      evidence: ["Q3_Fleet_Mobility_Modernization_v4_FINAL.pptx Slide 4"]
    },
    {
      id: "scr-telematics",
      name: "EV Battery & Telemetry Diagnostic Console",
      module: "EV Telematics & Battery Health Center",
      layoutType: "table-detail",
      components: [
        "State of Charge (SoC) Multi-Vehicle Matrix",
        "Thermal Degradation Index Gauges",
        "Remote Diagnostic Action Toolbar",
        "Depot Fast-Charge Reservation Drawer"
      ],
      purpose: "Deep diagnostic workbench for EV battery triage and preventive dispatch",
      confidence: "CONFIRMED",
      evidence: ["Screenshot_07_EV_Battery_Telemetry_View.png"]
    },
    {
      id: "scr-customer360",
      name: "Customer Fleet 360 Profile",
      module: "Customer Fleet 360 & Account Profiler",
      layoutType: "profile-360",
      components: [
        "Enterprise Account Header & Contract Tier",
        "Vehicle Allocation Breakdown (180 PV / 70 EV)",
        "Voice of Customer & NPS Feedback Stream",
        "Assigned Account Manager & Driver Registry"
      ],
      purpose: "Comprehensive multi-vehicle account view with Voice of Customer",
      confidence: "CONFIRMED",
      evidence: ["Screenshot_11_PV_Customer_Profile.png"]
    },
    {
      id: "scr-compliance",
      name: "Pre-Trip Thermal Safety & Regulatory Sign-Off",
      module: "Operations Dispatch & Override Console",
      layoutType: "form-wizard",
      components: [
        "Vehicle Weight & VIN Lookup",
        "Battery Temperature Sensor Verification Checklist",
        "Operator Digital Attestation Signature",
        "Regulatory PDF Export & Audit Trail"
      ],
      purpose: "Enforces mandatory pre-trip checks for commercial vehicles over 10,000 lbs",
      confidence: "INFERRED",
      evidence: ["Meeting_Audio_Transcript_Operations_Sync.txt"]
    }
  ],
  navigation: [
    {
      id: "nav-dash",
      label: "Command Center",
      screenId: "scr-dashboard",
      icon: "LayoutDashboard",
      allowedRoles: ["All"]
    },
    {
      id: "nav-telemetry",
      label: "Battery Diagnostics",
      screenId: "scr-telematics",
      icon: "BatteryCharging",
      badge: "3 Alerts",
      allowedRoles: ["Fleet Operations Specialist", "Fleet Lead"]
    },
    {
      id: "nav-cust",
      label: "Customer 360",
      screenId: "scr-customer360",
      icon: "Users",
      allowedRoles: ["Account Manager", "Fleet Lead", "Operations"]
    },
    {
      id: "nav-comp",
      label: "Safety & Compliance",
      screenId: "scr-compliance",
      icon: "ShieldAlert",
      allowedRoles: ["Safety Officer", "Operator"]
    }
  ],
  userJourneys: [
    {
      id: "uj-1",
      name: "Battery Thermal Alert Triage & Preventive Depot Reroute",
      persona: "Fleet Operations Specialist",
      steps: [
        "Operator receives critical thermal warning banner in Command Center",
        "Drills down to EV Battery Diagnostics screen for Vehicle Unit #4092",
        "Inspects cell temperature (48°C) and SoC (68%)",
        "Executes 'Dispatch Remote Diagnostic' and reserves Depot 3 cooling stall",
        "System updates vehicle route status to 'Preventive Service En Route'"
      ],
      outcome: "Prevented thermal battery runaway and avoided unscheduled roadside tow",
      confidence: "CONFIRMED",
      evidence: ["Screenshot_07_EV_Battery_Telemetry_View.png", "Q3_Fleet_Mobility_Modernization_v4_FINAL.pptx"]
    },
    {
      id: "uj-2",
      name: "Unified PV and EV Client Fleet Review",
      persona: "Enterprise Fleet Account Manager",
      steps: [
        "Account manager opens Customer 360 profile for Metro Express Cargo LLC",
        "Reviews unified 250-vehicle allocation across combustion and electric models",
        "Checks Voice of Customer driver satisfaction and pending lease renewal",
        "Generates combined quarterly telematics and emission savings statement"
      ],
      outcome: "Eliminated need for dual application logins and halved account review time",
      confidence: "INFERRED",
      evidence: ["Meeting_Audio_Transcript_Operations_Sync.txt", "Screenshot_11_PV_Customer_Profile.png"]
    }
  ],
  businessRules: [
    {
      id: "br-1",
      code: "RULE-TH-01",
      rule: "A thermal throttle alert is automatically flagged when cell temperature exceeds 45°C during rapid charging or high-gradient transit.",
      context: "EV Battery Telematics Subsystem",
      confidence: "CONFIRMED",
      evidence: ["Screenshot_07_EV_Battery_Telemetry_View.png"]
    },
    {
      id: "br-2",
      code: "RULE-COMP-02",
      rule: "Commercial EV units over 10,000 lbs must complete digital pre-trip thermal verification before route authorization.",
      context: "Regulatory Safety Compliance",
      confidence: "CONFIRMED",
      evidence: ["Meeting_Audio_Transcript_Operations_Sync.txt"]
    },
    {
      id: "br-3",
      code: "RULE-AUDIT-03",
      rule: "Underwriters and external auditors are restricted to read-only views with immutable cryptographic audit log logging.",
      context: "Identity & Access Control",
      confidence: "CONFIRMED",
      evidence: ["Q3_Fleet_Mobility_Modernization_v4_FINAL.pptx Slide 14"]
    },
    {
      id: "br-4",
      code: "RULE-SOC-04",
      rule: "Temporary status: Waiver applies for <20% SoC returns pending executive dispute resolution between Operations ($45 fee) and Finance (Complimentary).",
      context: "Billing & Depot Operations",
      confidence: "AMBIGUOUS",
      evidence: ["Slack_Dump_Unresolved_Business_Rules.txt"]
    }
  ],
  dataEntities: [
    {
      id: "de-vehicle",
      name: "Vehicle",
      description: "Primary asset record representing PV or EV commercial units",
      fields: [
        { name: "vin", type: "string(17)", required: true, notes: "Unique Vehicle Identification Number" },
        { name: "propulsionType", type: "enum(PV, EV, HYBRID)", required: true },
        { name: "makeModel", type: "string", required: true },
        { name: "depotId", type: "string", required: true },
        { name: "odometerMiles", type: "number", required: true },
        { name: "status", type: "enum(ACTIVE, MAINTENANCE, REROUTED, INACTIVE)", required: true }
      ],
      relationships: ["BatteryTelemetry (1:N)", "CustomerFleetAccount (N:1)"],
      confidence: "CONFIRMED",
      evidence: ["Fleet_Telemetry_Entity_Dictionary.xlsx"]
    },
    {
      id: "de-battery",
      name: "BatteryTelemetry",
      description: "High-frequency streaming telemetry record for electric vehicles",
      fields: [
        { name: "telemetryId", type: "uuid", required: true },
        { name: "vin", type: "string(17)", required: true },
        { name: "socPercent", type: "number", required: true, notes: "0.0 - 100.0%" },
        { name: "cellTemperatureCelsius", type: "number", required: true },
        { name: "degradationHealthScore", type: "number", required: true },
        { name: "isThermalWarningActive", type: "boolean", required: true }
      ],
      relationships: ["Vehicle (N:1)"],
      confidence: "CONFIRMED",
      evidence: ["Fleet_Telemetry_Entity_Dictionary.xlsx", "Screenshot_07_EV_Battery_Telemetry_View.png"]
    },
    {
      id: "de-account",
      name: "CustomerFleetAccount",
      description: "Commercial enterprise client leasing or managing fleet vehicles",
      fields: [
        { name: "accountId", type: "string", required: true },
        { name: "companyName", type: "string", required: true },
        { name: "contractLeaseMonths", type: "number", required: true },
        { name: "totalVehicleCount", type: "number", required: true },
        { name: "voiceOfCustomerScore", type: "number", required: false, notes: "Driver satisfaction index" }
      ],
      relationships: ["Vehicle (1:N)"],
      confidence: "CONFIRMED",
      evidence: ["Screenshot_11_PV_Customer_Profile.png"]
    }
  ],
  integrations: [
    {
      id: "int-1",
      system: "Enterprise IoT Telematics Gateway",
      protocol: "MQTT / WebSocket over TLS",
      purpose: "Streaming telemetry for EV battery temperatures, SoC, and critical diagnostic fault codes",
      confidence: "CONFIRMED",
      evidence: ["Screenshot_07_EV_Battery_Telemetry_View.png"]
    },
    {
      id: "int-2",
      system: "Legacy PV Fleet Telematics Provider",
      protocol: "REST API (5-minute batch polling)",
      purpose: "Ingests location, odometer, and trip logs for traditional combustion vehicles",
      confidence: "INFERRED",
      evidence: ["Meeting_Audio_Transcript_Operations_Sync.txt"]
    }
  ],
  permissions: [
    {
      role: "Fleet Operations Specialist",
      accessLevel: "Read/Write",
      constraints: "Can trigger remote diagnostics and dispatch route changes; cannot alter leasing terms."
    },
    {
      role: "Fleet Underwriter & Auditor",
      accessLevel: "Read Only",
      constraints: "Strict read-only access to vehicle telemetry, compliance attestations, and audit trails."
    },
    {
      role: "Enterprise Account Manager",
      accessLevel: "Read/Write",
      constraints: "Can update customer profile, contract metadata, and driver allocations across PV/EV."
    }
  ],
  notifications: [
    {
      event: "Thermal Throttle Warning Triggered",
      channel: "In-App Push & WebSocket Alert",
      recipient: "Assigned Fleet Operations Specialist"
    },
    {
      event: "State of Charge Drops Below 20%",
      channel: "Dashboard Warning Banner",
      recipient: "Fleet Dispatcher & Active Driver"
    }
  ],
  validations: [
    {
      field: "vin",
      validationRule: "^[A-HJ-NPR-Z0-9]{17}$",
      errorMessage: "VIN must be a valid 17-character alphanumeric string without letters I, O, or Q."
    },
    {
      field: "socPercent",
      validationRule: "value >= 0 && value <= 100",
      errorMessage: "State of Charge percentage must be between 0% and 100%."
    }
  ],
  assumptions: [
    {
      id: "asm-1",
      statement: "Near real-time 1Hz WebSocket streaming is available for all Tier-1 commercial electric vehicles.",
      riskLevel: "medium",
      status: "accepted"
    }
  ],
  openQuestions: [
    {
      id: "oq-1",
      question: "Executive resolution needed: Does the $45 penalty fee apply to vehicles returned under 20% SoC, or is it covered by the Enterprise Lease tier?",
      urgency: "blocking",
      status: "open"
    }
  ],
  evidenceMapping: {
    "Command Center Executive Objective": ["Q3_Fleet_Mobility_Modernization_v4_FINAL.pptx Slide 4"],
    "EV Battery Telemetry Gauges": ["Screenshot_07_EV_Battery_Telemetry_View.png"],
    "Customer 360 PV/EV Split": ["Screenshot_11_PV_Customer_Profile.png"]
  },
  changeHistory: [],
  isApproved: false,
  lastUpdated: new Date().toISOString()
};

export const INITIAL_ENGINEERING_PACKAGE: EngineeringPackage = {
  generatedAt: new Date().toISOString(),
  version: "v1.0",
  productName: "Unified Fleet Mobility Command Center",
  businessUnit: "Commercial Fleet & Logistics Division",
  executiveSummary: "Production-ready engineering blueprint synthesized from multi-format business materials with end-to-end evidence traceability.",
  functionalRequirementsMarkdown: "# Unified Fleet Mobility Command Center FRS\n\n## 1. System Overview\nConsolidation of commercial Passenger Vehicle and Electric Vehicle fleets.\n\n## 2. Telemetry Ingestion\nDual-mode ingestion supporting real-time WebSocket streams for EV battery diagnostics and 5-minute polling for PV location.",
  screenInventory: [
    {
      screenId: "scr-dashboard",
      name: "Fleet Command Center",
      route: "/dashboard",
      components: ["FleetMetricsBar", "PropulsionGauge", "AlertTicker", "FleetMapGrid"],
      stateManagement: "Zustand FleetStore + WebSocket Stream"
    },
    {
      screenId: "scr-telematics",
      name: "EV Battery Diagnostics Console",
      route: "/telematics",
      components: ["SoCMatrix", "ThermalDegradationGauge", "DiagnosticToolbar"],
      stateManagement: "WebSocket Telemetry Subscription"
    },
    {
      screenId: "scr-customer360",
      name: "Customer Fleet 360",
      route: "/customers/:id",
      components: ["AccountHeader", "VehicleAllocation", "VoiceOfCustomerStream"],
      stateManagement: "React Query Cache"
    }
  ],
  componentInventory: [
    {
      name: "BatteryDegradationGauge",
      type: "Data Visualization",
      description: "Radial dial rendering cell temperature and state of charge with threshold alarms",
      props: ["temperatureCelsius: number", "socPercent: number", "isWarning: boolean"]
    },
    {
      name: "FleetPropulsionSplit",
      type: "Analytics Widget",
      description: "Visual breakdown showing PV combustion vs EV electric distribution",
      props: ["pvCount: number", "evCount: number"]
    }
  ],
  apiRequirements: [
    {
      endpoint: "/api/v1/telemetry/stream",
      method: "GET",
      description: "Real-time SSE / WebSocket connection for EV cell diagnostics",
      requestBodySample: "{}",
      responseBodySample: "{\n  \"vin\": \"1FTFW1ED4NFA99021\",\n  \"cellTempCelsius\": 48.2,\n  \"socPercent\": 68.0,\n  \"thermalWarning\": true\n}"
    },
    {
      endpoint: "/api/v1/dispatch/override",
      method: "POST",
      description: "Dispatches route alteration or depot cooling stall reservation",
      requestBodySample: "{\n  \"vin\": \"1FTFW1ED4NFA99021\",\n  \"action\": \"REROUTE_DEPOT_3\"\n}",
      responseBodySample: "{\n  \"status\": \"SUCCESS\",\n  \"assignedDepot\": \"Depot 3 Stall B\"\n}"
    }
  ],
  dataModelSQL: `CREATE TABLE vehicles (
  vin VARCHAR(17) PRIMARY KEY,
  propulsion_type VARCHAR(16) NOT NULL,
  make_model VARCHAR(128) NOT NULL,
  depot_id VARCHAR(32) NOT NULL,
  odometer_miles NUMERIC(10, 2) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE battery_telemetry (
  telemetry_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vin VARCHAR(17) REFERENCES vehicles(vin) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  soc_percent NUMERIC(5, 2) NOT NULL,
  cell_temperature_celsius NUMERIC(5, 2) NOT NULL,
  degradation_health_score NUMERIC(5, 2) NOT NULL,
  is_thermal_warning_active BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_telemetry_vin_time ON battery_telemetry(vin, timestamp DESC);`,
  permissionsMatrix: [
    {
      role: "Fleet Operations Specialist",
      entities: {
        "vehicle": "Read/Write",
        "battery_telemetry": "Read/Write",
        "customer_account": "Read Only"
      }
    },
    {
      role: "Fleet Underwriter & Auditor",
      entities: {
        "vehicle": "Read Only",
        "battery_telemetry": "Read Only",
        "customer_account": "Read Only"
      }
    }
  ],
  changeHistory: [],
  antigravityManifest: {
    schemaVersion: "antigravity.blueprint.v1",
    targetPlatform: "cloud-run-microservices",
    projectConfig: {
      name: "Unified Fleet Mobility Command Center",
      businessUnit: "Commercial Fleet & Logistics Division",
      runtime: "node-22-express-react",
      database: "postgresql-16"
    },
    modules: [
      "Unified Mobility Command Dashboard",
      "EV Telematics & Battery Health Center",
      "Customer Fleet 360 & Account Profiler",
      "Operations Dispatch & Override Console"
    ],
    architecturalDirectives: [
      "Enforce role-based access control with dual-mode PV/EV context switching",
      "Implement WebSocket ingestion for EV battery thermal alerts",
      "Preserve evidence traceability headers in API responses",
      "Expose Voice of Customer telemetry on Customer 360 profile"
    ]
  }
};
