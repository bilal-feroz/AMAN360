import { z } from "zod";
import type { LineString, MultiLineString, Point, Polygon, MultiPolygon } from "geojson";

export type Lang = "en" | "ar";
export const LangSchema = z.enum(["en", "ar"]);

export type Bilingual = { en: string; ar: string };

// ---------------------------------------------------------------------------------------------
// Hazard source feed (simulated government feed contract)
// ---------------------------------------------------------------------------------------------

export const VerificationSchema = z.object({
  status: z.enum(["verified", "unverified", "conflicting", "revoked"]),
  method: z.string(),
  checkedAt: z.string(),
  signatureValid: z.boolean(),
  notes: z.array(z.string()).default([]),
});
export type Verification = z.infer<typeof VerificationSchema>;

export const SeveritySchema = z.enum(["advisory", "watch", "warning", "emergency"]);
export type Severity = z.infer<typeof SeveritySchema>;

export const IncidentStateSchema = z.enum([
  "draft",
  "verified",
  "assessed",
  "approved",
  "active",
  "resolved",
  "blocked",
]);
export type IncidentState = z.infer<typeof IncidentStateSchema>;

export interface RoadClosure {
  id: string;
  incidentId: string;
  name: Bilingual;
  direction: Bilingual;
  sourceAgency: string;
  confirmed: boolean;
  geometry: LineString;
  /** Approved diversions only. Empty = the system must not suggest any alternative route. */
  approvedDiversions: { id: string; text: Bilingual; approvedBy: string }[];
}

export interface HazardGeometry {
  id: string;
  incidentId: string;
  kind: "affected_zone";
  name: Bilingual;
  geometry: Polygon | MultiPolygon;
  sourceAgency: string;
}

export interface Incident {
  id: string;
  scenarioId: string;
  title: Bilingual;
  summary: Bilingual;
  hazardCategory: "flood_risk_heavy_rain";
  sourceAgency: { id: string; name: Bilingual; simulated: true };
  sourceRef: string;
  verification: Verification;
  severity: Severity;
  issuedAt: string;
  validFrom: string;
  validUntil: string;
  policyVersion: string;
  approvedActionIds: string[];
  state: IncidentState;
  areaName: Bilingual;
  /** Incoming facts that conflict with each other (e.g. two severities) block publication. */
  conflicts: string[];
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------------------------
// Policy & approved actions
// ---------------------------------------------------------------------------------------------

export type ActionVariant = "standard" | "plain" | "audio";

export interface ActionTemplate {
  headline: string;
  body: string;
  steps: { id: string; text: string }[];
}

export interface ApprovedAction {
  id: string; // e.g. ACT-INDOOR-01
  policyVersion: string;
  title: Bilingual;
  /** Facts that must appear verbatim (after placeholder substitution) in any localized output. */
  lockedFacts: string[];
  templates: Record<Lang, Record<ActionVariant, ActionTemplate>>;
  /** What the communication layer may do with this action. */
  allowedOperations: ("select_template" | "simplify" | "translate" | "reformat" | "explain")[];
  /** Terms that must never appear in output for this action (in addition to global forbidden claims). */
  forbiddenTerms: string[];
}

export type RuleOutcome = "SEND" | "NO_ACTION" | "REVIEW" | "BLOCK";

export interface PolicyRule {
  id: string;
  description: Bilingual;
  outcome: RuleOutcome;
  actionId?: string;
  priority: number;
}

export interface SafetyPolicy {
  version: string;
  name: string;
  effectiveFrom: string;
  expiresAt: string;
  status: "active" | "expired" | "draft";
  rules: PolicyRule[];
  approvedContacts: { label: Bilingual; number: string }[];
  closureApproachMeters: number;
  boundaryUncertaintyMeters: number;
}

// ---------------------------------------------------------------------------------------------
// Recipients (synthetic only)
// ---------------------------------------------------------------------------------------------

export type Mobility = "resident" | "driver" | "visitor";
export type LocationStatus = "ok" | "missing" | "stale" | "invalid";

export interface AccessibilityProfile {
  plainLanguage: boolean;
  largeText: boolean;
  screenReader: boolean;
  audio: boolean;
  highContrast: boolean;
}

export interface Recipient {
  id: string; // RES-014
  displayName: string; // synthetic
  language: Lang;
  mobility: Mobility;
  location: Point | null;
  locationStatus: LocationStatus;
  locationAccuracyM: number;
  areaLabel: Bilingual;
  route: LineString | null;
  accessibility: AccessibilityProfile;
  vulnerability: ("elderly" | "mobility" | "medical" | "child")[];
  channel: "in_app" | "sms_sim";
  token: string;
  persona?: "mariam" | "daniel" | "omar";
  sim: { kind: "safe" | "help" | "clarify" | "none"; delaySec: number; text?: string } | null;
}

// ---------------------------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------------------------

export interface GeoChecks {
  locationUsable: boolean;
  insideZone: boolean;
  onBoundary: boolean;
  distanceToZoneM: number | null;
  withinUncertainty: boolean;
  routeIntersectsClosure: boolean;
  nearestClosureId: string | null;
  distanceToClosureM: number | null;
}

export interface DecisionTrace {
  recipientId: string;
  incidentId: string;
  policyVersion: string;
  ruleId: string;
  outcome: RuleOutcome;
  actionId: string | null;
  language: Lang;
  variant: ActionVariant;
  checks: GeoChecks;
  factsUsed: { label: string; value: string; source: string }[];
  reasons: string[];
  category: "inside_zone" | "approaching_closure" | "outside" | "needs_review" | "blocked";
  evaluatedAt: string;
}

// ---------------------------------------------------------------------------------------------
// Communication
// ---------------------------------------------------------------------------------------------

export type GuidanceState = "draft" | "validated" | "rejected" | "approved" | "superseded";

export interface ValidationCheck {
  id: string;
  label: string;
  passed: boolean;
  detail?: string;
}

export interface GuidanceDraft {
  id: string;
  incidentId: string;
  actionId: string;
  language: Lang;
  variant: ActionVariant;
  approvedWording: ActionTemplate; // original approved wording with facts filled
  content: ActionTemplate; // selected / generated localized message
  mode: "template" | "llm";
  provider: string;
  model: string | null;
  fallbackUsed: boolean;
  checks: ValidationCheck[];
  validationPassed: boolean;
  state: GuidanceState;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
}

export const MessageStateSchema = z.enum([
  "draft",
  "awaiting_approval",
  "approved",
  "queued",
  "sent",
  "delivered",
  "acknowledged",
  "assistance_requested",
  "clarification_requested",
  "no_response",
  "failed",
  "expired",
  "superseded",
]);
export type MessageState = z.infer<typeof MessageStateSchema>;

export interface Message {
  id: string;
  incidentId: string;
  recipientId: string;
  guidanceId: string;
  actionId: string;
  language: Lang;
  variant: ActionVariant;
  channel: "in_app" | "sms_sim";
  state: MessageState;
  createdAt: string;
  approvedAt: string | null;
  queuedAt: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  respondedAt: string | null;
  deliveryAttempts: number;
}

export const ResponseKindSchema = z.enum(["safe", "help", "clarify"]);
export type ResponseKind = z.infer<typeof ResponseKindSchema>;

export interface CitizenResponse {
  id: string;
  messageId: string;
  recipientId: string;
  incidentId: string;
  kind: ResponseKind;
  text: string | null;
  questionId: string | null;
  classification: { category: string; method: "deterministic" | "llm"; confidence: number; needsHuman: boolean } | null;
  source: "citizen_live" | "simulated_population";
  receivedAt: string;
}

export type CaseStatus = "open" | "acknowledged" | "follow_up_recorded" | "resolved";

export interface AssistanceCase {
  id: string;
  incidentId: string;
  recipientId: string;
  responseId: string;
  priority: "P1" | "P2";
  status: CaseStatus;
  summary: string;
  openedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  notes: { at: string; by: string; text: string }[];
}

export interface ReviewItem {
  id: string;
  incidentId: string;
  kind: "clarification" | "location_missing" | "conflicting_facts" | "validation_failure";
  recipientId: string | null;
  responseId: string | null;
  question: string | null;
  status: "open" | "answered" | "closed";
  createdAt: string;
  resolvedAt: string | null;
  resolution: string | null;
}

export interface AuditEvent {
  id: number;
  at: string;
  actor: string;
  type: string;
  entity: string | null;
  summary: string;
  data: Record<string, unknown> | null;
}

export type GeoPoint = Point;
export type GeoLine = LineString | MultiLineString;
