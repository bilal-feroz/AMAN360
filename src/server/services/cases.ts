import "server-only";
import type { AssistanceCase, CaseStatus } from "@/domain/types";
import { audit } from "../bus";
import { tx } from "../db";
import * as store from "../store";
import { WorkflowError } from "./workflow";

/**
 * Human follow-up for assistance requests. Operators acknowledge, record simulated follow-up and
 * resolve cases. "Follow-up" is a record of what the operator did in the training scenario — the
 * prototype has no dispatch integration and never reports a unit as dispatched.
 */

const CASE_FLOW: Record<CaseStatus, CaseStatus[]> = {
  open: ["acknowledged"],
  acknowledged: ["follow_up_recorded", "resolved"],
  follow_up_recorded: ["follow_up_recorded", "resolved"],
  resolved: [],
};

export function canTransition(from: CaseStatus, to: CaseStatus) {
  return CASE_FLOW[from].includes(to);
}

export function updateCase(caseId: string, operatorId: string, action: "acknowledge" | "follow_up" | "resolve", note?: string): AssistanceCase {
  const c = store.cases.get(caseId);
  if (!c) throw new WorkflowError("Case not found", 404);
  const to: CaseStatus = action === "acknowledge" ? "acknowledged" : action === "follow_up" ? "follow_up_recorded" : "resolved";
  if (!canTransition(c.status, to)) throw new WorkflowError(`Case ${caseId} cannot move from ${c.status} to ${to}`);
  if (action === "follow_up" && !note?.trim()) throw new WorkflowError("A follow-up note is required", 400);
  const now = new Date().toISOString();
  const next: AssistanceCase = {
    ...c,
    status: to,
    acknowledgedAt: to === "acknowledged" ? now : c.acknowledgedAt,
    resolvedAt: to === "resolved" ? now : c.resolvedAt,
    notes: note?.trim() ? [...c.notes, { at: now, by: operatorId, text: note.trim().slice(0, 600) }] : c.notes,
  };
  tx(() => {
    // The message keeps its "assistance requested" history; resolution lives on the case record.
    store.cases.save(next);
    audit(operatorId, `case.${action}`, `${caseId} ${action === "follow_up" ? "follow-up recorded (simulated)" : to}`, { entity: caseId, data: { note: note ?? null } });
  });
  return next;
}

export function resolveReview(reviewId: string, operatorId: string, resolution: string) {
  const r = store.reviews.get(reviewId);
  if (!r) throw new WorkflowError("Review item not found", 404);
  if (r.status !== "open") throw new WorkflowError("Review item already closed");
  if (!resolution.trim()) throw new WorkflowError("A resolution note is required", 400);
  const now = new Date().toISOString();
  store.reviews.save({ ...r, status: r.kind === "clarification" ? "answered" : "closed", resolvedAt: now, resolution: resolution.trim().slice(0, 600) });
  audit(operatorId, "review.resolved", `${reviewId} (${r.kind}) resolved by operator`, { entity: reviewId });
}
