import "server-only";
import { actionById } from "@/scenario/policy";
import { activeIncidentId, policyFor } from "./active";
import { lockedFactValues } from "@/domain/comms/facts";
import * as store from "../store";
import { messageFacts } from "./workflow";

/**
 * Explainability: the full chain for one recipient —
 * verified event → geographic match → approved safety rule → communication → response → human follow-up.
 */
export function recipientChain(recipientId: string) {
  const recipient = store.recipients.get(recipientId);
  if (!recipient) return null;
  const incident = store.incidents.get(activeIncidentId())!;
  const decision = store.decisions.get(activeIncidentId(), recipientId);
  const rule = decision ? policyFor(incident).rules.find((r) => r.id === decision.ruleId) ?? null : null;
  const action = decision?.actionId ? actionById(decision.actionId) ?? null : null;
  const message = store.messages.forRecipient(recipientId).find((m) => m.incidentId === activeIncidentId()) ?? null;
  const guidance = message ? store.guidance.get(message.guidanceId) : null;
  const responses = message ? store.responses.forMessage(message.id) : [];
  const caseRecord = store.cases.forIncident(activeIncidentId()).filter((c) => c.recipientId === recipientId).at(-1) ?? null;
  const reviews = store.reviews.forIncident(activeIncidentId()).filter((r) => r.recipientId === recipientId);
  const keys = [recipientId, message?.id, caseRecord?.id].filter(Boolean) as string[];
  const events = store.auditLog
    .recent(5000)
    .filter((e) => keys.some((k) => e.entity === k || e.actor.endsWith(k) || e.summary.includes(k)))
    .reverse();
  const facts = messageFacts(incident);
  const { token: _token, sim: _sim, ...publicRecipient } = recipient;

  return {
    recipient: publicRecipient,
    incident: {
      id: incident.id,
      title: incident.title,
      severity: incident.severity,
      sourceAgency: incident.sourceAgency,
      sourceRef: incident.sourceRef,
      verification: incident.verification,
      issuedAt: incident.issuedAt,
      validUntil: incident.validUntil,
      policyVersion: incident.policyVersion,
      fire: incident.fire ?? null,
    },
    decision,
    rule,
    action: action
      ? {
          id: action.id,
          title: action.title,
          policyVersion: action.policyVersion,
          lockedFacts: lockedFactValues(action, recipient.language, facts),
          allowedOperations: action.allowedOperations,
        }
      : null,
    aiBoundaries: {
      mayChange: ["Wording simplicity (plain-language variant)", "Sentence structure for text-to-speech", "Presentation language (from approved bilingual wording)"],
      locked: [
        "Selected action and its steps",
        "Hazard severity",
        "Affected zone geometry and road closure",
        "Validity time and place names",
        "Contacts and numbers",
        "Any claim that services are responding",
      ],
    },
    guidance,
    message: message ? { ...message, attempts: store.messages.attempts(message.id) } : null,
    responses,
    case: caseRecord,
    reviews,
    events,
  };
}

export function decisionTable() {
  const recips = new Map(store.recipients.all().map((r) => [r.id, r]));
  const msgs = new Map(store.messages.forIncident(activeIncidentId()).map((m) => [m.recipientId, m]));
  return store.decisions.forIncident(activeIncidentId()).map((d) => {
    const r = recips.get(d.recipientId)!;
    const m = msgs.get(d.recipientId);
    return {
      recipientId: d.recipientId,
      displayName: r.displayName,
      mobility: r.mobility,
      language: d.language,
      variant: d.variant,
      category: d.category,
      ruleId: d.ruleId,
      outcome: d.outcome,
      actionId: d.actionId,
      insideZone: d.checks.insideZone,
      routeIntersectsClosure: d.checks.routeIntersectsClosure,
      distanceToZoneM: d.checks.distanceToZoneM,
      messageState: m?.state ?? null,
      persona: r.persona ?? null,
    };
  });
}
