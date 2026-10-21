import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ActionTemplate } from "@/domain/types";

process.env.AMAN_DATA_DIR = mkdtempSync(path.join(tmpdir(), "aman-llm-"));
delete process.env.ANTHROPIC_API_KEY;

const { useMemoryDb } = await import("@/server/db");
const { resetScenario } = await import("@/server/services/reset");
const wf = await import("@/server/services/workflow");
const { setProviderForTests } = await import("@/server/comms/providers");
const { submitResponse } = await import("@/server/services/citizen");
const store = await import("@/server/store");

const ID = "EVT-RAIN-001";

/** A fake LLM that either behaves (simplifies without changing meaning) or misbehaves. */
function fakeProvider(mode: "good" | "unsafe" | "throws") {
  return {
    id: "anthropic" as const,
    label: "Fake LLM (test)",
    model: "fake-model",
    async rewriteVariant(req: { approvedStandard: ActionTemplate; variant: string }) {
      if (mode === "throws") throw new Error("network down");
      const c = structuredClone(req.approvedStandard);
      if (mode === "unsafe") {
        c.body += " Evacuate now and take King Faisal Street instead — an ambulance is on its way.";
        return c;
      }
      // "Simplify" by trimming trailing politeness only — facts and steps untouched.
      c.headline = c.headline.replace(" — stay indoors", "").replace("— يُرجى البقاء في الداخل", "— ابقَ في الداخل");
      return c;
    },
    async selectAnswer() {
      return { answerId: "Q-UNTIL", confidence: 0.9 };
    },
  };
}

async function prepare() {
  resetScenario("test");
  wf.verifySource(ID, "OP-ALYA");
  wf.assessImpact(ID, "OP-ALYA");
  return wf.prepareGuidance(ID, "OP-ALYA");
}

beforeAll(() => useMemoryDb());
beforeEach(() => setProviderForTests(null));
afterAll(() => setProviderForTests(null));

describe("LLM communication pipeline (fake provider, no network)", () => {
  it("never lets the LLM write the standard instruction", async () => {
    setProviderForTests(fakeProvider("good") as never);
    const drafts = await prepare();
    expect(drafts.filter((d) => d.variant === "standard").every((d) => d.mode === "template")).toBe(true);
  });

  it("accepts a well-behaved simplification as LLM output once it passes validation", async () => {
    setProviderForTests(fakeProvider("good") as never);
    const drafts = await prepare();
    const llm = drafts.filter((d) => d.mode === "llm");
    expect(llm.length).toBeGreaterThan(0);
    expect(llm.every((d) => d.validationPassed && !d.fallbackUsed)).toBe(true);
  });

  it("blocks unsafe LLM output and falls back to the approved template", async () => {
    setProviderForTests(fakeProvider("unsafe") as never);
    const drafts = await prepare();
    const nonStandard = drafts.filter((d) => d.variant !== "standard");
    expect(nonStandard.every((d) => d.mode === "template" && d.fallbackUsed)).toBe(true);
    expect(drafts.every((d) => d.validationPassed)).toBe(true);
    expect(drafts.some((d) => /Evacuate|ambulance/i.test(JSON.stringify(d.content)))).toBe(false);
    expect(store.auditLog.recent(500).some((e) => e.type === "guidance.blocked")).toBe(true);
  });

  it("keeps working when the provider is down (fail-safe to templates)", async () => {
    setProviderForTests(fakeProvider("throws") as never);
    const drafts = await prepare();
    expect(drafts.every((d) => d.mode === "template" && d.validationPassed)).toBe(true);
    wf.approveGuidance(ID, "OP-ALYA");
    expect(wf.publish(ID, "OP-ALYA").queued).toBe(120);
  });

  it("LLM may only route a question to an approved answer, never write one", async () => {
    setProviderForTests(fakeProvider("good") as never);
    await prepare();
    wf.approveGuidance(ID, "OP-ALYA");
    wf.publish(ID, "OP-ALYA");
    const { processDue } = await import("@/server/services/sim");
    await processDue(Date.now() + 10_000);
    const r = await submitResponse({ token: store.recipients.get("RES-014")!.token, kind: "clarify", text: "something unusual about the timing" });
    expect(r.answer?.id).toBe("Q-UNTIL");
    expect(r.answer?.text).toMatch(/بتوقيت الإمارات/); // approved Arabic answer with locked facts
  });
});
