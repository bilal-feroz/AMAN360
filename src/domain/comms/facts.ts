import type { ActionTemplate, ActionVariant, ApprovedAction, Bilingual, Lang } from "../types";

export interface MessageFacts {
  zone: Bilingual;
  closure: Bilingual;
  validUntil: string; // ISO
}

const TZ = "Asia/Dubai";

/** Human-readable validity time. Western digits are used in both languages (standard UAE usage). */
export function formatUntil(iso: string, lang: Lang): string {
  const d = new Date(iso);
  if (lang === "ar") {
    const s = new Intl.DateTimeFormat("ar-AE-u-nu-latn", {
      timeZone: TZ,
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
    return `${s} بتوقيت الإمارات`;
  }
  const s = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return `${s} UAE time`;
}

export function factValues(facts: MessageFacts, lang: Lang): Record<string, string> {
  return {
    "{{zone}}": facts.zone[lang],
    "{{closure}}": facts.closure[lang],
    "{{until}}": formatUntil(facts.validUntil, lang),
  };
}

function fill(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{(zone|closure|until)\}\}/g, (m) => values[m] ?? m);
}

export function renderApproved(action: ApprovedAction, lang: Lang, variant: ActionVariant, facts: MessageFacts): ActionTemplate {
  const t = action.templates[lang][variant];
  const v = factValues(facts, lang);
  return {
    headline: fill(t.headline, v),
    body: fill(t.body, v),
    steps: t.steps.map((s) => ({ id: s.id, text: fill(s.text, v) })),
  };
}

export function lockedFactValues(action: ApprovedAction, lang: Lang, facts: MessageFacts): string[] {
  const v = factValues(facts, lang);
  return action.lockedFacts.map((k) => v[k]).filter(Boolean);
}

export function fillText(text: string, lang: Lang, facts: MessageFacts): string {
  return fill(text, factValues(facts, lang));
}

export function flatten(t: ActionTemplate): string {
  return [t.headline, t.body, ...t.steps.map((s) => s.text)].join("\n");
}
