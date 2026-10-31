import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.AMAN_DATA_DIR = mkdtempSync(path.join(tmpdir(), "aman-test-"));
delete process.env.ANTHROPIC_API_KEY;

const { useMemoryDb, db } = await import("@/server/db");
const { resetScenario } = await import("@/server/services/reset");
const wf = await import("@/server/services/workflow");
const auto = await import("@/server/services/automation");
const { getOpsState } = await import("@/server/services/state");
const store = await import("@/server/store");

const ID = "EVT-RAIN-001";
const OP = "OP-ALYA";

beforeAll(() => {
  useMemoryDb();
});
beforeEach(() => {
  resetScenario("test");
});

describe("AMAN agent", () => {
  it("is queued when an alert arrives and auto-send starts off", () => {
    const a = auto.automationStatus(ID);
    expect(a.agent.status).toBe("scheduled");
    expect(a.autoSend).toBe(false);
    expect(a.send).toBeNull();
  });

  it("prepares a verified alert end to end, then stops for a human", async () => {
    const result = await auto.runAgent(ID);
    expect(result.status).toBe("done");
    const s = getOpsState();
    expect(s.incident.state).toBe("assessed");
    expect(s.assessment?.summary.send).toBe(120);
    expect(s.guidance.length).toBeGreaterThan(0);
    expect(s.guidance.every((g) => g.validationPassed)).toBe(true);
    expect(s.metrics.alertsSent).toBe(0);
    expect(store.messages.forIncident(ID).every((m) => m.state === "awaiting_approval")).toBe(true);
    expect(s.automation.send).toBeNull();
  });

  it("stops fail-closed on conflicting reports and prepares nothing", async () => {
    wf.injectConflict(ID, OP);
    const result = await auto.runAgent(ID);
    expect(result.status).toBe("stopped");
    expect(store.incidents.get(ID)!.state).toBe("blocked");
    expect(store.guidance.forIncident(ID)).toHaveLength(0);
  });

  it("shares one run between concurrent callers", async () => {
    const [a, b] = await Promise.all([auto.runAgent(ID), auto.runAgent(ID, OP)]);
    expect(a).toBe(b);
    expect(store.auditLog.recent(200).filter((e) => e.type === "agent.ready")).toHaveLength(1);
  });

  it("a run that outlives a reset writes nothing into the new scenario", async () => {
    const old = auto.runAgent(ID); // stops at its first await (drafting the message)
    resetScenario("test"); // the operator resets meanwhile
    await old;
    expect(store.incidents.get(ID)!.state).toBe("draft");
    expect(store.guidance.forIncident(ID)).toHaveLength(0);
    expect(auto.automationStatus(ID).agent.status).toBe("scheduled");
    // The new scenario's own run starts fresh instead of reusing the old one, and prepares properly.
    expect((await auto.runAgent(ID)).status).toBe("done");
    expect(store.messages.forIncident(ID)).toHaveLength(120);
  });

  it("refuses to send when there is nothing to send", async () => {
    wf.verifySource(ID, OP);
    wf.assessImpact(ID, OP);
    await wf.prepareGuidance(ID, OP);
    wf.approveGuidance(ID, OP);
    db().prepare("DELETE FROM messages").run();
    expect(() => wf.publish(ID, OP)).toThrow(/No approved messages/);
  });

  it("approve & send is a single human decision", async () => {
    await auto.runAgent(ID);
    auto.approveAndSend(ID, OP);
    expect(store.incidents.get(ID)!.state).toBe("active");
    expect(store.guidance.forIncident(ID).every((g) => g.approvedBy === OP)).toBe(true);
  });
});

describe("pre-authorised auto-send", () => {
  it("never arms while the policy is off", async () => {
    await auto.runAgent(ID);
    expect(auto.maybeArmAutoSend(ID)).toBe(false);
    expect(auto.automationStatus(ID).send).toBeNull();
  });

  it("arms after preparation and sends when the hold window ends", async () => {
    await auto.setAutomationPolicy(ID, OP, { autoSend: true });
    await auto.runAgent(ID);
    expect(auto.automationStatus(ID).send?.status).toBe("countdown");
    auto.processAutoSend({ incidentId: ID });
    expect(store.incidents.get(ID)!.state).toBe("active");
    expect(store.guidance.forIncident(ID).every((g) => g.approvedBy === auto.POLICY_ACTOR)).toBe(true);
    expect(store.auditLog.recent(200).some((e) => e.type === "policy.auto_sent")).toBe(true);
  });

  it("an operator hold stops it", async () => {
    await auto.setAutomationPolicy(ID, OP, { autoSend: true });
    await auto.runAgent(ID);
    auto.holdAutoSend(ID, OP);
    auto.processAutoSend({ incidentId: ID });
    expect(store.incidents.get(ID)!.state).toBe("assessed");
    expect(auto.automationStatus(ID).send?.status).toBe("held");
  });

  it("refuses wording a model wrote", async () => {
    await auto.setAutomationPolicy(ID, OP, { autoSend: true });
    await auto.runAgent(ID);
    auto.holdAutoSend(ID, OP);
    const d = store.guidance.forIncident(ID).find((g) => g.variant === "plain")!;
    store.guidance.save({ ...d, mode: "llm" });
    expect(auto.autoSendChecks(ID).find((c) => c.id === "templates")?.ok).toBe(false);
  });

  it("re-checks at send time and cancels if anything changed", async () => {
    await auto.setAutomationPolicy(ID, OP, { autoSend: true });
    await auto.runAgent(ID);
    await auto.setAutomationPolicy(ID, OP, { autoSend: false });
    auto.processAutoSend({ incidentId: ID });
    expect(store.incidents.get(ID)!.state).toBe("assessed");
    expect(auto.automationStatus(ID).send?.status).toBe("cancelled");
  });

  it("turns off on reset", async () => {
    await auto.setAutomationPolicy(ID, OP, { autoSend: true });
    resetScenario("test");
    expect(auto.automationStatus(ID).autoSend).toBe(false);
  });
});
