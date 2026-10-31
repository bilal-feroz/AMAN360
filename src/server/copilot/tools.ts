import "server-only";
import { z } from "zod";
import type { ComponentKind } from "@/domain/copilot";
import { NEEDS } from "./resolve";

/**
 * The copilot's only tools are *display* tools. Each one asks the server to render a card from
 * stored records; none of them changes state. Actions the model suggests come back as buttons that
 * a human must click, and are gated against the live workflow first.
 */

export const OVERVIEW_ROWS = ["verification", "matching", "closure", "rules", "guidance", "approval", "delivery", "responses", "followup"] as const;
export const ACTION_KINDS = [
  "activate_incident",
  "prepare_guidance",
  "approve_guidance",
  "issue_alerts",
  "open_case",
  "open_recipient",
  "open_guidance",
  "open_responses",
  "fly_zone",
  "fly_closure",
  "open_signals",
  "open_replay",
] as const;

export const schemas = {
  show_incident_overview: z.object({
    headline: z.string().transform((s) => s.slice(0, 160)),
    emphasis: z.array(z.enum(OVERVIEW_ROWS)).max(4),
  }),
  show_priority_cases: z.object({
    cases: z
      .array(z.object({ case_id: z.string(), need: z.enum(NEEDS), summary: z.string().transform((s) => s.slice(0, 160)) }))
      .min(1)
      .max(6),
  }),
  show_decision_trace: z.object({
    recipient_id: z.string(),
    explanation: z.string().transform((s) => s.slice(0, 400)),
  }),
  show_guidance: z.object({
    action_id: z.enum(["ACT-INDOOR-01", "ACT-ROAD-02"]),
    variant: z.enum(["standard", "plain", "audio"]),
  }),
  show_safety_checks: z.object({}),
  show_social_signals: z.object({
    dataset: z.enum(["scenario", "replay"]),
    headline: z.string().transform((s) => s.slice(0, 160)),
  }),
  suggest_actions: z.object({
    actions: z
      .array(z.object({ kind: z.enum(ACTION_KINDS), target: z.string(), label: z.string().transform((s) => s.slice(0, 40)) }))
      .min(1)
      .max(3),
  }),
} as const;

export type ToolName = keyof typeof schemas;

export const TOOL_KIND: Record<ToolName, ComponentKind> = {
  show_incident_overview: "overview",
  show_priority_cases: "cases",
  show_decision_trace: "trace",
  show_guidance: "guidance",
  show_safety_checks: "checks",
  show_social_signals: "signals",
  suggest_actions: "actions",
};

export const TOOL_LABEL: Record<ToolName, { en: string; ar: string }> = {
  show_incident_overview: { en: "Incident overview", ar: "نظرة عامة على الحادثة" },
  show_priority_cases: { en: "Priority cases", ar: "الحالات ذات الأولوية" },
  show_decision_trace: { en: "Decision trace", ar: "مسار القرار" },
  show_guidance: { en: "Approved guidance", ar: "الإرشادات المعتمدة" },
  show_safety_checks: { en: "Safety checks", ar: "فحوص السلامة" },
  show_social_signals: { en: "Social signals (unverified)", ar: "رصد التواصل (غير متحقق)" },
  suggest_actions: { en: "Suggested next steps", ar: "الخطوات التالية المقترحة" },
};

const str = (description: string) => ({ type: "string", description });
const obj = (properties: Record<string, unknown>, description?: string) => ({
  type: "object",
  ...(description ? { description } : {}),
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

/** JSON Schemas sent to the API (strict). Lengths and counts are enforced by the zod schemas above. */
export const TOOLS = [
  {
    name: "show_incident_overview",
    description:
      "Render the live incident card: every pipeline stage from verified source to human follow-up, with real timestamps, counts and safety checks. Use for briefings and status questions.",
    input_schema: obj({
      headline: str("One plain sentence (max ~20 words) stating where things stand. Only use numbers present in the snapshot."),
      emphasis: { type: "array", description: "Up to 4 stage ids to highlight.", items: { type: "string", enum: [...OVERVIEW_ROWS] } },
    }),
  },
  {
    name: "show_priority_cases",
    description:
      "Render the human follow-up queue in the order you recommend. Only list case ids that exist in the snapshot. Summaries describe the person's stated need neutrally; never promise or describe a response.",
    input_schema: obj({
      cases: {
        type: "array",
        description: "1–6 cases, most urgent first.",
        items: obj({
          case_id: str("A case id from the snapshot, e.g. CASE-001."),
          need: { type: "string", enum: [...NEEDS], description: "Main need category." },
          summary: str("Max ~18 words, neutral, no advice, no promises of help."),
        }),
      },
    }),
  },
  {
    name: "show_decision_trace",
    description:
      "Render the full decision chain for one recipient: verified event → geographic match → approved rule → message → response → follow-up. Use for any 'why did X get / not get this' question.",
    input_schema: obj({
      recipient_id: str("A recipient id from the snapshot, e.g. RES-014."),
      explanation: str("Two short sentences explaining the chain in plain words, citing the rule id. No new facts."),
    }),
  },
  {
    name: "show_guidance",
    description: "Render the approved Arabic and English wording side by side, with the locked facts. Read-only.",
    input_schema: obj({
      action_id: { type: "string", enum: ["ACT-INDOOR-01", "ACT-ROAD-02"] },
      variant: { type: "string", enum: ["standard", "plain", "audio"] },
    }),
  },
  {
    name: "show_safety_checks",
    description: "Re-run the deterministic safety checks now (source, safety gate, message validator, bilingual consistency, locked facts) and render the results.",
    input_schema: obj({}),
  },
  {
    name: "show_social_signals",
    description:
      "Render what public social-media posts and videos say, as read by the AI: hotspots (grouped by place, with independent-source counts and verification status), rumours and public questions. dataset \"scenario\" = synthetic posts in the training scenario; \"replay\" = REAL public posts about the 12–20 October 2026 storm in the Emirate of Sharjah. Everything here is unverified and can only lead to a verification request.",
    input_schema: obj({
      dataset: { type: "string", enum: ["scenario", "replay"] },
      headline: str("One plain sentence (max ~20 words) on what the signals show. Call them unverified. Only use numbers from the snapshot."),
    }),
  },
  {
    name: "suggest_actions",
    description:
      "Offer up to 3 buttons the operator may click. You cannot perform them. Workflow steps are disabled automatically when not allowed in the current state.",
    input_schema: obj({
      actions: {
        type: "array",
        items: obj({
          kind: { type: "string", enum: [...ACTION_KINDS] },
          target: str("Case id for open_case, recipient id for open_recipient, otherwise empty string."),
          label: str("Button text, 1–4 words."),
        }),
      },
    }),
  },
].map((t) => ({ ...t, strict: true, eager_input_streaming: true }));
