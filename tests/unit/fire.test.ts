import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.AMAN_DATA_DIR = mkdtempSync(path.join(tmpdir(), "aman-test-"));
delete process.env.ANTHROPIC_API_KEY;

const { useMemoryDb } = await import("@/server/db");
const { resetScenario } = await import("@/server/services/reset");
const wf = await import("@/server/services/workflow");
const { submitResponse } = await import("@/server/services/citizen");
const { fastForward } = await import("@/server/services/sim");
const { getOpsState } = await import("@/server/services/state");
const { citizenInbox } = await import("@/server/services/inbox");
const { runAgent, approveAndSend } = await import("@/server/services/automation");
const { checkIncidentGate } = await import("@/domain/safety-engine");
const { FIRE_POLICY } = await import("@/scenario/fire-policy");
const { FIRE_FLOOR, FIRE_INCIDENT_ID } = await import("@/scenario/fire");
const store = await import("@/server/store");

const ID = FIRE_INCIDENT_ID;
const OP = "OP-ALYA";
const token = (id: string) => store.recipients.get(id)!.token;
const decision = (id: string) => store.decisions.get(ID, id)!;

async function prepared() {
  wf.verifySource(ID, OP);
  wf.assessImpact(ID, OP);
  await wf.prepareGuidance(ID, OP);
}

beforeAll(() => {
  useMemoryDb();
});
beforeEach(() => {
  resetScenario("test", "fire");
});

describe("tower fire drill", () => {
  it("loads the fire incident under its own policy with residents on known floors", () => {
    const s = getOpsState();
    expect(s.scenario.kind).toBe("fire");
    expect(s.incident.id).toBe(ID);
    expect(s.incident.policyVersion).toBe("POLICY-2026-02");
    expect(s.incident.fire?.fireFloor).toBe(FIRE_FLOOR);
    expect(store.recipients.all()).toHaveLength(156);
    const tower = store.recipients.all().filter((r) => r.building?.id === s.incident.fire!.buildingId);
    expect(tower).toHaveLength(62);
    expect(tower.every((r) => r.building!.floor! >= 1 && r.building!.floor! <= s.incident.fire!.floors)).toBe(true);
    expect(store.recipients.get("RES-014")!.building?.floor).toBe(19);
  });

  it("verifies the Civil Defence feed, including building, floor and instruction", () => {
    const i = wf.verifySource(ID, OP);
    expect(i.verification.status).toBe("verified");
    expect(i.verification.notes.join(" ")).toMatch(/fire floor 12, instruction: full evacuation/);
  });

  it("sends each person the message for their floor, the smoke area or the closed road", () => {
    wf.verifySource(ID, OP);
    const { summary } = wf.assessImpact(ID, OP);
    expect(decision("RES-014").actionId).toBe("ACT-FIRE-ABOVE"); // Mariam, floor 19
    expect(decision("RES-022").actionId).toBe("ACT-FIRE-BELOW"); // Priya, floor 6
    expect(decision("RES-047").actionId).toBe("ACT-FIRE-ROAD"); // Daniel, driving to the closure
    expect(decision("RES-131").outcome).toBe("NO_ACTION"); // Omar, elsewhere
    const c = summary.byCategory;
    expect((c.fire_above ?? 0) + (c.fire_below ?? 0)).toBe(62);
    expect(c.smoke_area).toBeGreaterThan(5);
    expect(summary.approachingClosure).toBe(14);
    expect(summary.review).toBe(4);
    expect(summary.send).toBe(62 + c.smoke_area + 14);
  });

  it("gives a building resident whose floor is unknown the precautionary fire-floor message", () => {
    const r = store.recipients.get("RES-022")!;
    store.recipients.save({ ...r, building: { ...r.building!, floor: null } });
    wf.verifySource(ID, OP);
    wf.assessImpact(ID, OP);
    expect(decision("RES-022").actionId).toBe("ACT-FIRE-ABOVE");
    expect(decision("RES-022").reasons[0]).toMatch(/floor unknown/);
  });

  it("blocks publication when the authority instruction has no approved wording (R-03-MODE)", () => {
    const i = wf.verifySource(ID, OP);
    const stayPut = { ...i, fire: { ...i.fire!, instruction: "stay_put" as const } };
    const gate = checkIncidentGate(stayPut, FIRE_POLICY, store.hazards.forIncident(ID), store.closures.forIncident(ID), new Date());
    expect(gate.ok).toBe(false);
    expect(gate.blocks.map((b) => b.ruleId)).toContain("R-03-MODE");
  });

  it("prepares valid, bilingual fire guidance with the fire floor and assembly point locked", async () => {
    await prepared();
    const g = store.guidance.forIncident(ID);
    expect(g.length).toBe(4 * 2 * 3);
    expect(g.every((x) => x.validationPassed)).toBe(true);
    const above = g.find((x) => x.actionId === "ACT-FIRE-ABOVE" && x.language === "en" && x.variant === "standard")!;
    expect(above.content.body).toContain(`floor ${FIRE_FLOOR}`);
    expect(above.content.body).toContain("Al Majaz Park, south lawn");
    expect(above.content.steps[0].text).toMatch(/Do not use lifts/);
    const smokeAr = g.find((x) => x.actionId === "ACT-FIRE-SMOKE" && x.language === "ar" && x.variant === "standard")!;
    expect(smokeAr.content.headline).toContain("البرج أ، المجاز");
  });
});

describe("fire replies and the who-is-inside board", () => {
  beforeEach(async () => {
    await runAgent(ID);
    approveAndSend(ID, OP);
    await fastForward();
  });

  it("makes a trapped resident P1 with their floor, whatever their words", async () => {
    const r = await submitResponse({ token: token("RES-014"), kind: "help", situation: "trapped", floor: 19, text: null });
    const c = store.cases.forIncident(ID).find((x) => x.id === r.caseId)!;
    expect(c.priority).toBe("P1");
    expect(c.situation).toBe("trapped");
    expect(c.floor).toBe(19);
    expect(c.summary).toMatch(/عالق — الطابق 19/);
  });

  it("keeps still-inside below the fire at P2, and raises it on or above the fire floor", async () => {
    const below = store.recipients.all().find((x) => x.building && x.building.floor! < FIRE_FLOOR && !x.vulnerability.length && !store.cases.openForRecipient(ID, x.id))!;
    const r1 = await submitResponse({ token: below.token, kind: "help", situation: "inside", text: null });
    expect(store.cases.forIncident(ID).find((x) => x.id === r1.caseId)!.priority).toBe("P2");
    const r2 = await submitResponse({ token: token("RES-014"), kind: "help", situation: "inside", text: null });
    expect(store.cases.forIncident(ID).find((x) => x.id === r2.caseId)!.priority).toBe("P1");
  });

  it("counts every resident exactly once on the board, floor by floor", () => {
    const b = getOpsState().fireBoard!;
    const t = b.totals;
    expect(t.residents).toBe(62);
    expect(t.out + t.inside + t.trapped + t.unaccounted + t.notReached).toBe(62);
    expect(t.trapped).toBe(4);
    expect(t.out).toBeGreaterThan(30);
    expect(b.rows.find((r) => r.fire)!.floor).toBe(FIRE_FLOOR);
    expect(b.rows.reduce((n, r) => n + r.people.length, 0)).toBe(62);
  });

  it("moves a person on the board when they report getting out", async () => {
    await submitResponse({ token: token("RES-014"), kind: "help", situation: "trapped", floor: 19, text: null });
    expect(getOpsState().fireBoard!.rows.flatMap((r) => r.people).find((p) => p.id === "RES-014")!.status).toBe("trapped");
    await submitResponse({ token: token("RES-014"), kind: "safe" });
    expect(getOpsState().fireBoard!.rows.flatMap((r) => r.people).find((p) => p.id === "RES-014")!.status).toBe("out");
  });

  it("gives the phone the building, floors and only fire questions", () => {
    const inbox = citizenInbox(token("RES-014"));
    const a = inbox.alerts[0];
    expect(a.fire).toMatchObject({ fireFloor: FIRE_FLOOR, yourFloor: 19, inBuilding: true });
    const ids = a.questions.map((q) => q.id);
    expect(ids).toContain("Q-FIRE-LIFT");
    expect(ids).not.toContain("Q-WATER-LEVEL");
  });
});

describe("switching drills", () => {
  it("goes back to the flood drill on request and stays there on a plain reset", () => {
    resetScenario("test", "rain");
    expect(getOpsState().incident.id).toBe("EVT-RAIN-001");
    resetScenario("test");
    const s = getOpsState();
    expect(s.scenario.kind).toBe("rain");
    expect(s.fireBoard).toBeNull();
    expect(store.recipients.all().some((r) => r.building)).toBe(false);
  });
});
