import "server-only";
import { getMeta } from "../db";
import { audit, touch } from "../bus";
import * as store from "../store";
import { submitResponse } from "./citizen";
import { meshDetail, networkFor } from "./network";
import { logAlertSms } from "./sms";

/**
 * Deterministic delivery & response simulator. Scheduled items live in SQLite (sim_schedule), so
 * the simulation survives reloads and restarts; they are processed whenever the server is polled
 * or streaming. Simulated channel delivery is NOT real delivery and is labelled as such.
 */

const g = globalThis as unknown as { __amanSimBusy?: boolean };

export async function processDue(now = Date.now()): Promise<number> {
  if (g.__amanSimBusy) return 0;
  g.__amanSimBusy = true;
  let processed = 0;
  try {
    const items = store.schedule.due(now);
    for (const item of items) {
      try {
        if (item.kind === "deliver") deliver(item.payload as { messageId: string; attempt: number }, item.dueAt);
        else if (item.kind === "sim_response") await simResponse(item.payload as { messageId: string }, item.dueAt);
        else if (item.kind === "flag_no_response") flagNoResponse(item.payload as { incidentId: string });
        else if (item.kind === "signal_verify") (await import("../signals/service")).completeVerification(item.payload as { dataset: "scenario"; hotspotId: string });
        else if (item.kind === "case_triage") await (await import("./triage")).triageCase(item.payload as { caseId: string; again?: boolean });
        // Not awaited: the agent can wait on a model, and it reports its own progress over the bus.
        else if (item.kind === "agent_prepare") {
          const automation = await import("./automation");
          if (automation.autoPrepareOn()) void automation.runAgent((item.payload as { incidentId: string }).incidentId);
        } else if (item.kind === "auto_send") (await import("./automation")).processAutoSend(item.payload as { incidentId: string });
      } catch (e) {
        console.warn(`[sim] ${item.kind} failed:`, (e as Error).message);
      }
      store.schedule.markDone(item.id);
      processed++;
    }
    if (processed && items.some((i) => i.kind === "deliver")) touch("delivery.progress");
  } finally {
    g.__amanSimBusy = false;
  }
  return processed;
}

/** sms_sim deliveries for a deterministic subset fail once and are retried (exercise the retry path). */
function shouldFailFirstAttempt(recipientId: string, channel: string) {
  const n = Number(recipientId.replace(/\D/g, ""));
  return channel === "sms_sim" && n % 9 === 0;
}

function deliver({ messageId, attempt }: { messageId: string; attempt: number }, dueAt: number) {
  const m = store.messages.get(messageId);
  if (!m || !["queued", "sent"].includes(m.state)) return;
  const at = new Date(dueAt).toISOString();
  const speed = Math.max(0.1, Number(getMeta("sim_speed") ?? 1));
  if (attempt === 1 && shouldFailFirstAttempt(m.recipientId, m.channel)) {
    store.messages.transition(m.id, ["queued"], "queued", {}, true);
    store.messages.recordAttempt(m.id, attempt, m.channel, "failed", at, "SMS simulator: gateway timeout (simulated)");
    store.schedule.add(dueAt + Math.round(3000 / speed), "deliver", { messageId, attempt: attempt + 1 });
    return;
  }
  // Cell-outage drill: no service in the zone. Smartphones go over the mesh relay; SMS waits.
  const r = store.recipients.get(m.recipientId);
  const net = r ? networkFor(r) : { status: "ok" as const, route: null };
  if (net.status === "none") {
    store.messages.transition(m.id, ["queued"], "queued", {}, true);
    store.messages.recordAttempt(m.id, attempt, m.channel, "failed", at, m.channel === "sms_sim" ? "No cell service in the zone (simulated outage) — SMS waits for the network" : "No cell service and no mesh relay in range (simulated) — retrying");
    store.schedule.add(dueAt + Math.round(8000 / speed), "deliver", { messageId, attempt: attempt + 1 });
    return;
  }
  const channel = net.status === "mesh" ? "mesh_sim" : m.channel;
  store.messages.transition(m.id, ["queued"], "sent", { sent_at: at }, true);
  store.messages.recordAttempt(m.id, attempt, channel, "sent", at);
  const hopsMs = net.route ? net.route.hops * 400 : 0;
  const deliveredAt = new Date(dueAt + Math.round((350 + hopsMs + (Number(m.recipientId.replace(/\D/g, "")) % 7) * 120) / speed)).toISOString();
  store.messages.transition(m.id, ["sent"], "delivered", { delivered_at: deliveredAt });
  store.messages.recordAttempt(m.id, attempt, channel, "delivered", deliveredAt, net.route ? meshDetail(net.route) : m.channel === "in_app" ? "In-app simulation inbox" : "SMS simulator");
  if (m.channel === "sms_sim") logAlertSms(m, deliveredAt);
}

async function simResponse({ messageId }: { messageId: string }, dueAt: number) {
  const m = store.messages.get(messageId);
  if (!m) return;
  const r = store.recipients.get(m.recipientId);
  if (!r?.sim || r.sim.kind === "none") return;
  if (["queued", "sent"].includes(m.state)) {
    // Delivery is still being retried — the simulated person responds after it arrives.
    store.schedule.add(dueAt + 3500, "sim_response", { messageId });
    return;
  }
  if (!["delivered", "no_response"].includes(m.state)) return; // never overwrite a live response
  await submitResponse({
    token: r.token,
    messageId,
    kind: r.sim.kind,
    text: r.sim.kind === "safe" ? null : r.sim.text ?? null,
    idempotencyKey: `sim-${messageId}`,
    situation: r.sim.situation === "inside" || r.sim.situation === "trapped" ? r.sim.situation : null,
    floor: r.sim.floor ?? null,
    source: "simulated_population",
  });
}

function flagNoResponse({ incidentId }: { incidentId: string }) {
  const now = new Date().toISOString();
  const pending = store.messages.forIncident(incidentId).filter((m) => m.state === "delivered");
  let n = 0;
  for (const m of pending) if (store.messages.transition(m.id, ["delivered"], "no_response", { no_response_at: now })) n++;
  if (n) audit("system", "no_response.flagged", `${n} delivered alerts have no response after the acknowledgement window — flagged for follow-up`, { entity: incidentId, data: { count: n } });
}

/** Presentation helper: pull all pending simulation items forward so they complete now. */
export async function fastForward(): Promise<number> {
  const next = store.schedule.nextDue();
  if (next !== null) {
    const now = Date.now();
    store.schedule.shiftAll(Math.max(0, next - now) + 120_000);
  }
  let total = 0;
  for (let i = 0; i < 5; i++) {
    const n = await processDue(Date.now());
    total += n;
    if (!n) break;
  }
  return total;
}
