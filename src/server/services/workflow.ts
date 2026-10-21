import "server-only";
import { z } from "zod";
import type { ActionVariant, GuidanceDraft, Incident, Lang, Message, ValidationCheck } from "@/domain/types";
import { assess, checkIncidentGate } from "@/domain/safety-engine";
import { assertValidZone } from "@/domain/geo";
import { renderApproved, lockedFactValues, type MessageFacts } from "@/domain/comms/facts";
import { validateCandidate, checkBilingualConsistency } from "@/domain/comms/validator";
import { actionById, SAFETY_POLICY } from "@/scenario/policy";
import { db, getMeta, J, tx } from "../db";
import { audit } from "../bus";
import { getProvider } from "../comms/providers";
import * as store from "../store";

export class WorkflowError extends Error {
  constructor(
    message: string,
    public status = 409,
    public details?: unknown,
  ) {
    super(message);
  }
}

const SourcePayloadSchema = z.object({
  feed: z.string().min(1),
  ref: z.string().min(1),
  category: z.literal("flood_risk_heavy_rain"),
  severity: z.enum(["advisory", "watch", "warning", "emergency"]),
  issuedAt: z.string(),
  validFrom: z.string(),
  validUntil: z.string(),
  geometry: z.object({ type: z.literal("Polygon"), coordinates: z.array(z.array(z.array(z.number()))) }),
  signature: z.string(),
  closures: z.array(z.object({ id: z.string(), feed: z.string(), confirmed: z.boolean() })),
});

function requireIncident(id: string): Incident {
  const i = store.incidents.get(id);
  if (!i) throw new WorkflowError(`Incident ${id} not found`, 404);
  return i;
}

export function messageFacts(incident: Incident): MessageFacts {
  const hazard = store.hazards.forIncident(incident.id);
  const closure = store.closures.forIncident(incident.id)[0];
  return {
    zone: hazard?.name ?? incident.areaName,
    closure: closure?.name ?? { en: "", ar: "" },
    validUntil: incident.validUntil,
  };
}

function save(incident: Incident, patch: Partial<Incident>) {
  const next = { ...incident, ...patch, updatedAt: new Date().toISOString() };
  store.incidents.save(next);
  return next;
}

/** Step 1 — verify the simulated government source (signature, schema, geometry, closure confirmation). */
export function verifySource(incidentId: string, actor: string): Incident {
  const incident = requireIncident(incidentId);
  if (!["draft", "blocked"].includes(incident.state) && incident.verification.status === "verified") return incident;
  const row = db().prepare("SELECT payload FROM hazard_sources WHERE incident_id = ? ORDER BY received_at DESC LIMIT 1").get(incidentId) as
    | { payload: string }
    | undefined;
  const notes: string[] = [];
  let ok = true;
  const parsed = SourcePayloadSchema.safeParse(row ? J.parse(row.payload) : null);
  if (!parsed.success) {
    ok = false;
    notes.push("Payload failed schema validation");
  } else {
    notes.push("Payload schema valid");
    if (parsed.data.signature !== "sim-ed25519:valid") {
      ok = false;
      notes.push("Simulated signature check FAILED");
    } else notes.push("Simulated signature check passed (mock key SIM-MET-2026)");
    try {
      assertValidZone(parsed.data.geometry as never);
      notes.push("Hazard geometry valid (closed, non-self-intersecting)");
    } catch (e) {
      ok = false;
      notes.push(`Hazard geometry invalid: ${(e as Error).message}`);
    }
    const unconfirmed = parsed.data.closures.filter((c) => !c.confirmed);
    if (unconfirmed.length) {
      ok = false;
      notes.push(`Unconfirmed closures: ${unconfirmed.map((c) => c.id).join(", ")}`);
    } else notes.push(`Closures confirmed by ${parsed.data.closures[0]?.feed ?? "—"}`);
    if (parsed.data.severity !== incident.severity) {
      ok = false;
      notes.push(`Severity mismatch between feed (${parsed.data.severity}) and incident (${incident.severity})`);
    }
  }
  if (incident.conflicts.length) {
    ok = false;
    notes.push(...incident.conflicts.map((c) => `Conflict: ${c}`));
  }
  const now = new Date().toISOString();
  const next = save(incident, {
    verification: {
      status: ok ? "verified" : incident.conflicts.length ? "conflicting" : "unverified",
      method: "Simulated feed signature check + schema validation",
      checkedAt: now,
      signatureValid: ok,
      notes,
    },
    state: ok ? "verified" : "blocked",
  });
  audit(actor, ok ? "source.verified" : "source.rejected", ok ? `Source ${incident.sourceRef} verified` : `Source ${incident.sourceRef} failed verification`, {
    entity: incidentId,
    data: { notes },
  });
  return next;
}

/** Step 2 — geographic matching + deterministic policy evaluation for every recipient. */
export function assessImpact(incidentId: string, actor: string) {
  const incident = requireIncident(incidentId);
  if (incident.verification.status !== "verified") throw new WorkflowError("Source must be verified before assessment (R-00-VERIFY)");
  const hazard = store.hazards.forIncident(incidentId);
  const closures = store.closures.forIncident(incidentId);
  if (!hazard) throw new WorkflowError("Missing hazard geometry");
  const recipients = store.recipients.all();
  const now = new Date();
  const result = assess(recipients, { incident, policy: SAFETY_POLICY, hazard, closures, now });
  tx(() => {
    store.decisions.replaceAll(incidentId, result.traces);
    store.assessments.save(`ASM-${now.getTime()}`, incidentId, now.toISOString(), result.gate, result.summary);
    for (const t of result.traces.filter((x) => x.outcome === "REVIEW")) {
      const existing = store.reviews.forIncident(incidentId).find((r) => r.kind === "location_missing" && r.recipientId === t.recipientId);
      if (existing) continue;
      store.reviews.save({
        id: store.reviews.nextId(),
        incidentId,
        kind: "location_missing",
        recipientId: t.recipientId,
        responseId: null,
        question: t.reasons.join("; "),
        status: "open",
        createdAt: now.toISOString(),
        resolvedAt: null,
        resolution: null,
      });
    }
    if (result.gate.ok) save(incident, { state: incident.state === "verified" ? "assessed" : incident.state });
    else save(incident, { state: "blocked" });
    audit("geo-engine", "impact.computed", `Geographic matching: ${result.summary.insideZone} inside zone, ${result.summary.approachingClosure} approaching closure, ${result.summary.outside} outside, ${result.summary.review} need review`, {
      entity: incidentId,
      data: { summary: result.summary },
    });
    audit(actor, "policy.evaluated", `${SAFETY_POLICY.version} applied: ${result.summary.send} recipients matched an approved action`, {
      entity: incidentId,
      data: { gate: result.gate, byAction: result.summary.byAction },
    });
  });
  return result;
}

const variantsNeeded = (incidentId: string) => {
  const set = new Map<string, { actionId: string; language: Lang; variant: ActionVariant }>();
  for (const t of store.decisions.forIncident(incidentId)) {
    if (t.outcome !== "SEND" || !t.actionId) continue;
    // Prepare every language × accessibility variant of each matched action, so bilingual consistency is
    // checkable and citizens can switch language or plain/audio format without leaving approved content.
    for (const language of ["en", "ar"] as Lang[]) {
      for (const variant of ["standard", "plain", "audio"] as ActionVariant[]) {
        set.set(`${t.actionId}|${language}|${variant}`, { actionId: t.actionId, language, variant });
      }
    }
  }
  return [...set.values()];
};

/** Step 3 — prepare localized guidance (template-selected, or LLM-simplified and validated). */
export async function prepareGuidance(incidentId: string, actor: string): Promise<GuidanceDraft[]> {
  const incident = requireIncident(incidentId);
  if (!["assessed", "approved"].includes(incident.state)) throw new WorkflowError(`Guidance can only be prepared after assessment (state: ${incident.state})`);
  const gate = checkIncidentGate(incident, SAFETY_POLICY, store.hazards.forIncident(incidentId), store.closures.forIncident(incidentId), new Date());
  if (!gate.ok) throw new WorkflowError("Publication gate failed", 409, gate.blocks);
  const facts = messageFacts(incident);
  const provider = getProvider();
  const drafts: GuidanceDraft[] = [];

  for (const need of variantsNeeded(incidentId)) {
    const action = actionById(need.actionId)!;
    const approved = renderApproved(action, need.language, need.variant, facts);
    let content = approved;
    let mode: GuidanceDraft["mode"] = "template";
    let fallbackUsed = false;
    let checks: ValidationCheck[];
    let passed: boolean;

    if (provider.id !== "template" && need.variant !== "standard") {
      try {
        const candidate = await provider.rewriteVariant({
          actionId: action.id,
          language: need.language,
          variant: need.variant,
          approvedStandard: renderApproved(action, need.language, "standard", facts),
          lockedFacts: lockedFactValues(action, need.language, facts),
        });
        if (candidate) {
          const v = validateCandidate({ actionId: action.id, language: need.language, variant: need.variant, content: candidate }, { action, language: need.language, variant: need.variant, facts }, SAFETY_POLICY);
          if (v.passed) {
            content = candidate;
            mode = "llm";
          } else {
            fallbackUsed = true;
            audit("comms-validator", "guidance.blocked", `LLM candidate for ${action.id}/${need.language}/${need.variant} blocked — approved template used`, {
              entity: incidentId,
              data: { failed: v.checks.filter((c) => !c.passed) },
            });
          }
        } else fallbackUsed = true;
      } catch (e) {
        fallbackUsed = true;
        audit("comms-provider", "guidance.provider_error", `Provider unavailable (${(e as Error).name}) — approved template used`, { entity: incidentId });
      }
    }
    ({ checks, passed } = validateCandidate({ actionId: action.id, language: need.language, variant: need.variant, content }, { action, language: need.language, variant: need.variant, facts }, SAFETY_POLICY));
    const draft: GuidanceDraft = {
      id: `GD-${action.id}-${need.language}-${need.variant}`,
      incidentId,
      actionId: action.id,
      language: need.language,
      variant: need.variant,
      approvedWording: approved,
      content,
      mode,
      provider: mode === "llm" ? provider.label : "Approved template library",
      model: mode === "llm" ? provider.model : null,
      fallbackUsed,
      checks,
      validationPassed: passed,
      state: passed ? "validated" : "rejected",
      approvedBy: null,
      approvedAt: null,
      createdAt: new Date().toISOString(),
    };
    drafts.push(draft);
  }

  // Bilingual consistency per action/variant pair
  for (const d of drafts.filter((x) => x.language === "en")) {
    const ar = drafts.find((x) => x.actionId === d.actionId && x.variant === d.variant && x.language === "ar");
    if (!ar) continue;
    const check = checkBilingualConsistency(
      { actionId: d.actionId, language: "en", variant: d.variant, content: d.content },
      { actionId: ar.actionId, language: "ar", variant: ar.variant, content: ar.content },
      actionById(d.actionId)!,
      facts,
    );
    for (const x of [d, ar]) {
      x.checks.push(check);
      x.validationPassed = x.validationPassed && check.passed;
      x.state = x.validationPassed ? "validated" : "rejected";
    }
  }

  const now = new Date().toISOString();
  tx(() => {
    // Re-preparing supersedes previous drafts and unapproved messages.
    store.guidance.deleteForIncident(incidentId);
    db().prepare("DELETE FROM messages WHERE incident_id = ? AND state IN ('draft','awaiting_approval')").run(incidentId);
    for (const d of drafts) store.guidance.save(d);
    for (const t of store.decisions.forIncident(incidentId)) {
      if (t.outcome !== "SEND" || !t.actionId) continue;
      const recipient = store.recipients.get(t.recipientId)!;
      const gid = `GD-${t.actionId}-${t.language}-${t.variant}`;
      const msg: Message = {
        id: `MSG-${incidentId.replace("EVT-", "")}-${t.recipientId}`,
        incidentId,
        recipientId: t.recipientId,
        guidanceId: gid,
        actionId: t.actionId,
        language: t.language,
        variant: t.variant,
        channel: recipient.channel,
        state: "awaiting_approval",
        createdAt: now,
        approvedAt: null,
        queuedAt: null,
        sentAt: null,
        deliveredAt: null,
        respondedAt: null,
        deliveryAttempts: 0,
      };
      store.messages.insert(msg);
    }
    const llm = drafts.filter((d) => d.mode === "llm").length;
    audit("comms", "guidance.generated", `${drafts.length} localized guidance variants prepared (${llm ? `${llm} LLM-simplified` : "approved templates"})`, {
      entity: incidentId,
      data: { provider: provider.id, variants: drafts.map((d) => d.id) },
    });
    audit("comms-validator", "guidance.validated", `${drafts.filter((d) => d.validationPassed).length}/${drafts.length} variants passed safety validation`, {
      entity: incidentId,
    });
  });
  return drafts;
}

/** Step 4 — operator approval. Fail-closed: any gate failure or invalid variant blocks approval. */
export function approveGuidance(incidentId: string, operatorId: string, note?: string) {
  const incident = requireIncident(incidentId);
  const gate = checkIncidentGate(incident, SAFETY_POLICY, store.hazards.forIncident(incidentId), store.closures.forIncident(incidentId), new Date());
  if (!gate.ok) throw new WorkflowError("Approval blocked by safety gate", 409, gate.blocks);
  const drafts = store.guidance.forIncident(incidentId);
  if (!drafts.length) throw new WorkflowError("No guidance prepared");
  const invalid = drafts.filter((d) => !d.validationPassed);
  if (invalid.length) throw new WorkflowError("Some guidance variants failed validation", 409, invalid.map((d) => d.id));
  const now = new Date().toISOString();
  tx(() => {
    for (const d of drafts) store.guidance.save({ ...d, state: "approved", approvedBy: operatorId, approvedAt: now });
    db().prepare("UPDATE messages SET state = 'approved', approved_at = ? WHERE incident_id = ? AND state = 'awaiting_approval'").run(now, incidentId);
    db()
      .prepare("INSERT INTO approvals (id, incident_id, operator_id, at, guidance_ids, note) VALUES (?, ?, ?, ?, ?, ?)")
      .run(`APR-${Date.now()}`, incidentId, operatorId, now, J.str(drafts.map((d) => d.id)), note ?? null);
    save(incident, { state: "approved" });
    audit(operatorId, "operator.approved", `Operator approved ${drafts.length} guidance variants for publication`, { entity: incidentId, data: { note: note ?? null } });
  });
}

const simSpeed = () => Math.max(0.1, Number(getMeta("sim_speed") ?? 1));

/** Step 5 — publish to simulated channels. Never sends real messages. */
export function publish(incidentId: string, operatorId: string) {
  const incident = requireIncident(incidentId);
  if (incident.state !== "approved") throw new WorkflowError(`Publication requires operator approval (state: ${incident.state})`);
  const gate = checkIncidentGate(incident, SAFETY_POLICY, store.hazards.forIncident(incidentId), store.closures.forIncident(incidentId), new Date());
  if (!gate.ok) throw new WorkflowError("Publication blocked by safety gate", 409, gate.blocks);
  const approved = store.messages.forIncident(incidentId).filter((m) => m.state === "approved");
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const speed = simSpeed();
  let queued = 0;
  tx(() => {
    for (const [i, m] of approved.entries()) {
      if (!store.messages.transition(m.id, ["approved"], "queued", { queued_at: now })) continue;
      queued++;
      const sendAt = nowMs + Math.round((300 + i * 9) / speed);
      store.schedule.add(sendAt, "deliver", { messageId: m.id, attempt: 1 });
      const recipient = store.recipients.get(m.recipientId)!;
      const sim = recipient.sim;
      // Live demo personas (Mariam, Daniel) have no simulated behaviour: their responses are real taps.
      if (sim && sim.kind !== "none") {
        store.schedule.add(sendAt + Math.round((2000 + sim.delaySec * 1000) / speed), "sim_response", { messageId: m.id });
      }
    }
    // Represents the operational acknowledgement window (compressed for the simulation).
    store.schedule.add(nowMs + Math.round(75_000 / speed), "flag_no_response", { incidentId });
    save(incident, { state: "active" });
    audit(operatorId, "messages.issued", `${queued} approved alerts queued to simulated channels (in-app inbox / SMS simulator)`, {
      entity: incidentId,
      data: { queued },
    });
  });
  return { queued };
}

export function resolveIncident(incidentId: string, operatorId: string) {
  const incident = requireIncident(incidentId);
  if (incident.state !== "active") throw new WorkflowError("Only an active incident can be resolved");
  save(incident, { state: "resolved" });
  audit(operatorId, "incident.resolved", "Incident marked resolved by operator", { entity: incidentId });
}

/** Demonstration control: inject a conflicting severity report to show fail-closed behaviour. */
export function injectConflict(incidentId: string, operatorId: string) {
  const incident = requireIncident(incidentId);
  const conflicts = [...incident.conflicts, "SIM-ROADS reports severity 'advisory' while SIM-MET reports 'warning'"];
  save(incident, { conflicts, state: "blocked", verification: { ...incident.verification, status: "conflicting" } });
  audit(operatorId, "source.conflict", "Conflicting critical facts received — publication blocked pending review", { entity: incidentId });
  store.reviews.save({
    id: store.reviews.nextId(),
    incidentId,
    kind: "conflicting_facts",
    recipientId: null,
    responseId: null,
    question: conflicts.at(-1)!,
    status: "open",
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    resolution: null,
  });
}
