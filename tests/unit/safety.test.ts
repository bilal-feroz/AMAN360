import { describe, expect, it } from "vitest";
import type { Incident, Recipient, SafetyPolicy } from "@/domain/types";
import { assess, checkIncidentGate, decide, selectVariant } from "@/domain/safety-engine";
import { validateCandidate } from "@/domain/comms/validator";
import { renderApproved } from "@/domain/comms/facts";
import { actionById, SAFETY_POLICY } from "@/scenario/policy";
import { buildClosures, buildHazardGeometry, buildIncident, CLOSURE_NAME, ZONE_NAME } from "@/scenario/scenario";
import population from "@/scenario/population.json";

const NOW = new Date("2026-10-21T10:00:00+04:00");
const verified = (): Incident => {
  const i = buildIncident(NOW);
  return { ...i, verification: { ...i.verification, status: "verified", signatureValid: true } };
};
const people = (population as { recipients: Omit<Recipient, "token">[] }).recipients.map((r) => ({ ...r, token: "t" })) as Recipient[];
const byId = (id: string) => people.find((p) => p.id === id)!;
const ctx = (over: Partial<{ incident: Incident; policy: SafetyPolicy }> = {}) => ({
  incident: verified(),
  policy: SAFETY_POLICY,
  hazard: buildHazardGeometry(),
  closures: buildClosures(),
  now: NOW,
  ...over,
});
const facts = { zone: ZONE_NAME, closure: CLOSURE_NAME, validUntil: verified().validUntil };

describe("deterministic safety decisions", () => {
  it("resident inside the verified zone receives ACT-INDOOR-01", () => {
    const t = decide(byId("RES-014"), ctx());
    expect(t.ruleId).toBe("R-20-ZONE");
    expect(t.outcome).toBe("SEND");
    expect(t.actionId).toBe("ACT-INDOOR-01");
    expect(t.language).toBe("ar");
  });

  it("driver approaching a confirmed closure receives closure-aware ACT-ROAD-02 with no route", () => {
    const t = decide(byId("RES-047"), ctx());
    expect(t.ruleId).toBe("R-30-CLOSURE");
    expect(t.actionId).toBe("ACT-ROAD-02");
    expect(t.reasons.join(" ")).toMatch(/No approved diversion/);
  });

  it("citizen outside the zone receives no emergency instruction", () => {
    const t = decide(byId("RES-131"), ctx());
    expect(t.outcome).toBe("NO_ACTION");
    expect(t.actionId).toBeNull();
  });

  it("missing location triggers operator review rather than inference", () => {
    const missing = people.find((p) => p.locationStatus === "missing")!;
    const t = decide(missing, ctx());
    expect(t.outcome).toBe("REVIEW");
    expect(t.ruleId).toBe("R-10-NOLOC");
  });

  it("produces exactly the documented population split", () => {
    const { summary } = assess(people, ctx());
    expect(summary.send).toBe(120);
    expect(summary.insideZone).toBe(106);
    expect(summary.approachingClosure).toBe(14);
    expect(summary.review).toBe(4);
    expect(summary.outside).toBe(32);
  });

  it("selects accessible variants from the recipient profile", () => {
    expect(selectVariant(byId("RES-022"))).toBe("plain");
    expect(selectVariant({ accessibility: { plainLanguage: false, largeText: false, screenReader: true, audio: false, highContrast: false } })).toBe("audio");
  });

  it("is deterministic: same inputs give identical traces", () => {
    const a = decide(byId("RES-014"), ctx());
    const b = decide(byId("RES-014"), ctx());
    expect(a).toEqual(b);
  });
});

describe("publication gate (fail-closed)", () => {
  it("missing verified source prevents publication", () => {
    const g = checkIncidentGate(buildIncident(NOW), SAFETY_POLICY, buildHazardGeometry(), buildClosures(), NOW);
    expect(g.ok).toBe(false);
    expect(g.blocks[0].ruleId).toBe("R-00-VERIFY");
    const t = decide(byId("RES-014"), ctx({ incident: buildIncident(NOW) }));
    expect(t.outcome).toBe("BLOCK");
    expect(t.actionId).toBeNull();
  });

  it("an expired policy is rejected", () => {
    const expired = { ...SAFETY_POLICY, expiresAt: "2026-06-30T00:00:00+04:00" };
    const g = checkIncidentGate(verified(), expired, buildHazardGeometry(), buildClosures(), NOW);
    expect(g.ok).toBe(false);
    expect(g.blocks.some((b) => b.ruleId === "R-02-EXPIRED")).toBe(true);
  });

  it("an expired incident cannot be silently reused", () => {
    const inc = { ...verified(), validUntil: "2026-10-21T09:00:00+04:00" };
    const g = checkIncidentGate(inc, SAFETY_POLICY, buildHazardGeometry(), buildClosures(), NOW);
    expect(g.ok).toBe(false);
    expect(g.blocks.map((b) => b.ruleId)).toContain("R-02-EXPIRED");
  });

  it("conflicting critical information requires review and blocks publication", () => {
    const inc = { ...verified(), conflicts: ["severity mismatch"] };
    const g = checkIncidentGate(inc, SAFETY_POLICY, buildHazardGeometry(), buildClosures(), NOW);
    expect(g.ok).toBe(false);
    expect(g.blocks[0].ruleId).toBe("R-01-CONFLICT");
  });

  it("a diversion without an approval record blocks publication", () => {
    const closures = buildClosures();
    closures[0].approvedDiversions = [{ id: "DIV-1", text: { en: "Use King Faisal St", ar: "استخدم شارع الملك فيصل" }, approvedBy: "" }];
    const g = checkIncidentGate(verified(), SAFETY_POLICY, buildHazardGeometry(), closures, NOW);
    expect(g.ok).toBe(false);
  });

  it("invalid hazard geometry blocks publication", () => {
    const hz = buildHazardGeometry();
    hz.geometry = { type: "Polygon", coordinates: [[[55.38, 25.32], [55.39, 25.32], [55.39, 25.33]]] };
    const g = checkIncidentGate(verified(), SAFETY_POLICY, hz, buildClosures(), NOW);
    expect(g.ok).toBe(false);
  });
});

describe("AI cannot modify the safety decision", () => {
  const action = actionById("ACT-ROAD-02")!;
  const approved = renderApproved(action, "en", "standard", facts);
  const expected = { action, language: "en" as const, variant: "standard" as const, facts };

  it("approved template passes every check", () => {
    const v = validateCandidate({ actionId: action.id, language: "en", variant: "standard", content: approved }, expected, SAFETY_POLICY);
    expect(v.passed).toBe(true);
  });

  it("a candidate claiming a different action identity is blocked", () => {
    const v = validateCandidate({ actionId: "ACT-INDOOR-01", language: "en", variant: "standard", content: approved }, expected, SAFETY_POLICY);
    expect(v.passed).toBe(false);
    expect(v.checks.find((c) => c.id === "action-identity")!.passed).toBe(false);
  });

  it("an unapproved alternative route cannot be published", () => {
    const content = { ...approved, body: approved.body + " Take King Faisal Street instead." };
    const v = validateCandidate({ actionId: action.id, language: "en", variant: "standard", content }, expected, SAFETY_POLICY);
    expect(v.passed).toBe(false);
    expect(v.checks.find((c) => c.id === "forbidden-claims")!.detail).toMatch(/route/i);
  });

  it("removing a step is blocked", () => {
    const content = { ...approved, steps: approved.steps.slice(1) };
    const v = validateCandidate({ actionId: action.id, language: "en", variant: "standard", content }, expected, SAFETY_POLICY);
    expect(v.passed).toBe(false);
  });
});
