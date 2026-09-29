import { UploadedMaterial } from '../types';

export const SAMPLE_DATASET_FLEET: UploadedMaterial[] = [
  {
    id: 'mat-01',
    filename: 'Q3_Fleet_Mobility_Modernization_v4_FINAL.pptx',
    fileType: 'pptx',
    sizeBytes: 4210000,
    uploadedAt: '2026-09-18 09:15',
    status: 'ready',
    tags: ['Strategy', 'Executive Deck', 'Slide 1-18'],
    contentSnippet: `Slide 4: Executive Objective: Consolidate Commercial Passenger Vehicle (PV) and Commercial Electric Vehicle (EV) fleet under single Unified Mobility Command Center.
Slide 9: Architecture observation: Currently PV fleet managers cannot see EV charging telemetry; they must log into two disparate systems. Slide 12 highlights that high-mileage EV battery degradation is causing missed deliveries.
Slide 14: Confirmed constraint: Fleet Underwriter role needs read-only audit log access. Dispatchers need real-time override permissions.
Slide 16: Voice of Customer notes indicate drivers want direct charging stall reservation integration.`
  },
  {
    id: 'mat-02',
    filename: 'Screenshot_07_EV_Battery_Telemetry_View.png',
    fileType: 'image',
    sizeBytes: 1840000,
    uploadedAt: '2026-09-18 09:16',
    status: 'ready',
    tags: ['UI Capture', 'EV Screen', 'Legacy'],
    contentSnippet: `[UI Layout Extracted from Screenshot_07.png]:
Header: "Commercial Fleet - Unit #4092 (Tesla Semi / ProMaster EV)"
Visible Widgets:
- State of Charge (SoC): 68% gauge
- Battery Cell Degradation Index: 92.4%
- Fleet Division: "Commercial EV Logistics"
- Action Buttons: "Dispatch Remote Diagnostic", "Schedule Preventive Battery Service", "Reassign Delivery Route"
- Warning Banner: "Thermal throttle warning triggered during fast DC charging at Depot 3"`
  },
  {
    id: 'mat-03',
    filename: 'Screenshot_11_PV_Customer_Profile.png',
    fileType: 'image',
    sizeBytes: 1520000,
    uploadedAt: '2026-09-18 09:17',
    status: 'ready',
    tags: ['UI Capture', 'PV Screen', 'Account Profile'],
    contentSnippet: `[UI Layout Extracted from Screenshot_11.png]:
Screen: Customer Fleet 360 View (PV Division)
Fields Shown:
- Client Enterprise Name: "Metro Express Cargo LLC"
- Primary Contract: 36-month lease / 250 vehicles
- Total Fleet Size: 180 PV / 70 EV
- Missing Widget: Product manager note written in red ink on screenshot: "Where is the Voice of Customer / Driver NPS score? It was promised in sprint 3!"
- Permission badge: "Operator: PV Specialist (Restricted from EV Battery Diagnostics)"`
  },
  {
    id: 'mat-04',
    filename: 'Meeting_Audio_Transcript_Operations_Sync.txt',
    fileType: 'audio',
    sizeBytes: 890000,
    uploadedAt: '2026-09-18 09:20',
    status: 'ready',
    tags: ['Voice Transcript', 'Product & Ops'],
    contentSnippet: `[Voice Recording Audio Transcript - Transcribed 09:18]:
Sarah (Product Lead): "Right now, operations tells us a single fleet manager manages both PV vans and EV trucks for mid-market clients, but our legacy system forces them to have two separate usernames."
Dave (VP Fleet): "That's crazy. One login should let them toggle between PV and EV views, or see a combined fleet summary."
Priya (Engineering): "We have an API conflict though. The PV telematics system updates every 15 minutes via REST batch, while the EV battery service pushes real-time WebSocket telemetry. If we unify the dashboard, what's the refresh cadence?"
Sarah: "Let's assume near real-time for EV alerts and 5-minute polling for general PV location until we get the new IoT gateway."
Dave: "Also, what about regulatory compliance? We need a mandatory pre-trip battery thermal sign-off rule for all commercial EVs over 10,000 lbs."`
  },
  {
    id: 'mat-05',
    filename: 'Slack_Dump_Unresolved_Business_Rules.txt',
    fileType: 'text',
    sizeBytes: 14500,
    uploadedAt: '2026-09-18 09:22',
    status: 'ready',
    tags: ['Notes', 'Slack Thread'],
    contentSnippet: `Slack Thread #fleet-modernization:
@marcus: "Are we charging penalty fees for EV vehicles returned under 20% battery state-of-charge?"
@elena: "Operations VP says YES: $45 fee. Finance policy memo from last month says NO: complimentary depot recharge is included in the premium tier."
@marcus: "That's a direct conflict. We need business clarification before locking in billing business rules."
@sarah: "Also missing: We don't have the SLA timing for roadside battery replacement response in rural zones."`
  },
  {
    id: 'mat-06',
    filename: 'Fleet_Telemetry_Entity_Dictionary.xlsx',
    fileType: 'excel',
    sizeBytes: 245000,
    uploadedAt: '2026-09-18 09:24',
    status: 'ready',
    tags: ['Data Dictionary', 'Entities', 'Excel'],
    contentSnippet: `Excel Sheet 1: Entities
1. Vehicle (VIN, Make, Model, PropulsionType [PV|EV], DepotID, Odometer, Status)
2. BatteryTelemetry (VehicleID, Timestamp, SoC_Percent, CellTemp_Celsius, HealthScore, CycleCount)
3. FleetAccount (AccountID, CompanyName, Tier, AssignedFleetManager, ActiveContractID)
4. TelematicsEvent (EventID, VehicleID, Severity, EventType, Latitude, Longitude, AcknowledgedBy)
5. DriverProfile (DriverID, LicenseNumber, SafetyScore, CertifiedEVOperator)`
  }
];
