import "server-only";
import type { AssistanceCase, CitizenResponse, MessageState } from "@/domain/types";
import { aggregateToGrid } from "@/domain/geo";
import { checkIncidentGate } from "@/domain/safety-engine";
import { SAFETY_POLICY } from "@/scenario/policy";
import { INCIDENT_ID, SCENARIO_LABEL } from "@/scenario/scenario";
import { getMeta } from "../db";
import { currentVersion } from "../bus";
import { providerStatus } from "../comms/providers";
import * as store from "../store";
import type { StoredMessage } from "../store";
import { nextState } from "./citizen";

/**
 * Derived operational state. Every number shown in the command center is computed here from
 * stored records (messages, delivery attempts, responses, cases, audit events) — optionally as of a
 * past instant, which is how the timeline scrubber replays the incident.
 */

export type DerivedStatus = "not_sent" | "sent" | MessageState;

export function statusAt(m: StoredMessage, responses: CitizenResponse[], t: number): DerivedStatus {
  if (!m.sentAt || Date.parse(m.sentAt) > t) return "not_sent";
  const rs = responses.filter((r) => Date.parse(r.receivedAt) <= t);
  if (rs.length) {
    let s: MessageState = "delivered";
    for (const r of rs) s = nextState(s, r.kind) ?? s;
    return s;
  }
  if (m.noResponseAt && Date.parse(m.noResponseAt) <= t) return "no_response";
  if (m.deliveredAt && Date.parse(m.deliveredAt) <= t) return "delivered";
  return "sent";
}

export const STAGES = [
  { id: "before", type: "scenario.reset", label: { en: "Before incident", ar: "قبل الحادثة" } },
  { id: "verified", type: "source.verified", label: { en: "Alert verified", ar: "التحقق من التنبيه" } },
  { id: "area", type: "impact.computed", label: { en: "Hazard area identified", ar: "تحديد منطقة الخطر" } },
  { id: "rules", type: "policy.evaluated", label: { en: "Safety rules applied", ar: "تطبيق قواعد السلامة" } },
  { id: "issued", type: "messages.issued", label: { en: "Messages approved & issued", ar: "اعتماد الرسائل وإصدارها" } },
  { id: "responses", type: "response.", label: { en: "Responses received", ar: "استلام الردود" } },
  { id: "followup", type: "no_response.flagged", label: { en: "Unanswered & assistance cases", ar: "الحالات دون رد وطلبات المساعدة" } },
] as const;

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export function computeStages() {
  const events = store.auditLog.recent(5000).reverse();
  return STAGES.map((s) => {
    const e = s.id === "responses" ? events.find((x) => x.type.startsWith("response.")) : events.find((x) => x.type === s.type);
    return { id: s.id, label: s.label, at: e?.at ?? null };
  });
}

export function computeMetrics(incidentId: string, atMs = Date.now()) {
  const msgs = store.messages.forIncident(incidentId);
  const allResponses = store.responses.forIncident(incidentId);
  const byMsg = new Map<string, CitizenResponse[]>();
  for (const r of allResponses) byMsg.set(r.messageId, [...(byMsg.get(r.messageId) ?? []), r]);
  const statuses = new Map<string, DerivedStatus>();
  for (const m of msgs) statuses.set(m.id, statusAt(m, byMsg.get(m.id) ?? [], atMs));
  const count = (s: DerivedStatus) => [...statuses.values()].filter((x) => x === s).length;

  const sent = msgs.filter((m) => m.sentAt && Date.parse(m.sentAt) <= atMs);
  const delivered = msgs.filter((m) => m.deliveredAt && Date.parse(m.deliveredAt) <= atMs);
  const responded = sent.filter((m) => (byMsg.get(m.id) ?? []).some((r) => Date.parse(r.receivedAt) <= atMs));
  const safe = count("acknowledged");
  const assistance = count("assistance_requested");
  const clarification = count("clarification_requested");
  const noResponse = count("no_response");

  const events = store.auditLog.recent(5000);
  const firstAt = (type: string) => {
    const e = [...events].reverse().find((x) => x.type === type && Date.parse(x.at) <= atMs);
    return e ? Date.parse(e.at) : null;
  };
  const ingested = firstAt("source.ingested");
  const approvedAt = firstAt("operator.approved");
  const issuedAt = firstAt("messages.issued");
  const deliveredTimes = delivered.map((m) => Date.parse(m.deliveredAt!));
  const responseLatency = responded
    .map((m) => {
      const first = (byMsg.get(m.id) ?? []).filter((r) => Date.parse(r.receivedAt) <= atMs)[0];
      return m.deliveredAt && first ? Date.parse(first.receivedAt) - Date.parse(m.deliveredAt) : null;
    })
    .filter((x): x is number => x !== null);

  const cases = store.cases.forIncident(incidentId).filter((c) => Date.parse(c.openedAt) <= atMs);
  const caseStatusAt = (c: AssistanceCase) => (c.resolvedAt && Date.parse(c.resolvedAt) <= atMs ? "resolved" : c.acknowledgedAt && Date.parse(c.acknowledgedAt) <= atMs ? (c.status === "follow_up_recorded" ? "follow_up_recorded" : "acknowledged") : "open");
  const resolvedDur = cases.filter((c) => c.resolvedAt && Date.parse(c.resolvedAt) <= atMs).map((c) => Date.parse(c.resolvedAt!) - Date.parse(c.openedAt));
  const ackDur = cases.filter((c) => c.acknowledgedAt && Date.parse(c.acknowledgedAt) <= atMs).map((c) => Date.parse(c.acknowledgedAt!) - Date.parse(c.openedAt));

  const guidance = store.guidance.forIncident(incidentId);
  const pairs = guidance.filter((g) => g.language === "en");
  const consistent = pairs.filter((g) => g.checks.find((c) => c.id === "bilingual-consistency")?.passed).length;

  const attempts = sent.reduce((n, m) => n + m.deliveryAttempts, 0);

  return {
    at: new Date(atMs).toISOString(),
    alertsPrepared: msgs.length,
    alertsSent: sent.length,
    delivered: delivered.length,
    deliveryRetries: Math.max(0, attempts - sent.length),
    safe,
    assistance,
    clarification,
    noResponse,
    awaiting: sent.length - safe - assistance,
    responded: responded.length,
    responseRate: sent.length ? responded.length / sent.length : 0,
    byChannel: {
      in_app: sent.filter((m) => m.channel === "in_app").length,
      sms_sim: sent.filter((m) => m.channel === "sms_sim").length,
    },
    byLanguage: { en: sent.filter((m) => m.language === "en").length, ar: sent.filter((m) => m.language === "ar").length },
    cases: {
      total: cases.length,
      open: cases.filter((c) => caseStatusAt(c) === "open").length,
      acknowledged: cases.filter((c) => ["acknowledged", "follow_up_recorded"].includes(caseStatusAt(c))).length,
      resolved: cases.filter((c) => caseStatusAt(c) === "resolved").length,
      p1: cases.filter((c) => c.priority === "P1" && caseStatusAt(c) !== "resolved").length,
    },
    timings: {
      ingestToApprovalMs: ingested && approvedAt ? approvedAt - ingested : null,
      approvalToFirstDeliveryMs: approvedAt && deliveredTimes.length ? Math.min(...deliveredTimes) - approvedAt : null,
      issueToAllDeliveredMs: issuedAt && deliveredTimes.length && delivered.length === sent.length ? Math.max(...deliveredTimes) - issuedAt : null,
      medianResponseMs: median(responseLatency),
      medianCaseAckMs: median(ackDur),
      medianCaseResolutionMs: median(resolvedDur),
    },
    bilingual: { pairs: pairs.length, consistent },
    statuses,
  };
}

/** Privacy-preserving geographic aggregation (≈120 m cells; no individual points). */
export function computeClusters(incidentId: string, statuses: Map<string, DerivedStatus>, stageReached: { assessed: boolean }) {
  const recips = store.recipients.all();
  const decisions = new Map(store.decisions.forIncident(incidentId).map((d) => [d.recipientId, d]));
  const msgByRecipient = new Map(store.messages.forIncident(incidentId).map((m) => [m.recipientId, m]));
  return aggregateToGrid(
    recips.filter((r) => r.locationStatus === "ok"),
    120,
  ).map((cell) => {
    const tally: Record<string, number> = {};
    for (const r of cell.items) {
      const d = decisions.get(r.id);
      const m = msgByRecipient.get(r.id);
      const key = !stageReached.assessed || !d ? "unassessed" : m ? (statuses.get(m.id) ?? "not_sent") : d.category;
      tally[key] = (tally[key] ?? 0) + 1;
    }
    return { center: cell.center, count: cell.count, tally };
  });
}

export function getOpsState(atIso?: string | null) {
  const atMs = atIso ? Date.parse(atIso) : Date.now();
  const incident = store.incidents.get(INCIDENT_ID)!;
  const hazard = store.hazards.forIncident(INCIDENT_ID);
  const closures = store.closures.forIncident(INCIDENT_ID);
  const gate = checkIncidentGate(incident, SAFETY_POLICY, hazard, closures, new Date());
  const stages = computeStages();
  const metrics = computeMetrics(INCIDENT_ID, atMs);
  const assessment = store.assessments.latest(INCIDENT_ID);
  const assessedAt = stages.find((s) => s.id === "area")?.at;
  const assessed = !!assessedAt && Date.parse(assessedAt) <= atMs;
  const { statuses, ...metricValues } = metrics;
  const clusters = computeClusters(INCIDENT_ID, statuses, { assessed });

  const recipients = new Map(store.recipients.all().map((r) => [r.id, r]));
  const cases = store.cases.forIncident(INCIDENT_ID).map((c) => {
    const r = recipients.get(c.recipientId);
    return { ...c, recipient: r ? { id: r.id, displayName: r.displayName, language: r.language, areaLabel: r.areaLabel, vulnerability: r.vulnerability } : null };
  });
  const personas = [...recipients.values()]
    .filter((r) => r.persona || r.id === "RES-022")
    .map((r) => {
      const d = store.decisions.get(INCIDENT_ID, r.id);
      const m = store.messages.forRecipient(r.id).find((x) => x.incidentId === INCIDENT_ID);
      return {
        id: r.id,
        displayName: r.displayName,
        language: r.language,
        mobility: r.mobility,
        persona: r.persona ?? "priya",
        areaLabel: r.areaLabel,
        location: r.location,
        accessibility: r.accessibility,
        decision: d ? { ruleId: d.ruleId, outcome: d.outcome, actionId: d.actionId, category: d.category, variant: d.variant } : null,
        messageStatus: m ? (metrics.statuses.get(m.id) ?? m.state) : null,
        messageState: m?.state ?? null,
      };
    });

  return {
    version: currentVersion(),
    serverTime: new Date().toISOString(),
    viewAt: atIso ?? null,
    scenario: { label: SCENARIO_LABEL, resetAt: getMeta("reset_at"), simSpeed: Number(getMeta("sim_speed") ?? 1) },
    provider: providerStatus(),
    policy: { version: SAFETY_POLICY.version, name: SAFETY_POLICY.name, status: SAFETY_POLICY.status, expiresAt: SAFETY_POLICY.expiresAt, rules: SAFETY_POLICY.rules },
    incident,
    hazard,
    closures,
    gate,
    stages,
    assessment,
    metrics: metricValues,
    clusters,
    personas,
    cases,
    reviews: store.reviews.forIncident(INCIDENT_ID),
    guidance: store.guidance.forIncident(INCIDENT_ID),
    pendingSimulation: store.schedule.pending(),
    events: store.auditLog.recent(60).filter((e) => !(e.actor.startsWith("sim:") && e.type === "response.safe")),
  };
}

export type OpsState = ReturnType<typeof getOpsState>;
