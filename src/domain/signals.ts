import { z } from "zod";
import type { Bilingual } from "./types";

/**
 * Social signals: public posts and videos turned into *unverified* situational awareness.
 *
 * The boundary is the same as for alerts: a language model reads each post and fills a fixed form
 * (category, places named, what is visible, rumour or not). Everything after that is deterministic
 * and lives here — place names are matched against an OpenStreetMap gazetteer (a model never
 * produces coordinates), nearby reports are grouped into hotspots, and identical claims into
 * rumours. Nothing in this module can issue an alert: hotspots only ever become requests for
 * verification by a human operator.
 */

export type SignalDataset = "scenario" | "replay";
export type Platform = "instagram" | "tiktok" | "youtube" | "x" | "news";

export interface SignalFrame {
  /** Local, cached path (works offline). */
  src: string;
  /** Seconds into the video. */
  t: number;
}

export interface SignalPost {
  id: string;
  dataset: SignalDataset;
  platform: Platform;
  /** Native id used by the platform's official embed player (null for synthetic posts). */
  platformId: string | null;
  url: string | null;
  /** Replay: real publication time. Scenario: computed from offsetSec at runtime. */
  publishedAt: string;
  /** Scenario only: seconds relative to the scenario reset (negative = before the alert). */
  offsetSec?: number;
  /** Pseudonymous author key — used only to count independent sources, never displayed. */
  author: string;
  text: string;
  language: string | null;
  transcript: string | null;
  onScreenText: string[];
  hashtags: string[];
  media: "video" | "image" | "text";
  frames: SignalFrame[];
  geotag: { label: string; lngLat: [number, number] } | null;
  views: number | null;
  synthetic: boolean;
}

export const SIGNAL_CATEGORIES = [
  "flooding",
  "heavy_rain",
  "hail",
  "storm_wind",
  "water_in_building",
  "stranded_vehicle",
  "road_hazard",
  "power_outage",
  "people_need_help",
  "official_update",
  "weather_context",
  "rumour",
  "confusion",
  "noise",
] as const;
export type SignalCategory = (typeof SIGNAL_CATEGORIES)[number];

export const PLACE_KINDS = ["town", "district", "village", "road", "landmark", "valley", "emirate", "country"] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];

export const DEPTHS = ["none", "wet_surface", "ankle", "knee", "car_door", "waist_or_more", "unknown"] as const;
export type WaterDepth = (typeof DEPTHS)[number];

/** The fixed form the model fills for each post. Validated before use; anything else is discarded. */
export const SignalAnalysisSchema = z.object({
  post_id: z.string(),
  relevant: z.boolean(),
  category: z.enum(SIGNAL_CATEGORIES),
  noise_reason: z.string().nullable(),
  places: z.array(
    z.object({
      text: z.string(),
      name_en: z.string(),
      name_ar: z.string(),
      kind: z.enum(PLACE_KINDS),
    }),
  ),
  severity: z.enum(["low", "medium", "high"]),
  observed: z.object({
    water_depth: z.enum(DEPTHS),
    hail: z.boolean(),
    flowing_water: z.boolean(),
    people_at_risk: z.boolean(),
    poor_visibility: z.boolean(),
    road_affected: z.boolean(),
  }),
  possible_repost: z.boolean(),
  repost_reason: z.string().nullable(),
  claim: z.string().nullable(),
  question: z.string().nullable(),
  summary_en: z.string(),
  summary_ar: z.string(),
  evidence: z.array(z.string()),
  confidence: z.number(),
});
export type SignalAnalysisRaw = z.infer<typeof SignalAnalysisSchema>;

export interface SignalAnalysis {
  postId: string;
  relevant: boolean;
  category: SignalCategory;
  noiseReason: string | null;
  places: { text: string; nameEn: string; nameAr: string; kind: PlaceKind }[];
  severity: "low" | "medium" | "high";
  observed: { waterDepth: WaterDepth; hail: boolean; flowingWater: boolean; peopleAtRisk: boolean; poorVisibility: boolean; roadAffected: boolean };
  possibleRepost: boolean;
  repostReason: string | null;
  claim: string | null;
  question: string | null;
  summary: Bilingual;
  evidence: string[];
  confidence: number;
  /** "text" = caption, speech and on-screen text only; "vision" = the model also looked at video frames. */
  stage: "text" | "vision";
  model: string;
  analyzedAt: string;
}

export function fromRaw(raw: SignalAnalysisRaw, meta: { stage: "text" | "vision"; model: string; analyzedAt: string }): SignalAnalysis {
  const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
  return {
    postId: raw.post_id,
    relevant: raw.relevant && raw.category !== "noise",
    category: raw.relevant ? raw.category : "noise",
    noiseReason: raw.noise_reason ? clip(raw.noise_reason, 160) : null,
    places: raw.places.slice(0, 8).map((p) => ({ text: clip(p.text, 80), nameEn: clip(p.name_en, 80), nameAr: clip(p.name_ar, 80), kind: p.kind })),
    severity: raw.severity,
    observed: {
      waterDepth: raw.observed.water_depth,
      hail: raw.observed.hail,
      flowingWater: raw.observed.flowing_water,
      peopleAtRisk: raw.observed.people_at_risk,
      poorVisibility: raw.observed.poor_visibility,
      roadAffected: raw.observed.road_affected,
    },
    possibleRepost: raw.possible_repost,
    repostReason: raw.repost_reason ? clip(raw.repost_reason, 160) : null,
    claim: raw.claim ? clip(raw.claim, 90) : null,
    question: raw.question ? clip(raw.question, 140) : null,
    summary: { en: clip(raw.summary_en, 220), ar: clip(raw.summary_ar, 220) },
    evidence: raw.evidence.slice(0, 5).map((e) => clip(e, 140)),
    confidence: Math.max(0, Math.min(1, raw.confidence)),
    stage: meta.stage,
    model: meta.model,
    analyzedAt: meta.analyzedAt,
  };
}

// ---------------------------------------------------------------------------------------------
// Gazetteer lookup (deterministic)
// ---------------------------------------------------------------------------------------------

export interface GazetteerEntry {
  id: string;
  kind: "town" | "village" | "district" | "valley" | "peak" | "dam" | "landmark" | "road";
  name: string | null;
  en: string | null;
  ar: string | null;
  alt: string[];
  lngLat: [number, number];
  radiusM: number;
  lines?: [number, number][][];
}

export interface Gazetteer {
  places: GazetteerEntry[];
  roads: GazetteerEntry[];
}

export type Precision = "geotag" | "place" | "road";

export interface ResolvedPlace {
  mention: string;
  entryId: string;
  label: Bilingual;
  kind: GazetteerEntry["kind"];
  lngLat: [number, number];
  radiusM: number;
  precision: Precision;
  /** How the name was matched — shown to the operator as the location's audit trail. */
  match: "geotag" | "exact" | "alias" | "fuzzy";
  line?: [number, number][][];
}

// Harakat, Quranic marks and superscript alef — letters themselves are kept.
const ARABIC_DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g;

/** Canonical form for matching: case, diacritics, Arabic letter variants, "Al"/"ال" prefixes, punctuation. */
export function normalizeName(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(ARABIC_DIACRITICS, "")
    .toLowerCase()
    .replace(/[إأآٱا]/g, "ا")
    .replace(/[ىی]/g, "ي")
    .replace(/ک/g, "ك")
    .replace(/ة/g, "ه")
    .replace(/ـ/g, "")
    .replace(/\b(emirate|city|area|region|road|street|st|rd|town|village)\b/g, " ")
    .replace(/(^|\s)(al|el|ad|ar|as|ash|az)[\s-]+/g, "$1")
    .replace(/(^|\s)ال(?=\S{3,})/g, "$1")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m || !n) return m + n;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

export function distanceM(a: [number, number], b: [number, number]): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const SETTLEMENT = new Set<string>(["town", "village", "district"]);

/** How well a gazetteer entry fits the kind of place the post names (0 = same kind; higher = worse). */
function kindFit(mention: PlaceKind, entry: GazetteerEntry["kind"]): number {
  if (mention === entry) return 0;
  if (SETTLEMENT.has(mention) && SETTLEMENT.has(entry)) return 1;
  if (SETTLEMENT.has(mention)) return 8; // a town named in a post is not the peak or dam of the same name
  if (mention === "valley" && (entry === "village" || entry === "district")) return 2; // "Wadi Helo" is also a village
  return 3;
}

export interface GazetteerIndex {
  byName: Map<string, GazetteerEntry[]>;
  entries: GazetteerEntry[];
}

export function indexGazetteer(g: Gazetteer): GazetteerIndex {
  const byName = new Map<string, GazetteerEntry[]>();
  const entries = [...g.places, ...g.roads];
  for (const e of entries) {
    const names = new Set([e.name, e.en, e.ar, ...e.alt].filter((x): x is string => !!x).map(normalizeName).filter((x) => x.length >= 2));
    for (const n of names) byName.set(n, [...(byName.get(n) ?? []), e]);
  }
  return { byName, entries };
}

/** Geotags that only name a country, emirate or city are too coarse to place a report. */
export function isGenericGeotag(label: string): boolean {
  const parts = label.split(",").map((p) => normalizeName(p)).filter(Boolean);
  const coarse = new Set(["united arab emirates", "uae", "emirates", "dubai", "sharjah", "abu dhabi", "ajman", "u a e", "دبي", "الشارقه", "الامارات"]);
  return parts.length <= 2 && parts.every((p) => coarse.has(p));
}

function candidatesFor(idx: GazetteerIndex, names: string[], kind: PlaceKind): { entry: GazetteerEntry; match: ResolvedPlace["match"] }[] {
  const wantRoad = kind === "road";
  const keys = [...new Set(names.map(normalizeName).filter((n) => n.length >= 2))];
  const exact: { entry: GazetteerEntry; match: ResolvedPlace["match"] }[] = [];
  for (const k of keys) for (const e of idx.byName.get(k) ?? []) exact.push({ entry: e, match: e.name && normalizeName(e.name) === k ? "exact" : "alias" });
  const filtered = exact.filter((c) => (wantRoad ? c.entry.kind === "road" : c.entry.kind !== "road"));
  if (filtered.length) return filtered;
  if (exact.length) return exact;
  // Fuzzy: transliteration variants (Mleiha / Maleha, Dhaid / Zeed) — only for longer names.
  const fuzzy: { entry: GazetteerEntry; match: ResolvedPlace["match"]; d: number }[] = [];
  for (const k of keys) {
    if (k.length < 5) continue;
    const limit = k.length >= 9 ? 2 : 1;
    for (const [name, list] of idx.byName) {
      if (Math.abs(name.length - k.length) > limit) continue;
      const d = levenshtein(name, k);
      if (d <= limit) for (const e of list) if (wantRoad ? e.kind === "road" : e.kind !== "road") fuzzy.push({ entry: e, match: "fuzzy", d });
    }
  }
  return fuzzy.sort((a, b) => a.d - b.d);
}

/**
 * Resolves the places a post names to gazetteer entries. Country- and emirate-level mentions are
 * never placed on the map (too coarse). Ambiguous names prefer the candidate nearest to the
 * other places in the same post, then the more specific kind.
 */
export function resolvePlaces(
  post: Pick<SignalPost, "geotag">,
  analysis: Pick<SignalAnalysis, "places">,
  idx: GazetteerIndex,
  opts: { focus?: [number, number]; roadSpanM?: number; maxDistanceM?: number } = {},
): ResolvedPlace[] {
  const out: ResolvedPlace[] = [];
  if (post.geotag && !isGenericGeotag(post.geotag.label)) {
    out.push({
      mention: post.geotag.label,
      entryId: "geotag",
      label: { en: post.geotag.label, ar: post.geotag.label },
      kind: "landmark",
      lngLat: post.geotag.lngLat,
      radiusM: 150,
      precision: "geotag",
      match: "geotag",
    });
  }
  const pending: { mention: SignalAnalysis["places"][number]; cands: { entry: GazetteerEntry; match: ResolvedPlace["match"] }[] }[] = [];
  for (const m of analysis.places) {
    if (m.kind === "country" || m.kind === "emirate") continue;
    // A same-named place far outside the area being monitored is a different place.
    const cands = candidatesFor(idx, [m.text, m.nameEn, m.nameAr], m.kind).filter(
      (c) => !opts.focus || !opts.maxDistanceM || nearestPoint(c.entry, opts.focus).d <= opts.maxDistanceM,
    );
    if (cands.length) pending.push({ mention: m, cands });
  }
  // Unambiguous point places anchor the ambiguous ones (a road's stored point is just its midpoint).
  const anchors = pending
    .filter((p) => new Set(p.cands.map((c) => c.entry.id)).size === 1 && p.cands[0].entry.kind !== "road" && kindFit(p.mention.kind, p.cands[0].entry.kind) <= 1)
    .map((p) => p.cands[0].entry.lngLat);
  for (const p of pending) {
    let best = p.cands[0];
    if (new Set(p.cands.map((c) => c.entry.id)).size > 1) {
      const refs = anchors.length ? anchors : opts.focus ? [opts.focus] : [];
      const score = (c: (typeof p.cands)[number]) => {
        const near = refs.length ? Math.min(...refs.map((a) => nearestPoint(c.entry, a).d)) : 0;
        return near / 1000 + kindFit(p.mention.kind, c.entry.kind) * 4 + (c.match === "fuzzy" ? 5 : 0);
      };
      best = [...p.cands].sort((a, b) => score(a) - score(b))[0];
    }
    const e = best.entry;
    if (out.some((o) => o.entryId === e.id)) continue;
    // Roads are long: anchor the report on the stretch nearest to the other places (or the focus area).
    const ref = anchors[0] ?? opts.focus;
    const at = e.lines && ref ? nearestPoint(e, ref).p : e.lngLat;
    const span = opts.roadSpanM ?? 30_000;
    const line = e.lines?.filter((l) => l.some((pt) => distanceM(at, pt) <= span));
    out.push({
      mention: p.mention.text,
      entryId: e.id,
      label: { en: e.en ?? p.mention.nameEn ?? e.name ?? "", ar: e.ar ?? p.mention.nameAr ?? e.name ?? "" },
      kind: e.kind,
      lngLat: at,
      radiusM: e.kind === "road" ? 400 : e.radiusM,
      precision: e.kind === "road" ? "road" : "place",
      match: best.match,
      ...(line?.length ? { line } : {}),
    });
  }
  return out;
}

function nearestPoint(e: GazetteerEntry, ref: [number, number]): { p: [number, number]; d: number } {
  let best = { p: e.lngLat, d: distanceM(ref, e.lngLat) };
  for (const l of e.lines ?? []) for (const pt of l) {
    const d = distanceM(ref, pt);
    if (d < best.d) best = { p: pt, d };
  }
  return best;
}

// ---------------------------------------------------------------------------------------------
// Hotspots, rumours and confusion (deterministic grouping)
// ---------------------------------------------------------------------------------------------

export interface SignalItem {
  post: SignalPost;
  analysis: SignalAnalysis | null;
  places: ResolvedPlace[];
}

export interface Hotspot {
  id: string;
  label: Bilingual;
  center: [number, number];
  radiusM: number;
  postIds: string[];
  sources: number;
  categories: SignalCategory[];
  severity: "low" | "medium" | "high";
  score: number;
  /** Two or more independent sources agree. A single report is never treated as corroborated. */
  corroborated: boolean;
  firstAt: string;
  lastAt: string;
  observed: { hail: number; flowingWater: number; peopleAtRisk: number; deepWater: number };
}

export interface Rumour {
  id: string;
  claim: string;
  postIds: string[];
  sources: number;
  views: number;
  firstAt: string;
  lastAt: string;
}

export interface ConfusionTopic {
  id: string;
  question: string;
  postIds: string[];
}

const SEV_W = { low: 1, medium: 2, high: 3 } as const;
const DEEP: WaterDepth[] = ["knee", "car_door", "waist_or_more"];
export const IMPACT_CATEGORIES: SignalCategory[] = [
  "flooding",
  "heavy_rain",
  "hail",
  "storm_wind",
  "water_in_building",
  "stranded_vehicle",
  "road_hazard",
  "power_outage",
  "people_need_help",
];

/** Single-linkage grouping of located impact reports within `linkM` metres of each other. */
export function buildHotspots(items: SignalItem[], linkM: number): Hotspot[] {
  const pts: { item: SignalItem; at: [number, number]; label: Bilingual }[] = [];
  for (const it of items) {
    const a = it.analysis;
    if (!a?.relevant || !IMPACT_CATEGORIES.includes(a.category) || a.possibleRepost) continue;
    // A report counts once, at its most precise location (multi-place storm-chase posts count at each place).
    const places = it.places.filter((p) => p.precision !== "road" || it.places.length === 1);
    for (const p of places.length ? places : it.places) pts.push({ item: it, at: p.lngLat, label: p.label });
  }
  const parent = pts.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) if (distanceM(pts[i].at, pts[j].at) <= linkM) parent[find(i)] = find(j);
  const groups = new Map<number, typeof pts>();
  pts.forEach((p, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), p]));

  return [...groups.values()]
    .map((g) => {
      const posts = [...new Map(g.map((p) => [p.item.post.id, p.item])).values()];
      const center: [number, number] = [g.reduce((s, p) => s + p.at[0], 0) / g.length, g.reduce((s, p) => s + p.at[1], 0) / g.length];
      const radiusM = Math.max(linkM * 0.35, ...g.map((p) => distanceM(center, p.at) + linkM * 0.2));
      const sources = new Set(posts.map((p) => p.post.author)).size;
      const sev = Math.max(...posts.map((p) => SEV_W[p.analysis!.severity])) as 1 | 2 | 3;
      const labelCount = new Map<string, { label: Bilingual; n: number }>();
      for (const p of g) labelCount.set(p.label.en, { label: p.label, n: (labelCount.get(p.label.en)?.n ?? 0) + 1 });
      const label = [...labelCount.values()].sort((a, b) => b.n - a.n)[0].label;
      const times = posts.map((p) => p.post.publishedAt).sort();
      const media = posts.filter((p) => p.post.media !== "text").length;
      return {
        id: `HS-${normalizeName(label.en).replace(/\s+/g, "-") || "area"}`,
        label,
        center,
        radiusM: Math.round(radiusM),
        postIds: posts.map((p) => p.post.id),
        sources,
        categories: [...new Set(posts.map((p) => p.analysis!.category))],
        severity: (["low", "medium", "high"] as const)[sev - 1],
        score: Math.round((sources * 2 + media + posts.reduce((s, p) => s + SEV_W[p.analysis!.severity], 0)) * 10) / 10,
        corroborated: sources >= 2,
        firstAt: times[0],
        lastAt: times[times.length - 1],
        observed: {
          hail: posts.filter((p) => p.analysis!.observed.hail).length,
          flowingWater: posts.filter((p) => p.analysis!.observed.flowingWater).length,
          peopleAtRisk: posts.filter((p) => p.analysis!.observed.peopleAtRisk).length,
          deepWater: posts.filter((p) => DEEP.includes(p.analysis!.observed.waterDepth)).length,
        },
      };
    })
    .sort((a, b) => b.score - a.score)
    .map((h, i, all) => (all.findIndex((x) => x.id === h.id) === i ? h : { ...h, id: `${h.id}-${i}` }));
}

const STOP = new Set(["the", "and", "due", "with", "now", "after", "from", "into", "street", "road", "are", "can", "should", "there", "this", "that", "for", "has", "have", "been", "was", "rain", "heavy"]);
const tokens = (s: string) => new Set(normalizeName(s).split(" ").filter((w) => w.length > 2 && !STOP.has(w)));
const jaccard = (a: Set<string>, b: Set<string>) => {
  const inter = [...a].filter((x) => b.has(x)).length;
  return inter / (a.size + b.size - inter || 1);
};

/** Groups texts whose content words overlap enough (the model paraphrases the same claim differently). */
function groupBySimilarity(items: SignalItem[], text: (a: SignalAnalysis) => string | null, threshold: number): SignalItem[][] {
  const groups: { toks: Set<string>; list: SignalItem[] }[] = [];
  for (const it of items) {
    const t = it.analysis && text(it.analysis);
    if (!t) continue;
    const toks = tokens(t);
    const g = groups.find((x) => jaccard(x.toks, toks) >= threshold);
    if (g) {
      g.list.push(it);
      for (const w of toks) g.toks.add(w);
    } else groups.push({ toks, list: [it] });
  }
  return groups.map((g) => g.list);
}

export function buildRumours(items: SignalItem[]): Rumour[] {
  const rumourItems = items.filter((it) => it.analysis?.category === "rumour" && it.analysis.claim);
  return groupBySimilarity(rumourItems, (a) => a.claim, 0.4)
    .map((list) => {
      const k = [...tokens(list[0].analysis!.claim!)].join("-");
      const times = list.map((x) => x.post.publishedAt).sort();
      return {
        id: `RUM-${k.replace(/\s+/g, "-").slice(0, 32)}`,
        claim: list[0].analysis!.claim!,
        postIds: list.map((x) => x.post.id),
        sources: new Set(list.map((x) => x.post.author)).size,
        views: list.reduce((s, x) => s + (x.post.views ?? 0), 0),
        firstAt: times[0],
        lastAt: times[times.length - 1],
      };
    })
    .sort((a, b) => b.postIds.length - a.postIds.length);
}

export function buildConfusion(items: SignalItem[]): ConfusionTopic[] {
  const qs = items.filter((it) => it.analysis?.category === "confusion" && it.analysis.question);
  return groupBySimilarity(qs, (a) => a.question, 0.3).map((list) => ({
    id: `CQ-${[...tokens(list[0].analysis!.question!)].join("-").slice(0, 32)}`,
    question: list[0].analysis!.question!,
    postIds: list.map((x) => x.post.id),
  }));
}

export interface SignalFunnel {
  found: number;
  analysed: number;
  relevant: number;
  noise: number;
  reposts: number;
  located: number;
  hotspots: number;
  corroborated: number;
  rumours: number;
  confusion: number;
  viewedFrames: number;
}

export function funnel(items: SignalItem[], hotspots: Hotspot[], rumours: Rumour[], confusion: ConfusionTopic[]): SignalFunnel {
  const analysed = items.filter((i) => i.analysis);
  return {
    found: items.length,
    analysed: analysed.length,
    relevant: analysed.filter((i) => i.analysis!.relevant).length,
    noise: analysed.filter((i) => !i.analysis!.relevant).length,
    reposts: analysed.filter((i) => i.analysis!.possibleRepost).length,
    located: analysed.filter((i) => i.analysis!.relevant && i.places.length > 0).length,
    hotspots: hotspots.length,
    corroborated: hotspots.filter((h) => h.corroborated).length,
    rumours: rumours.length,
    confusion: confusion.length,
    viewedFrames: analysed.filter((i) => i.analysis!.stage === "vision").length,
  };
}
