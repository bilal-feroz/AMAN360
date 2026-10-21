import { describe, expect, it } from "vitest";
import type { Lang, ActionVariant } from "@/domain/types";
import { checkBilingualConsistency, validateCandidate } from "@/domain/comms/validator";
import { renderApproved, formatUntil } from "@/domain/comms/facts";
import { classifyHelpText, matchClarification } from "@/domain/comms/classify";
import { APPROVED_ACTIONS, SAFETY_POLICY } from "@/scenario/policy";
import { CLOSURE_NAME, ZONE_NAME } from "@/scenario/scenario";

const facts = { zone: ZONE_NAME, closure: CLOSURE_NAME, validUntil: "2026-10-21T20:05:00+04:00" };
const variants: ActionVariant[] = ["standard", "plain", "audio"];
const langs: Lang[] = ["en", "ar"];

describe("approved bilingual guidance", () => {
  for (const action of APPROVED_ACTIONS) {
    for (const variant of variants) {
      it(`${action.id}/${variant}: Arabic and English carry the same action, steps and facts`, () => {
        const en = renderApproved(action, "en", variant, facts);
        const ar = renderApproved(action, "ar", variant, facts);
        const check = checkBilingualConsistency(
          { actionId: action.id, language: "en", variant, content: en },
          { actionId: action.id, language: "ar", variant, content: ar },
          action,
          facts,
        );
        expect(check.passed).toBe(true);
      });
      for (const language of langs) {
        it(`${action.id}/${language}/${variant}: approved wording passes its own validation`, () => {
          const content = renderApproved(action, language, variant, facts);
          const v = validateCandidate({ actionId: action.id, language, variant, content }, { action, language, variant, facts }, SAFETY_POLICY);
          expect(v.checks.filter((c) => !c.passed)).toEqual([]);
        });
      }
    }
  }

  it("formats validity times in both languages with western digits", () => {
    expect(formatUntil(facts.validUntil, "en")).toMatch(/20:05 UAE time/);
    expect(formatUntil(facts.validUntil, "ar")).toMatch(/20:05.*بتوقيت الإمارات/);
  });
});

describe("unsupported AI output is blocked", () => {
  const action = APPROVED_ACTIONS.find((a) => a.id === "ACT-INDOOR-01")!;
  const base = (language: Lang) => renderApproved(action, language, "plain", facts);
  const check = (language: Lang, mutate: (c: ReturnType<typeof base>) => ReturnType<typeof base>) =>
    validateCandidate({ actionId: action.id, language, variant: "plain", content: mutate(base(language)) }, { action, language, variant: "plain", facts }, SAFETY_POLICY);

  it.each([
    ["evacuation instruction", (c: ReturnType<typeof base>) => ({ ...c, body: c.body + " Evacuate the building now." })],
    ["dispatch claim", (c: ReturnType<typeof base>) => ({ ...c, body: c.body + " An ambulance is on its way." })],
    ["new phone number", (c: ReturnType<typeof base>) => ({ ...c, body: c.body + " Call 800 1234." })],
    ["changed validity time", (c: ReturnType<typeof base>) => ({ ...c, body: c.body.replace("20:05", "23:00") })],
    ["link", (c: ReturnType<typeof base>) => ({ ...c, body: c.body + " See https://example.com" })],
    ["extra step", (c: ReturnType<typeof base>) => ({ ...c, steps: [...c.steps, { id: "s6", text: "Go to the roof." }] })],
  ])("blocks English output with %s", (_name, mutate) => {
    expect(check("en", mutate).passed).toBe(false);
  });

  it("blocks Arabic output that invents an evacuation order", () => {
    expect(check("ar", (c) => ({ ...c, body: c.body + " يجب إخلاء المبنى فورًا." })).passed).toBe(false);
  });

  it("blocks Arabic output that claims help is on the way", () => {
    expect(check("ar", (c) => ({ ...c, body: c.body + " الإسعاف في الطريق إليك." })).passed).toBe(false);
  });

  it("blocks output in the wrong language", () => {
    const en = base("en");
    const v = validateCandidate({ actionId: action.id, language: "ar", variant: "plain", content: en }, { action, language: "ar", variant: "plain", facts }, SAFETY_POLICY);
    expect(v.passed).toBe(false);
  });
});

describe("deterministic classification", () => {
  it("answers approved questions and escalates unverifiable ones", () => {
    expect(matchClarification("Is it safe to drive to work?", "ACT-INDOOR-01").answerId).toBe("Q-DRIVE");
    expect(matchClarification("متى ينتهي التحذير؟", "ACT-INDOOR-01").answerId).toBe("Q-UNTIL");
    expect(matchClarification("Where is the nearest shelter?", "ACT-INDOOR-01").answerId).toBeNull();
    expect(matchClarification("هل ستصل المياه إلى مبنانا؟", "ACT-INDOOR-01").answerId).toBeNull();
  });

  it("never answers a question outside the action's approved set", () => {
    expect(matchClarification("Can I move my car from the underground parking?", "ACT-ROAD-02").answerId).not.toBe("Q-PARKING");
  });

  it("prioritises urgent or vulnerable help requests as P1", () => {
    expect(classifyHelpText("Water entering, my elderly mother cannot use the stairs").priority).toBe("P1");
    expect(classifyHelpText("والدي يحتاج إلى جهاز أكسجين").priority).toBe("P1");
    expect(classifyHelpText("Basement parking flooded").priority).toBe("P2");
    expect(classifyHelpText("", ["mobility"]).priority).toBe("P1");
  });
});
