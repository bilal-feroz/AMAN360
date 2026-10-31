import "server-only";
import { checkIncidentGate } from "@/domain/safety-engine";
import { SAFETY_POLICY } from "@/scenario/policy";
import { getMeta, J, setMeta } from "../db";
import { audit, touch } from "../bus";
import * as store from "../store";
import { approveGuidance, assessImpact, prepareGuidance, publish, verifySource, WorkflowError } from "./workflow";

/**
 * Automation — what AMAN does without being asked, and the one narrow case where it may send.
 *
 * The agent runs the same audited, deterministic steps an operator would (verify the source, match
 * who is affected, prepare and validate the bilingual message) and then stops: a human approves.
 * Pre-authorised auto-send is a policy an authorised officer switches on in advance. It only fires
 * when every condition holds (official verified feed, warning severity or higher, approved template
 * wording only, all safety checks passed, no conflicting reports), and only after a hold window in
 * which any operator can stop it. Social-media signals can never start either path.
 */

export const AGENT_ACTOR = "AMAN-AGENT";
export const POLICY_ACTOR = "AUTO-POLICY";
/** Pause between a feed arriving and the agent picking it up (lets the operator see it land). */
export const AGENT_DELAY_MS = 8000;
/** Override window before a pre-authorised automatic send goes out. */
export const HOLD_MS = 15000;

export interface AgentState {
  status: "idle" | "scheduled" | "running" | "done" | "stopped" | "failed";
  dueAt?: number;
  startedAt?: string;
  finishedAt?: string;
  ms?: number;
  reason?: string;
  requestedBy?: string;
}

export interface AutoSendState {
  status: "countdown" | "held" | "sent" | "cancelled";
  dueAt?: number;
  at?: string;
  by?: string;
  reason?: string;
}

export interface AutoSendCheck {
  id: string;
  ok: boolean;
  en: string;
  ar: string;
}

const readMeta = <T>(key: string): T | null => {
  try {
    return J.parse<T>(getMeta(key));
  } catch {
    return null;
  }
};
const writeMeta = (key: string, value: unknown) => setMeta(key, value ? J.str(value) : "");

export const autoPrepareOn = () => getMeta("auto_prepare") !== "0";
export const autoSendOn = () => getMeta("auto_send") === "1";

/** Queues the agent for a newly arrived alert (no-op when auto-prepare is switched off). */
export function scheduleAgent(incidentId: string, delayMs = AGENT_DELAY_MS) {
  if (!autoPrepareOn()) return writeMeta("agent", { status: "idle" } satisfies AgentState);
  const dueAt = Date.now() + delayMs;
  store.schedule.add(dueAt, "agent_prepare", { incidentId });
  writeMeta("agent", { status: "scheduled", dueAt } satisfies AgentState);
}

const g = globalThis as unknown as { __amanAgent?: { epoch: string | null; run: Promise<AgentState> } | null };

/** Runs the preparation pipeline once per scenario; concurrent callers share the same run. */
export function runAgent(incidentId: string, requestedBy?: string): Promise<AgentState> {
  const epoch = getMeta("agent_epoch");
  if (g.__amanAgent && g.__amanAgent.epoch === epoch) return g.__amanAgent.run;
  const run = pipeline(incidentId, requestedBy).finally(() => {
    if (g.__amanAgent?.run === run) g.__amanAgent = null;
  });
  g.__amanAgent = { epoch, run };
  return run;
}

async function pipeline(incidentId: string, requestedBy?: string): Promise<AgentState> {
  // A run that outlives a reset belongs to the old scenario: it must not write into the new one.
  const epoch = getMeta("agent_epoch");
  const stale = () => getMeta("agent_epoch") !== epoch;
  const stop = (status: "stopped" | "failed", reason: string, extra: Partial<AgentState> = {}) => {
    if (stale()) return { status: "idle" } as AgentState;
    const state: AgentState = { ...extra, status, reason, finishedAt: new Date().toISOString() };
    writeMeta("agent", state);
    audit(AGENT_ACTOR, status === "failed" ? "agent.failed" : "agent.stopped", `AMAN agent stopped: ${reason}`, { entity: incidentId });
    return state;
  };
  let incident = store.incidents.get(incidentId);
  if (!incident) return stop("failed", "incident not found");
  if (incident.state === "blocked") return stop("stopped", "conflicting reports — a human must review before anything is prepared");
  if (incident.state !== "draft" && store.guidance.forIncident(incidentId).length) {
    // Already prepared by hand (or by a preset) — nothing for the agent to do.
    const current = readMeta<AgentState>("agent");
    if (current?.status === "scheduled") writeMeta("agent", { status: "idle" } satisfies AgentState);
    return current ?? { status: "idle" };
  }

  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  writeMeta("agent", { status: "running", startedAt, requestedBy } satisfies AgentState);
  audit(requestedBy ?? AGENT_ACTOR, "agent.started", requestedBy ? "Operator started the AMAN agent on the verified-feed alert" : "AMAN agent picked up the verified-feed alert", { entity: incidentId });
  try {
    if (incident.state === "draft") {
      incident = verifySource(incidentId, AGENT_ACTOR);
      if (incident.verification.status !== "verified") return stop("stopped", "the source failed verification — nothing was prepared", { startedAt });
    }
    if (incident.state === "verified") {
      assessImpact(incidentId, AGENT_ACTOR);
      incident = store.incidents.get(incidentId)!;
    }
    if (incident.state === "blocked") return stop("stopped", "the publication gate is closed — a human must review", { startedAt });
    if (["assessed", "approved"].includes(incident.state) && !store.guidance.forIncident(incidentId).length) {
      await prepareGuidance(incidentId, AGENT_ACTOR, { templatesOnly: autoSendOn() });
    }
    if (stale()) return { status: "idle" };
    const ms = Date.now() - t0;
    const drafts = store.guidance.forIncident(incidentId);
    const people = store.assessments.latest(incidentId)?.summary.send ?? 0;
    const state: AgentState = { status: "done", startedAt, finishedAt: new Date().toISOString(), ms, requestedBy };
    writeMeta("agent", state);
    audit(
      AGENT_ACTOR,
      "agent.ready",
      `AMAN agent prepared the alert in ${(ms / 1000).toFixed(1)} s: ${people} people matched, ${drafts.filter((d) => d.validationPassed).length}/${drafts.length} message versions passed — waiting for a human`,
      { entity: incidentId, data: { ms, people } },
    );
    maybeArmAutoSend(incidentId);
    return state;
  } catch (e) {
    return stop("failed", (e as Error).message, { startedAt });
  }
}

/** The conditions the pre-authorised policy requires. Every one must hold, every time. */
export function autoSendChecks(incidentId: string): AutoSendCheck[] {
  const incident = store.incidents.get(incidentId);
  if (!incident) return [];
  const gate = checkIncidentGate(incident, SAFETY_POLICY, store.hazards.forIncident(incidentId), store.closures.forIncident(incidentId), new Date());
  const drafts = store.guidance.forIncident(incidentId);
  return [
    { id: "policy", ok: autoSendOn(), en: "Switched on in advance by an authorised officer", ar: "فعّلها ضابط مخوّل مسبقًا" },
    { id: "source", ok: incident.verification.status === "verified" && incident.verification.signatureValid, en: "Official, verified government feed", ar: "موجز حكومي رسمي موثّق" },
    { id: "severity", ok: ["warning", "emergency"].includes(incident.severity), en: "Severity is warning or higher", ar: "الخطورة تحذير أو أعلى" },
    { id: "templates", ok: drafts.length > 0 && drafts.every((d) => d.mode === "template"), en: "Pre-approved wording only — no AI text", ar: "صياغة معتمدة مسبقًا فقط — دون نص من الذكاء الاصطناعي" },
    { id: "checks", ok: drafts.length > 0 && drafts.every((d) => d.validationPassed), en: "Every safety check passed", ar: "اجتازت جميع فحوص السلامة" },
    { id: "gate", ok: gate.ok, en: "No conflicting reports", ar: "لا توجد بلاغات متعارضة" },
  ];
}

/** Starts the hold window when the policy is on and every condition holds. */
export function maybeArmAutoSend(incidentId: string): boolean {
  const incident = store.incidents.get(incidentId);
  if (!incident || incident.state !== "assessed") return false;
  const current = readMeta<AutoSendState>("auto_send_state");
  if (current && ["countdown", "held", "sent"].includes(current.status)) return false;
  if (!autoSendChecks(incidentId).every((c) => c.ok)) return false;
  const dueAt = Date.now() + HOLD_MS;
  store.schedule.add(dueAt, "auto_send", { incidentId });
  writeMeta("auto_send_state", { status: "countdown", dueAt } satisfies AutoSendState);
  audit(POLICY_ACTOR, "policy.auto_send_armed", `Pre-authorised auto-send armed: sends in ${HOLD_MS / 1000} s unless an operator holds it`, { entity: incidentId });
  return true;
}

/** Fires when the hold window ends. Re-checks every condition; any failure cancels. */
export function processAutoSend({ incidentId }: { incidentId: string }) {
  const current = readMeta<AutoSendState>("auto_send_state");
  if (current?.status !== "countdown") return;
  const incident = store.incidents.get(incidentId);
  if (!incident || incident.state !== "assessed") {
    writeMeta("auto_send_state", { status: "cancelled", reason: "handled by an operator", at: new Date().toISOString() } satisfies AutoSendState);
    touch("policy.auto_send");
    return;
  }
  const failed = autoSendChecks(incidentId).find((c) => !c.ok);
  if (failed) {
    writeMeta("auto_send_state", { status: "cancelled", reason: failed.en, at: new Date().toISOString() } satisfies AutoSendState);
    audit(POLICY_ACTOR, "policy.auto_send_cancelled", `Automatic send cancelled — condition no longer met: ${failed.en}`, { entity: incidentId });
    return;
  }
  approveGuidance(incidentId, POLICY_ACTOR, "Pre-authorised auto-send policy");
  publish(incidentId, POLICY_ACTOR);
  writeMeta("auto_send_state", { status: "sent", by: POLICY_ACTOR, at: new Date().toISOString() } satisfies AutoSendState);
  audit(POLICY_ACTOR, "policy.auto_sent", "Alert sent automatically under the pre-authorised policy — operators notified and can follow up", { entity: incidentId });
}

/** Any operator can stop an automatic send during the hold window. */
export function holdAutoSend(incidentId: string, operatorId: string) {
  const current = readMeta<AutoSendState>("auto_send_state");
  if (current?.status !== "countdown") throw new WorkflowError("There is no automatic send to hold");
  writeMeta("auto_send_state", { status: "held", by: operatorId, at: new Date().toISOString() } satisfies AutoSendState);
  audit(operatorId, "operator.held_auto_send", "Operator held the automatic send — the alert now needs a human approval", { entity: incidentId });
}

/** One human decision: approve the prepared message and send it. */
export function approveAndSend(incidentId: string, operatorId: string) {
  const incident = store.incidents.get(incidentId);
  if (incident?.state === "assessed") approveGuidance(incidentId, operatorId);
  const result = publish(incidentId, operatorId);
  const current = readMeta<AutoSendState>("auto_send_state");
  if (current?.status === "countdown") writeMeta("auto_send_state", { status: "sent", by: operatorId, at: new Date().toISOString() } satisfies AutoSendState);
  return result;
}

export async function setAutomationPolicy(incidentId: string, operatorId: string, patch: { autoPrepare?: boolean; autoSend?: boolean }) {
  if (patch.autoPrepare !== undefined) {
    setMeta("auto_prepare", patch.autoPrepare ? "1" : "0");
    audit(operatorId, "policy.updated", `Agent auto-prepare switched ${patch.autoPrepare ? "on" : "off"}`, { entity: incidentId });
    const agent = readMeta<AgentState>("agent");
    if (!patch.autoPrepare && agent?.status === "scheduled") writeMeta("agent", { status: "idle" } satisfies AgentState);
    if (patch.autoPrepare && store.incidents.get(incidentId)?.state === "draft" && agent?.status !== "scheduled") scheduleAgent(incidentId, 1500);
  }
  if (patch.autoSend !== undefined) {
    setMeta("auto_send", patch.autoSend ? "1" : "0");
    setMeta("auto_send_by", patch.autoSend ? operatorId : "");
    audit(operatorId, "policy.updated", `Pre-authorised auto-send switched ${patch.autoSend ? "on" : "off"} by ${operatorId}`, { entity: incidentId });
    const current = readMeta<AutoSendState>("auto_send_state");
    if (!patch.autoSend && current?.status === "countdown") {
      writeMeta("auto_send_state", { status: "cancelled", reason: "policy switched off", at: new Date().toISOString() } satisfies AutoSendState);
    }
    if (patch.autoSend) {
      if (current && ["held", "cancelled"].includes(current.status)) writeMeta("auto_send_state", null);
      const incident = store.incidents.get(incidentId);
      // A message a model helped write is re-prepared from approved templates before it may auto-send.
      if (incident?.state === "assessed" && store.guidance.forIncident(incidentId).some((d) => d.mode !== "template")) {
        await prepareGuidance(incidentId, AGENT_ACTOR, { templatesOnly: true });
      }
      maybeArmAutoSend(incidentId);
    }
  }
}

/** Called by reset: every drill starts with the agent queued and auto-send off (human approval). */
export function resetAutomation(incidentId: string) {
  setMeta("agent_epoch", String(Number(getMeta("agent_epoch") ?? 0) + 1));
  setMeta("auto_send", "0");
  setMeta("auto_send_by", "");
  writeMeta("auto_send_state", null);
  scheduleAgent(incidentId);
}

export function automationStatus(incidentId: string) {
  return {
    autoPrepare: autoPrepareOn(),
    autoSend: autoSendOn(),
    autoSendBy: getMeta("auto_send_by") || null,
    holdMs: HOLD_MS,
    agent: readMeta<AgentState>("agent") ?? ({ status: "idle" } as AgentState),
    send: readMeta<AutoSendState>("auto_send_state"),
    checks: autoSendChecks(incidentId),
  };
}
