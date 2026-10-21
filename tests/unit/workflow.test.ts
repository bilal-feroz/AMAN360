import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.AMAN_DATA_DIR = mkdtempSync(path.join(tmpdir(), "aman-test-"));
delete process.env.ANTHROPIC_API_KEY;

const { useMemoryDb, db } = await import("@/server/db");
const { resetScenario } = await import("@/server/services/reset");
const wf = await import("@/server/services/workflow");
const { submitResponse, nextState } = await import("@/server/services/citizen");
const { fastForward, processDue } = await import("@/server/services/sim");
const { computeMetrics, getOpsState } = await import("@/server/services/state");
const { updateCase } = await import("@/server/services/cases");
const store = await import("@/server/store");

const ID = "EVT-RAIN-001";
const OP = "OP-ALYA";
const token = (id: string) => store.recipients.get(id)!.token;

async function runToPublished() {
  wf.verifySource(ID, OP);
  wf.assessImpact(ID, OP);
  await wf.prepareGuidance(ID, OP);
  wf.approveGuidance(ID, OP);
  wf.publish(ID, OP);
  await fastForward();
}

beforeAll(() => {
  useMemoryDb();
});
beforeEach(() => {
  resetScenario("test");
});

describe("incident workflow", () => {
  it("reset restores the documented baseline", () => {
    const s = getOpsState();
    expect(s.incident.state).toBe("draft");
    expect(s.metrics.alertsSent).toBe(0);
    expect(store.recipients.all()).toHaveLength(156);
    expect(s.cases).toHaveLength(0);
  });

  it("activation computes geographic impact from records", () => {
    wf.verifySource(ID, OP);
    const { summary } = wf.assessImpact(ID, OP);
    expect(summary.send).toBe(120);
    expect(store.decisions.forIncident(ID)).toHaveLength(156);
    expect(store.reviews.forIncident(ID).filter((r) => r.kind === "location_missing")).toHaveLength(4);
  });

  it("assessment is refused before the source is verified", () => {
    expect(() => wf.assessImpact(ID, OP)).toThrow(/verified/);
  });

  it("publication requires operator approval", async () => {
    wf.verifySource(ID, OP);
    wf.assessImpact(ID, OP);
    await wf.prepareGuidance(ID, OP);
    expect(() => wf.publish(ID, OP)).toThrow(/approval/);
    expect(store.messages.forIncident(ID).every((m) => m.state === "awaiting_approval")).toBe(true);
  });

  it("conflicting facts block approval", async () => {
    wf.verifySource(ID, OP);
    wf.assessImpact(ID, OP);
    await wf.prepareGuidance(ID, OP);
    wf.injectConflict(ID, OP);
    expect(() => wf.approveGuidance(ID, OP)).toThrow(/gate/);
  });

  it("publishing creates simulated messages and delivers each exactly once", async () => {
    await runToPublished();
    const msgs = store.messages.forIncident(ID);
    expect(msgs).toHaveLength(120);
    expect(msgs.every((m) => m.sentAt && m.deliveredAt)).toBe(true);
    // A second publish is refused and cannot create duplicates
    expect(() => wf.publish(ID, OP)).toThrow();
    const dup = store.messages.insert({ ...msgs[0], id: "MSG-DUP" } as never);
    expect(dup).toBe(0);
    const delivered = db().prepare("SELECT message_id, COUNT(*) c FROM delivery_attempts WHERE status = 'delivered' GROUP BY message_id HAVING c > 1").all();
    expect(delivered).toHaveLength(0);
  });

  it("simulated population reaches the seeded checkpoint and live responses complete it", async () => {
    await runToPublished();
    let m = computeMetrics(ID);
    expect(m.alertsSent).toBe(120);
    expect(m.safe).toBe(84);
    expect(m.assistance).toBe(7);
    expect(m.awaiting).toBe(29);

    await submitResponse({ token: token("RES-047"), kind: "safe", idempotencyKey: "daniel-safe-1" });
    const help = await submitResponse({ token: token("RES-014"), kind: "help", text: "المياه دخلت إلى الطابق الأرضي، ووالدي كبير في السن", idempotencyKey: "mariam-help-1" });
    expect(help.caseId).toMatch(/^CASE-/);

    m = computeMetrics(ID);
    expect(m.safe).toBe(85);
    expect(m.assistance).toBe(8);
    expect(m.awaiting).toBe(27);
    expect(m.cases.total).toBe(8);
    // metrics match underlying records
    const rows = db().prepare("SELECT state, COUNT(*) c FROM messages GROUP BY state").all() as { state: string; c: number }[];
    const by = Object.fromEntries(rows.map((r) => [r.state, r.c]));
    expect(by.acknowledged).toBe(m.safe);
    expect(by.assistance_requested).toBe(m.assistance);
  });
});

describe("citizen responses", () => {
  beforeEach(async () => {
    wf.verifySource(ID, OP);
    wf.assessImpact(ID, OP);
    await wf.prepareGuidance(ID, OP);
    wf.approveGuidance(ID, OP);
    wf.publish(ID, OP);
    await processDue(Date.now() + 5_000);
  });

  it("safe confirmation persists", async () => {
    await submitResponse({ token: token("RES-047"), kind: "safe" });
    const msg = store.messages.forRecipient("RES-047")[0];
    expect(msg.state).toBe("acknowledged");
    expect(store.responses.forMessage(msg.id)).toHaveLength(1);
  });

  it("assistance request creates a prioritised case", async () => {
    const r = await submitResponse({ token: token("RES-014"), kind: "help", text: "Water entering, elderly father" });
    const c = store.cases.get(r.caseId!)!;
    expect(c.priority).toBe("P1");
    expect(c.status).toBe("open");
    expect(store.messages.forRecipient("RES-014")[0].state).toBe("assistance_requested");
  });

  it("an unverifiable clarification creates a review item; an approved one is answered", async () => {
    const a = await submitResponse({ token: token("RES-014"), kind: "clarify", text: "Will the water reach my building?" });
    expect(a.escalated).toBe(true);
    expect(store.reviews.forIncident(ID).some((r) => r.kind === "clarification" && r.recipientId === "RES-014")).toBe(true);
    const b = await submitResponse({ token: token("RES-014"), kind: "clarify", questionId: "Q-UNTIL" });
    expect(b.answer?.id).toBe("Q-UNTIL");
    expect(b.answer?.text).toMatch(/بتوقيت الإمارات/);
  });

  it("invalid tokens are rejected", async () => {
    await expect(submitResponse({ token: "not-a-real-token-123456", kind: "safe" })).rejects.toThrow(/Invalid/);
    await expect(submitResponse({ token: "", kind: "safe" })).rejects.toThrow(/Invalid/);
  });

  it("duplicate submissions are handled idempotently", async () => {
    const a = await submitResponse({ token: token("RES-047"), kind: "safe", idempotencyKey: "same-key-123" });
    const b = await submitResponse({ token: token("RES-047"), kind: "safe", idempotencyKey: "same-key-123" });
    const c = await submitResponse({ token: token("RES-047"), kind: "safe" });
    expect(b.duplicate).toBe(true);
    expect(c.duplicate).toBe(true);
    expect(b.response.id).toBe(a.response.id);
    expect(store.responses.forMessage(store.messages.forRecipient("RES-047")[0].id)).toHaveLength(1);
  });

  it("a recipient outside the zone has no alert to respond to", async () => {
    await expect(submitResponse({ token: token("RES-131"), kind: "safe" })).rejects.toThrow(/No active alert/);
  });

  it("case workflow follows its transition rules", async () => {
    const r = await submitResponse({ token: token("RES-014"), kind: "help", text: "help" });
    expect(() => updateCase(r.caseId!, OP, "resolve")).toThrow();
    updateCase(r.caseId!, OP, "acknowledge");
    expect(() => updateCase(r.caseId!, OP, "follow_up", "")).toThrow(/note/);
    updateCase(r.caseId!, OP, "follow_up", "Called household (simulated); neighbour assisting");
    const done = updateCase(r.caseId!, OP, "resolve", "Resident moved upstairs");
    expect(done.status).toBe("resolved");
    expect(done.notes).toHaveLength(2);
  });
});

describe("message state transitions", () => {
  it("follow the explicit transition table", () => {
    expect(nextState("delivered", "safe")).toBe("acknowledged");
    expect(nextState("delivered", "help")).toBe("assistance_requested");
    expect(nextState("delivered", "clarify")).toBe("clarification_requested");
    expect(nextState("acknowledged", "help")).toBe("assistance_requested");
    expect(nextState("assistance_requested", "safe")).toBe("assistance_requested");
    expect(nextState("no_response", "safe")).toBe("acknowledged");
    expect(nextState("approved", "safe")).toBeNull();
    expect(nextState("expired", "help")).toBeNull();
  });
});
