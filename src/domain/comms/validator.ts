import type { ActionTemplate, ActionVariant, ApprovedAction, Lang, SafetyPolicy, ValidationCheck } from "../types";
import { GLOBAL_FORBIDDEN_CLAIMS } from "@/scenario/policy";
import { flatten, lockedFactValues, renderApproved, type MessageFacts } from "./facts";

/**
 * Deterministic safety validation for any localized candidate (template-selected or LLM-generated).
 * A candidate that fails any check is blocked and the approved template is used instead.
 */

export interface Candidate {
  actionId: string;
  language: Lang;
  variant: ActionVariant;
  content: ActionTemplate;
}

const ARABIC = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/g;
const LATIN = /[A-Za-z]/g;

function digitsIn(text: string): string[] {
  return (text.match(/\d+/g) ?? []).map((d) => d.replace(/^0+(?=\d)/, ""));
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

export function validateCandidate(
  candidate: Candidate,
  expected: { action: ApprovedAction; language: Lang; variant: ActionVariant; facts: MessageFacts },
  policy: SafetyPolicy,
): { passed: boolean; checks: ValidationCheck[] } {
  const { action, language, variant, facts } = expected;
  const approved = renderApproved(action, language, variant, facts);
  const text = flatten(candidate.content);
  const approvedText = flatten(approved);
  const checks: ValidationCheck[] = [];

  checks.push({
    id: "action-identity",
    label: "Approved action unchanged",
    passed: candidate.actionId === action.id && candidate.language === language && candidate.variant === variant,
    detail: `expected ${action.id}/${language}/${variant}, got ${candidate.actionId}/${candidate.language}/${candidate.variant}`,
  });

  const expectedSteps = approved.steps.map((s) => s.id).join(",");
  const gotSteps = candidate.content.steps.map((s) => s.id).join(",");
  checks.push({
    id: "step-coverage",
    label: "Every approved step present, none added",
    passed: expectedSteps === gotSteps && candidate.content.steps.every((s) => s.text.trim().length > 0),
    detail: `approved [${expectedSteps}] vs candidate [${gotSteps}]`,
  });

  const missing = lockedFactValues(action, language, facts).filter((f) => !text.includes(f));
  checks.push({
    id: "locked-facts",
    label: "Locked facts preserved verbatim",
    passed: missing.length === 0,
    detail: missing.length ? `missing: ${missing.join(" | ")}` : "zone/closure and validity time intact",
  });

  const hits = GLOBAL_FORBIDDEN_CLAIMS.filter((c) => c.pattern.test(text) && !c.pattern.test(approvedText));
  checks.push({
    id: "forbidden-claims",
    label: "No invented evacuation, dispatch, route, severity or medical claims",
    passed: hits.length === 0,
    detail: hits.length ? hits.map((h) => h.label).join(", ") : "none detected",
  });

  const termHits = action.forbiddenTerms.filter((t) => {
    const re = new RegExp(`(^|[^\\p{L}])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}]|$)`, "iu");
    return re.test(text) && !re.test(approvedText);
  });
  checks.push({
    id: "action-terms",
    label: "No wording from a different action",
    passed: termHits.length === 0,
    detail: termHits.length ? termHits.join(", ") : "none",
  });

  const allowedNumbers = new Set([...digitsIn(approvedText), ...policy.approvedContacts.map((c) => c.number)]);
  const newNumbers = digitsIn(text).filter((d) => !allowedNumbers.has(d));
  checks.push({
    id: "numbers",
    label: "No new numbers, times or phone numbers",
    passed: newNumbers.length === 0,
    detail: newNumbers.length ? `unapproved: ${newNumbers.join(", ")}` : "all numbers come from approved facts",
  });

  const letters = (text.match(ARABIC)?.length ?? 0) + (text.match(LATIN)?.length ?? 0);
  const ratio = letters ? (language === "ar" ? text.match(ARABIC)?.length ?? 0 : text.match(LATIN)?.length ?? 0) / letters : 0;
  checks.push({
    id: "script",
    label: language === "ar" ? "Arabic script output" : "English output",
    passed: ratio >= (language === "ar" ? 0.8 : 0.9),
    detail: `${Math.round(ratio * 100)}% ${language === "ar" ? "Arabic" : "Latin"} letters`,
  });

  const tooLong = text.length > approvedText.length * 1.6 + 40;
  const longSentence =
    variant === "plain" && candidate.content.steps.some((s) => wordCount(s.text) > Math.max(16, ...approved.steps.map((a) => wordCount(a.text))));
  checks.push({
    id: "length",
    label: variant === "plain" ? "Plain-language length limits" : "Length within bounds",
    passed: !tooLong && !longSentence,
    detail: `${text.length} chars vs approved ${approvedText.length}`,
  });

  return { passed: checks.every((c) => c.passed), checks };
}

/**
 * Bilingual consistency: the English and Arabic messages for the same recipient circumstances
 * must carry the same action, the same step identifiers and the same locked facts.
 */
export function checkBilingualConsistency(
  en: Candidate,
  ar: Candidate,
  action: ApprovedAction,
  facts: MessageFacts,
): ValidationCheck {
  const sameAction = en.actionId === ar.actionId && en.actionId === action.id;
  const sameSteps = en.content.steps.map((s) => s.id).join() === ar.content.steps.map((s) => s.id).join();
  const enFacts = lockedFactValues(action, "en", facts).every((f) => flatten(en.content).includes(f));
  const arFacts = lockedFactValues(action, "ar", facts).every((f) => flatten(ar.content).includes(f));
  return {
    id: "bilingual-consistency",
    label: "Arabic and English carry the same action, steps and facts",
    passed: sameAction && sameSteps && enFacts && arFacts,
    detail: `action ${sameAction ? "match" : "MISMATCH"} · steps ${sameSteps ? "match" : "MISMATCH"} · facts EN ${enFacts ? "ok" : "missing"} / AR ${arFacts ? "ok" : "missing"}`,
  };
}
