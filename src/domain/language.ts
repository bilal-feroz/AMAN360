/**
 * Language identification for social posts. Platform tags are unreliable for short or romanised
 * text (English captions tagged "su" or "af", Malayalam speech tagged "ta"), so the script the
 * caption is written in wins whenever it is distinctive. Romanised Hindi/Urdu cannot be told apart
 * reliably by script, so it keeps the platform's tag or falls back to English.
 */

const SCRIPTS: [RegExp, string][] = [
  [/[ഀ-ൿ]/g, "ml"],
  [/[஀-௿]/g, "ta"],
  [/[ঀ-৿]/g, "bn"],
  [/[ऀ-ॿ]/g, "hi"],
  [/[਀-੿]/g, "pa"],
  [/[ఀ-౿]/g, "te"],
  [/[඀-෿]/g, "si"],
];

const URDU = /[ٹڈڑںےھ]/;
const PERSIAN = /[پچژگیک]/;
const ARABIC = /[؀-ۿ]/g;
const LATIN = /[A-Za-z]/g;
const KNOWN_LATIN = new Set(["en", "fil", "tl", "fr", "de", "es", "it", "id", "ms", "pt", "nl", "tr"]);
const ENGLISH_WORDS = /\b(the|and|in|of|is|at|on|rain|storm|hail|flood|today|with|for)\b/i;

export function detectLanguage(text: string, platform: string | null): string | null {
  const letters = text.replace(/[#@][\p{L}\p{N}_]+/gu, "");
  for (const [re, code] of SCRIPTS) if ((letters.match(re)?.length ?? 0) >= 4) return code;
  const arabic = letters.match(ARABIC)?.length ?? 0;
  const latin = letters.match(LATIN)?.length ?? 0;
  if (arabic >= 4 && arabic >= latin) {
    if (URDU.test(letters)) return "ur";
    // Persian letters also occur in Gulf Arabic words, so require several of them.
    if ((letters.match(new RegExp(PERSIAN.source, "g"))?.length ?? 0) >= 3) return "fa";
    return "ar";
  }
  if (latin >= 4) {
    if (platform && KNOWN_LATIN.has(platform)) return platform === "tl" ? "fil" : platform;
    if (platform === "hi" || platform === "ur") return platform; // romanised Hindi / Urdu
    return ENGLISH_WORDS.test(letters) ? "en" : platform;
  }
  return platform;
}

/** Speech tags are corrected when the caption script makes a near-neighbour language obvious. */
export function reconcileSpeech(caption: string | null, speech: string | null): string | null {
  if (caption === "ml" && speech === "ta") return "ml";
  if (speech === "tl") return "fil";
  return speech;
}

export const LANGUAGE_NAMES: Record<string, { en: string; native: string }> = {
  ar: { en: "Arabic", native: "العربية" },
  en: { en: "English", native: "English" },
  hi: { en: "Hindi", native: "हिन्दी" },
  ur: { en: "Urdu", native: "اردو" },
  ml: { en: "Malayalam", native: "മലയാളം" },
  ta: { en: "Tamil", native: "தமிழ்" },
  bn: { en: "Bengali", native: "বাংলা" },
  fil: { en: "Tagalog", native: "Tagalog" },
  tl: { en: "Tagalog", native: "Tagalog" },
  fa: { en: "Persian", native: "فارسی" },
  ne: { en: "Nepali", native: "नेपाली" },
  pa: { en: "Punjabi", native: "ਪੰਜਾਬੀ" },
  te: { en: "Telugu", native: "తెలుగు" },
  si: { en: "Sinhala", native: "සිංහල" },
  fr: { en: "French", native: "Français" },
};
