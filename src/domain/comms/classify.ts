import { APPROVED_ANSWERS, type ApprovedAnswer } from "@/scenario/policy";

/**
 * Deterministic, explainable classifiers used when no LLM provider is configured (and as the
 * guard-rail baseline when one is). They never invent content: they either select an approved
 * answer or escalate to a human.
 */

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[ً-ٰٟ]/g, "") // strip Arabic diacritics
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();

export interface ClarificationMatch {
  answerId: string | null;
  confidence: number;
  method: "predefined" | "keyword" | "llm";
  matchedTerms: string[];
}

/** Topics the system must never answer from inference — always escalated. */
const ESCALATE_TOPICS = [
  "shelter", "rescue", "boat", "ambulance", "injur", "hospital", "medicine", "school", "water level", "reach my", "electric shock", "trapped",
  "ايواء", "مركز ايواء", "انقاذ", "اسعاف", "مصاب", "اصابه", "مستشفي", "دواء", "مدرسه", "منسوب", "ستصل", "محاصر", "عالق",
];

export function matchClarification(text: string, actionId: string | null, predefinedId?: string | null): ClarificationMatch {
  const candidates = APPROVED_ANSWERS.filter((a) => !actionId || a.appliesTo.includes(actionId));
  if (predefinedId) {
    const hit = candidates.find((a) => a.id === predefinedId);
    return { answerId: hit ? hit.id : null, confidence: hit ? 1 : 0, method: "predefined", matchedTerms: [] };
  }
  const t = norm(text);
  if (!t) return { answerId: null, confidence: 0, method: "keyword", matchedTerms: [] };
  const escalate = ESCALATE_TOPICS.filter((k) => t.includes(norm(k)));
  if (escalate.length) return { answerId: null, confidence: 0, method: "keyword", matchedTerms: escalate };

  let best: { a: ApprovedAnswer; score: number; terms: string[] } | null = null;
  for (const a of candidates) {
    const terms = [...a.keywords.en, ...a.keywords.ar].filter((k) => t.includes(norm(k)));
    const score = terms.reduce((s, k) => s + (k.length >= 4 ? 2 : 1) + (k.includes(" ") ? 1 : 0), 0);
    if (score > 0 && (!best || score > best.score)) best = { a, score, terms };
  }
  if (!best || best.score < 2) return { answerId: null, confidence: best ? 0.3 : 0, method: "keyword", matchedTerms: best?.terms ?? [] };
  return { answerId: best.a.id, confidence: Math.min(0.95, 0.5 + best.score * 0.1), method: "keyword", matchedTerms: best.terms };
}

export interface ResponseClassification {
  category: "safe" | "needs_assistance" | "clarification" | "ambiguous";
  priority: "P1" | "P2" | null;
  needsHuman: boolean;
  confidence: number;
  method: "deterministic" | "llm";
  signals: string[];
}

const URGENT = [
  "trapped", "can't move", "cannot move", "wheelchair", "elderly", "child", "baby", "pregnant", "injur", "bleeding", "breath", "medical", "oxygen", "dialysis", "water is rising", "water entering", "water inside", "flooding inside",
  "محاصر", "عالق", "لا استطيع الحركه", "كرسي متحرك", "كبير السن", "مسن", "والدي", "والدتي", "طفل", "رضيع", "حامل", "مصاب", "نزيف", "تنفس", "اكسجين", "غسيل كلوي", "المياه ترتفع", "دخلت المياه", "المياه داخل",
];

/** Classifies a help request's free text into a review priority. Never decides a rescue action. */
export function classifyHelpText(text: string | null | undefined, vulnerability: string[] = []): ResponseClassification {
  const t = norm(text ?? "");
  const signals = URGENT.filter((k) => t.includes(norm(k)));
  const vulnerable = vulnerability.length > 0;
  const p1 = signals.length > 0 || vulnerable;
  return {
    category: "needs_assistance",
    priority: p1 ? "P1" : "P2",
    needsHuman: true,
    confidence: t ? 0.8 : 0.6,
    method: "deterministic",
    signals: [...signals, ...vulnerability.map((v) => `profile:${v}`)],
  };
}
