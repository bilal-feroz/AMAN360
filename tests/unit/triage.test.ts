import { beforeEach, describe, expect, it } from "vitest";
import { useMemoryDb } from "@/server/db";
import { resetScenario } from "@/server/services/reset";
import * as wf from "@/server/services/workflow";
import { submitResponse } from "@/server/services/citizen";
import { fastForward, processDue } from "@/server/services/sim";
import { combine, triageKey } from "@/server/services/triage";
import * as store from "@/server/store";

const ID = "EVT-RAIN-001";

describe("triage combination rule", () => {
  const raw = (urgency: "P1" | "P2") => ({ needs: ["mobility" as const], urgency, summary_en: "s", summary_ar: "س", reasons: ["r"], language: "English", confidence: 0.9 });

  it("the model can raise a case to P1", () => {
    const t = combine("P2", raw("P1"), { model: "m", cached: false, ms: 1 }, [], []);
    expect(t.finalPriority).toBe("P1");
    expect(t.raised).toBe(true);
  });

  it("the model can never lower a P1 set by the deterministic rule", () => {
    const t = combine("P1", raw("P2"), { model: "m", cached: false, ms: 1 }, [], ["elderly"]);
    expect(t.finalPriority).toBe("P1");
    expect(t.raised).toBe(false);
  });

  it("without a model the rule result stands and is labelled as rules", () => {
    const t = combine("P2", null, { model: null, cached: false, ms: 0 }, ["child"], []);
    expect(t.method).toBe("rules");
    expect(t.finalPriority).toBe("P2");
    expect(t.needs).toContain("child");
  });

  it("cache keys depend on text and recorded needs, not their order", () => {
    expect(triageKey("x", ["a", "b"])).toBe(triageKey("x", ["b", "a"]));
    expect(triageKey("x", [])).not.toBe(triageKey("y", []));
  });
});

describe("case triage in the workflow", () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    useMemoryDb();
    resetScenario("test");
    wf.verifySource(ID, "test");
    wf.assessImpact(ID, "test");
  });

  it("every opened case is triaged right after it opens, and recorded readings are reused", async () => {
    await wf.prepareGuidance(ID, "test");
    wf.approveGuidance(ID, "test");
    wf.publish(ID, "test");
    await fastForward();
    const tok = store.recipients.get("RES-014")!.token;
    await submitResponse({ token: tok, kind: "help", text: "المياه دخلت إلى الطابق الأرضي، ووالدي كبير في السن ولا يستطيع صعود الدرج." });
    await processDue(Date.now() + 1000);
    const cases = store.cases.forIncident(ID);
    expect(cases.length).toBeGreaterThan(0);
    for (const c of cases) expect(c.triage, c.id).toBeTruthy();
    const mariam = cases.find((c) => c.recipientId === "RES-014")!;
    expect(mariam.priority).toBe("P1");
    expect(mariam.triage!.needs).toEqual(expect.arrayContaining(["elderly"]));
  });
});
