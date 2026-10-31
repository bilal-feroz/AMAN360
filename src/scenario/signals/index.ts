import type { Gazetteer, SignalAnalysis, SignalPost } from "@/domain/signals";
import scenarioRaw from "./scenario-posts.json";
import scenarioAnalysis from "./scenario-analysis.json";
import replayRaw from "./replay-posts.json";
import replayAnalysis from "./replay-analysis.json";
import gazetteerRaw from "./gazetteer.json";

/**
 * Social-signal datasets.
 *  - scenario: synthetic posts for the training scenario; their times are relative to the reset.
 *  - replay:   real public posts about the 12–20 October 2026 storm in Sharjah (Oriane), reduced to
 *              the minimum the demo needs; videos play through the platforms' own embed players.
 * Both ship with their recorded Claude analysis, so the demo works offline and costs nothing to run.
 */

type ScenarioRaw = { id: string; platform: SignalPost["platform"]; author: string; offsetSec: number; language: string; text: string; hashtags: string[] };

export function scenarioPosts(resetAt: Date): SignalPost[] {
  return (scenarioRaw.posts as ScenarioRaw[]).map((p) => ({
    id: p.id,
    dataset: "scenario",
    platform: p.platform,
    platformId: null,
    url: null,
    publishedAt: new Date(resetAt.getTime() + p.offsetSec * 1000).toISOString(),
    offsetSec: p.offsetSec,
    author: p.author,
    text: p.text,
    language: p.language,
    transcript: null,
    onScreenText: [],
    hashtags: p.hashtags,
    media: "text",
    frames: [],
    geotag: null,
    views: null,
    synthetic: true,
  }));
}

export function replayPosts(): SignalPost[] {
  return (replayRaw as unknown as { posts: SignalPost[] }).posts;
}

export const REPLAY_META = {
  window: (replayRaw as unknown as { window: { from: string; to: string } }).window,
  builtAt: (replayRaw as unknown as { builtAt: string }).builtAt,
  queries: (replayRaw as unknown as { queries: string[] }).queries.length,
};

export const RECORDED_ANALYSIS: Record<"scenario" | "replay", Record<string, SignalAnalysis>> = {
  scenario: (scenarioAnalysis as unknown as { items: Record<string, SignalAnalysis> }).items,
  replay: (replayAnalysis as unknown as { items: Record<string, SignalAnalysis> }).items,
};

export const GAZETTEER = gazetteerRaw as unknown as Gazetteer;

/** Where each dataset's map view centres, and how close reports must be to form one hotspot. */
export const DATASET_GEO = {
  scenario: { focus: [55.3874, 25.3247] as [number, number], linkM: 380, roadSpanM: 2500, maxDistanceM: 6000 },
  replay: { focus: [55.85, 25.12] as [number, number], linkM: 6000, roadSpanM: 30000, maxDistanceM: 140000 },
};

/** Friendlier spellings for a few OSM names that differ from common usage. */
export const DISPLAY_NAMES: Record<string, { en: string; ar: string }> = {
  Milehah: { en: "Mleiha", ar: "مليحة" },
  Maleha: { en: "Mleiha", ar: "مليحة" },
  "Al Mudam": { en: "Al Madam", ar: "المدام" },
  Filli: { en: "Fili", ar: "فلي" },
};
