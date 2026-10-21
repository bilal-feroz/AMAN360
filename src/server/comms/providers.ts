import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { ActionTemplate, ActionVariant, Lang } from "@/domain/types";
import { APPROVED_ANSWERS } from "@/scenario/policy";

/**
 * Communication providers. The provider only ever receives *approved wording* and returns a
 * candidate that is then validated deterministically (src/domain/comms/validator.ts). The
 * standard-variant instruction is never machine-written: LLMs are limited to simplification /
 * accessible reformatting and to selecting among approved clarification answers.
 */

export interface LocalizeRequest {
  actionId: string;
  language: Lang;
  variant: ActionVariant;
  approvedStandard: ActionTemplate;
  lockedFacts: string[];
}

export interface CommunicationProvider {
  id: "template" | "anthropic";
  label: string;
  model: string | null;
  /** Produce a candidate for a non-standard variant. Template provider returns null (use approved template). */
  rewriteVariant(req: LocalizeRequest): Promise<ActionTemplate | null>;
  /** Pick an approved clarification answer id, or null to escalate. */
  selectAnswer(question: string, allowedIds: string[], language: Lang): Promise<{ answerId: string | null; confidence: number } | null>;
}

export const templateProvider: CommunicationProvider = {
  id: "template",
  label: "Approved bilingual template library (deterministic)",
  model: null,
  async rewriteVariant() {
    return null;
  },
  async selectAnswer() {
    return null;
  },
};

const RewriteSchema = z.object({
  headline: z.string(),
  body: z.string(),
  steps: z.array(z.object({ id: z.string(), text: z.string() })),
});

const AnswerSchema = z.object({
  answer_id: z.string().nullable(),
  confidence: z.number(),
});

const SYSTEM = `You are the bounded communication layer of AMAN 360, an emergency communication prototype running a TRAINING SCENARIO with synthetic data.
Authority-approved safety decisions are final. Your only job is to make approved wording easier to understand.
Rules you must follow:
- Keep exactly the same steps, with the same step ids, in the same order. Do not add or remove steps.
- Copy every locked fact verbatim (place names, road names, times). Do not add new numbers, times, phone numbers or links.
- Never add evacuation instructions, alternative routes or detours, severity changes, medical or rescue advice, or any claim that police, ambulance, civil defence or responders are on their way.
- Write in the requested language only. Arabic must be clear Modern Standard Arabic.`;

function variantInstruction(variant: ActionVariant, language: Lang): string {
  if (variant === "plain") {
    return language === "ar"
      ? "Rewrite as a plain-language variant: very short sentences (ideally under 10 words), common everyday words, one idea per step."
      : "Rewrite as a plain-language variant: very short sentences (ideally under 10 words), common everyday words, one idea per step.";
  }
  return "Rewrite for text-to-speech and screen readers: full sentences, no symbols or quotation marks, start each step with its spoken step number (Step one / الخطوة الأولى).";
}

export function createAnthropicProvider(apiKey: string, model: string): CommunicationProvider {
  const client = new Anthropic({ apiKey, timeout: 20_000, maxRetries: 1 });
  return {
    id: "anthropic",
    label: "Anthropic Claude (bounded rewrite + validated)",
    model,
    async rewriteVariant(req) {
      const response = await client.beta.messages.parse({
        model,
        max_tokens: 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: betaZodOutputFormat(RewriteSchema) },
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: JSON.stringify({
              task: variantInstruction(req.variant, req.language),
              language: req.language,
              approved_action_id: req.actionId,
              locked_facts: req.lockedFacts,
              approved_wording: req.approvedStandard,
            }),
          },
        ],
      });
      if (response.stop_reason === "refusal" || !response.parsed_output) return null;
      return response.parsed_output;
    },
    async selectAnswer(question, allowedIds, language) {
      const answers = APPROVED_ANSWERS.filter((a) => allowedIds.includes(a.id)).map((a) => ({
        id: a.id,
        question: a.question[language],
      }));
      const response = await client.beta.messages.parse({
        model,
        max_tokens: 1000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: betaZodOutputFormat(AnswerSchema) },
        system:
          "You route a citizen's question to one pre-approved answer. Return answer_id only if that approved answer fully and directly answers the question; otherwise return null so a human reviews it. Never write an answer yourself.",
        messages: [{ role: "user", content: JSON.stringify({ question, approved_answers: answers }) }],
      });
      if (response.stop_reason === "refusal" || !response.parsed_output) return null;
      const id = response.parsed_output.answer_id;
      return { answerId: id && allowedIds.includes(id) ? id : null, confidence: response.parsed_output.confidence };
    },
  };
}

let cached: CommunicationProvider | null = null;

export function getProvider(): CommunicationProvider {
  if (cached) return cached;
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  cached = key ? createAnthropicProvider(key, process.env.AMAN_LLM_MODEL?.trim() || "claude-opus-5-5") : templateProvider;
  return cached;
}

export function providerStatus() {
  const p = getProvider();
  return { id: p.id, label: p.label, model: p.model, llmConfigured: p.id !== "template" };
}
