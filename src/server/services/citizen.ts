import "server-only";
import { randomUUID } from "node:crypto";
import type { CitizenResponse, FireDetails, FireSituation, MessageState, Recipient, ResponseKind } from "@/domain/types";
import { matchClarification, classifyHelpText, isEscalationTopic } from "@/domain/comms/classify";
import { fillText } from "@/domain/comms/facts";
import { APPROVED_ANSWERS } from "@/scenario/policy";
import { audit } from "../bus";
import { tx } from "../db";
import { getProvider } from "../comms/providers";
import * as store from "../store";
import { messageFacts, WorkflowError } from "./workflow";

/**
 * Citizen response handling — the closed loop. Every response is persisted, changes the message
 * state through an explicit transition table, and (for help requests) opens a reviewable case.
 * Nothing here claims that an emergency service has been dispatched.
 */

export const RESPONDABLE: MessageState[] = ["delivered", "acknowledged", "clarification_requested", "no_response", "assistance_requested"];

/** Allowed message transitions on a citizen response. */
export function nextState(current: MessageState, kind: ResponseKind): MessageState | null {
  if (!RESPONDABLE.includes(current)) return null;
  if (current === "assistance_requested") return "assistance_requested"; // stays until an operator resolves the case
  if (kind === "help") return "assistance_requested";
  if (kind === "safe") return "acknowledged";
  return current === "acknowledged" ? "acknowledged" : "clarification_requested";
}

export interface SubmitInput {
  token: string;
  messageId?: string;
  kind: ResponseKind;
  text?: string | null;
  questionId?: string | null;
  idempotencyKey?: string | null;
  source?: CitizenResponse["source"];
  /** Building fire: out, still inside or trapped — and the floor the person is on. */
  situation?: FireSituation | null;
  floor?: number | null;
}

/**
 * Building fire: trapped is always P1; still inside is P1 on or above the fire floor or with a
 * recorded need. Deterministic, and only ever raises the text classification, never lowers it.
 */
export function firePriority(fire: FireDetails, situation: FireSituation | null | undefined, floor: number | null | undefined, vulnerable: boolean): "P1" | "P2" | null {
  if (situation === "trapped") return "P1";
  if (situation === "inside") return vulnerable || (floor ?? fire.fireFloor) >= fire.fireFloor ? "P1" : "P2";
  return null;
}

export interface SubmitResult {
  response: CitizenResponse;
  duplicate: boolean;
  messageState: MessageState;
  caseId: string | null;
  answer: { id: string; text: string } | null;
  escalated: boolean;
}

export function recipientForToken(token: string): Recipient {
  const r = token && token.length >= 16 ? store.recipients.byToken(token) : null;
  if (!r) throw new WorkflowError("Invalid or expired access link", 401);
  return r;
}

export function activeMessageFor(recipientId: string) {
  return store.messages.forRecipient(recipientId).find((m) => ["sent", "delivered", ...RESPONDABLE].includes(m.state)) ?? null;
}

export async function submitResponse(input: SubmitInput): Promise<SubmitResult> {
  const recipient = recipientForToken(input.token);
  if (input.idempotencyKey) {
    const prior = store.responses.byIdempotency(`${recipient.id}:${input.idempotencyKey}`);
    if (prior) {
      const m = store.messages.get(prior.messageId)!;
      return { response: prior, duplicate: true, messageState: m.state, caseId: store.cases.openForRecipient(prior.incidentId, recipient.id)?.id ?? null, answer: null, escalated: false };
    }
  }
  const message = input.messageId ? store.messages.get(input.messageId) : activeMessageFor(recipient.id);
  if (!message || message.recipientId !== recipient.id) throw new WorkflowError("No active alert for this recipient", 404);
  const incident = store.incidents.get(message.incidentId)!;
  if (incident.state === "resolved") throw new WorkflowError("This alert has been resolved", 410);
  // A message is respondable once it reached the device (sent counts: the inbox is in-app).
  const current: MessageState = message.state === "sent" ? "delivered" : message.state;
  const next = nextState(current, input.kind);
  if (!next) throw new WorkflowError(`Cannot respond to a message in state "${message.state}"`, 409);

  // Duplicate "I am safe" taps are recorded once.
  if (input.kind === "safe" && message.state === "acknowledged") {
    const last = store.responses.forMessage(message.id).filter((r) => r.kind === "safe").at(-1);
    if (last) return { response: last, duplicate: true, messageState: "acknowledged", caseId: null, answer: null, escalated: false };
  }

  const now = new Date().toISOString();
  const text = input.text?.toString().slice(0, 500).trim() || null;
  let answer: SubmitResult["answer"] = null;
  let escalated = false;
  let classification: CitizenResponse["classification"] = null;

  if (input.kind === "clarify") {
    let match = matchClarification(text ?? "", message.actionId, input.questionId ?? null);
    const provider = getProvider();
    // Rescue, shelter, medical… questions always reach a person: the model is not asked to pick an answer.
    if (!match.answerId && text && provider.id !== "template" && !input.questionId && !isEscalationTopic(text)) {
      try {
        const allowed = APPROVED_ANSWERS.filter((a) => a.appliesTo.includes(message.actionId)).map((a) => a.id);
        const llm = await provider.selectAnswer(text, allowed, recipient.language);
        if (llm?.answerId) match = { answerId: llm.answerId, confidence: llm.confidence, method: "llm", matchedTerms: [] };
      } catch {
        /* provider outage: deterministic result stands (escalation) */
      }
    }
    const approved = match.answerId ? APPROVED_ANSWERS.find((a) => a.id === match.answerId) : null;
    if (approved) {
      answer = { id: approved.id, text: fillText(approved.answer[recipient.language], recipient.language, messageFacts(incident)) };
    } else escalated = true;
    classification = { category: approved ? `answered:${approved.id}` : "unverifiable_question", method: match.method === "llm" ? "llm" : "deterministic", confidence: match.confidence, needsHuman: !approved };
  }
  if (input.kind === "help") {
    const c = classifyHelpText(text, recipient.vulnerability);
    classification = { category: `assistance:${c.priority}`, method: "deterministic", confidence: c.confidence, needsHuman: true };
  }
  if (input.kind === "safe") classification = { category: "safe", method: "deterministic", confidence: 1, needsHuman: false };

  // Building fire: the reported situation and floor travel with the response (validated, never guessed).
  const fire = incident.fire;
  const situation: FireSituation | null = fire ? (input.kind === "safe" ? "out" : input.kind === "help" ? (input.situation === "trapped" ? "trapped" : input.situation === "inside" ? "inside" : null) : null) : null;
  const reportedFloor = fire && Number.isInteger(input.floor) && input.floor! >= 0 && input.floor! <= fire.floors ? input.floor! : null;
  const floor = situation === "inside" || situation === "trapped" ? reportedFloor ?? recipient.building?.floor ?? null : null;

  const response: CitizenResponse = {
    id: `RSP-${randomUUID().slice(0, 8)}`,
    messageId: message.id,
    recipientId: recipient.id,
    incidentId: message.incidentId,
    kind: input.kind,
    text,
    questionId: input.questionId ?? null,
    classification,
    source: input.source ?? "citizen_live",
    receivedAt: now,
    ...(fire && { situation, floor }),
  };
  const fireLabel =
    situation === "trapped" || situation === "inside"
      ? recipient.language === "ar"
        ? `${situation === "trapped" ? "عالق" : "ما زال في الداخل"}${floor !== null ? ` — الطابق ${floor}` : ""}`
        : `${situation === "trapped" ? "Trapped" : "Still inside"}${floor !== null ? ` — floor ${floor}` : ""}`
      : null;

  let caseId: string | null = null;
  tx(() => {
    store.responses.insert(response, input.idempotencyKey ? `${recipient.id}:${input.idempotencyKey}` : null);
    store.messages.transition(message.id, [message.state], next, { responded_at: now });
    const actor = response.source === "citizen_live" ? `citizen:${recipient.id}` : `sim:${recipient.id}`;
    if (input.kind === "help") {
      const open = store.cases.openForRecipient(message.incidentId, recipient.id);
      const c = classifyHelpText(text, recipient.vulnerability);
      const fireP = fire ? firePriority(fire, situation, floor, recipient.vulnerability.length > 0) : null;
      const priority = c.priority === "P1" || fireP === "P1" ? "P1" : "P2";
      if (open) {
        caseId = open.id;
        // Details sent after a bare "I need help" replace the placeholder summary, and triage reads them.
        const firstText = !store.responses.forMessage(message.id).some((x) => x.kind === "help" && x.text && x.id !== response.id);
        store.cases.save({
          ...open,
          // A later report can raise the priority (trapped) but never lowers it.
          priority: open.priority === "P1" ? "P1" : priority,
          summary: text && firstText ? text : open.summary,
          notes: [...open.notes, { at: now, by: actor, text: `Additional help request: ${[fireLabel, text].filter(Boolean).join(" · ") || "(no text)"}` }],
          ...(fire && situation && { situation, floor }),
        });
        if (text) store.schedule.add(Date.now(), "case_triage", { caseId, again: true });
      } else {
        caseId = store.cases.nextId();
        store.cases.save({
          id: caseId,
          incidentId: message.incidentId,
          recipientId: recipient.id,
          responseId: response.id,
          priority,
          status: "open",
          summary: text ?? fireLabel ?? (recipient.language === "ar" ? "طلب مساعدة بدون نص" : "Help requested (no details given)"),
          openedAt: now,
          acknowledgedAt: null,
          resolvedAt: null,
          notes: [],
          ...(fire && { situation, floor }),
        });
        // AI triage runs straight after, off the citizen's request path (it can only raise priority).
        store.schedule.add(Date.now(), "case_triage", { caseId });
      }
      audit(actor, "response.assistance", `${recipient.id} requested assistance${fire && situation ? ` (${situation}${floor !== null ? `, floor ${floor}` : ""})` : ""} — ${caseId} (${priority}) opened for human review`, {
        entity: caseId,
        data: { recipientId: recipient.id, priority, signals: c.signals, situation, floor },
      });
    } else if (input.kind === "clarify") {
      if (escalated) {
        store.reviews.save({
          id: store.reviews.nextId(),
          incidentId: message.incidentId,
          kind: "clarification",
          recipientId: recipient.id,
          responseId: response.id,
          question: text ?? input.questionId ?? "",
          status: "open",
          createdAt: now,
          resolvedAt: null,
          resolution: null,
        });
      }
      audit(actor, "response.clarification", escalated ? `${recipient.id} asked a question that cannot be verified — escalated to review` : `${recipient.id} asked a question — answered with approved answer ${answer?.id}`, {
        entity: message.id,
        data: { escalated, answerId: answer?.id ?? null },
      });
    } else {
      if (message.state === "assistance_requested") {
        const open = store.cases.openForRecipient(message.incidentId, recipient.id);
        if (open) {
          store.cases.save({
            ...open,
            notes: [...open.notes, { at: now, by: actor, text: fire ? "Citizen later reported: I'm out of the building" : "Citizen later reported: I am safe" }],
            ...(fire && { situation: "out" as const }),
          });
        }
      }
      audit(actor, "response.safe", fire ? `${recipient.id} reported being out of the building` : `${recipient.id} confirmed safety`, { entity: message.id });
    }
  });
  return { response, duplicate: false, messageState: next, caseId, answer, escalated };
}
