import "server-only";
import * as turf from "@turf/turf";
import type { Point } from "geojson";
import { PREDEFINED_QUESTIONS, APPROVED_ANSWERS } from "@/scenario/policy";
import { SCENARIO_LABEL } from "@/scenario/scenario";
import { fillText } from "@/domain/comms/facts";
import * as store from "../store";
import { recipientForToken } from "./citizen";
import { messageFacts } from "./workflow";

/**
 * The citizen's inbox in the in-app simulation channel. Only messages that reached the device
 * (sent / delivered) are visible. Content is always an approved guidance variant.
 */
export function citizenInbox(token: string) {
  const r = recipientForToken(token);
  const visible = store.messages.forRecipient(r.id).filter((m) => m.sentAt);
  const alerts = visible.map((m) => {
    const incident = store.incidents.get(m.incidentId)!;
    const facts = messageFacts(incident);
    const variants = store.guidance
      .forIncident(m.incidentId)
      .filter((g) => g.actionId === m.actionId && g.state === "approved")
      .map((g) => ({ language: g.language, variant: g.variant, content: g.content, guidanceId: g.id }));
    const hazard = store.hazards.forIncident(m.incidentId);
    const closures = store.closures.forIncident(m.incidentId);
    const responses = store.responses.forMessage(m.id).map((x) => ({
      kind: x.kind,
      at: x.receivedAt,
      text: x.text,
      answerId: x.classification?.category.startsWith("answered:") ? x.classification.category.split(":")[1] : null,
      escalated: x.kind === "clarify" && !!x.classification?.needsHuman,
    }));
    const caseRecord = store.cases.openForRecipient(m.incidentId, r.id) ?? store.cases.forIncident(m.incidentId).filter((c) => c.recipientId === r.id).at(-1) ?? null;
    return {
      messageId: m.id,
      incidentId: m.incidentId,
      state: m.state,
      actionId: m.actionId,
      variant: m.variant,
      language: m.language,
      sentAt: m.sentAt,
      deliveredAt: m.deliveredAt,
      title: incident.title,
      severity: incident.severity,
      incidentState: incident.state,
      source: { name: incident.sourceAgency.name, ref: incident.sourceRef, simulated: true },
      issuedAt: incident.issuedAt,
      validUntil: incident.validUntil,
      areaName: facts.zone,
      variants,
      responses,
      case: caseRecord ? { id: caseRecord.id, status: caseRecord.status, priority: caseRecord.priority, notes: caseRecord.notes.filter((n) => n.by.startsWith("OP-")).map((n) => ({ at: n.at, text: n.text })) } : null,
      questions: PREDEFINED_QUESTIONS.filter((q) => {
        const a = APPROVED_ANSWERS.find((x) => x.id === q.id);
        return !a || a.appliesTo.includes(m.actionId);
      }),
      answers: Object.fromEntries(
        APPROVED_ANSWERS.filter((a) => a.appliesTo.includes(m.actionId)).map((a) => [a.id, { en: fillText(a.answer.en, "en", facts), ar: fillText(a.answer.ar, "ar", facts) }]),
      ),
      geography: {
        zone: hazard ? turf.simplify(turf.feature(hazard.geometry), { tolerance: 0.00005 }).geometry : null,
        closures: closures.map((c) => c.geometry),
        // Coarse position only (≈100 m) — enough for "you are here" context.
        you: r.location && r.locationStatus === "ok" ? ({ type: "Point", coordinates: r.location.coordinates.map((v) => Math.round(v * 1000) / 1000) } as Point) : null,
      },
    };
  });
  return {
    recipient: {
      id: r.id,
      displayName: r.displayName,
      language: r.language,
      mobility: r.mobility,
      areaLabel: r.areaLabel,
      accessibility: r.accessibility,
      channel: r.channel,
    },
    scenarioLabel: SCENARIO_LABEL,
    alerts,
  };
}

export type CitizenInbox = ReturnType<typeof citizenInbox>;
