import { describe, expect, it } from "vitest";
import {
  buildHotspots,
  buildRumours,
  buildConfusion,
  indexGazetteer,
  isGenericGeotag,
  normalizeName,
  resolvePlaces,
  type SignalAnalysis,
  type SignalItem,
  type SignalPost,
} from "@/domain/signals";
import { DATASET_GEO, GAZETTEER, RECORDED_ANALYSIS, replayPosts, scenarioPosts } from "@/scenario/signals";
import { ATTACKS } from "@/domain/comms/redteam";
import { lockedFactValues, renderApproved } from "@/domain/comms/facts";
import { validateCandidate } from "@/domain/comms/validator";
import { APPROVED_ACTIONS, policyByVersion } from "@/scenario/policy";
import { CLOSURE_NAME, ZONE_NAME } from "@/scenario/scenario";
import { fireDetails, TOWER_NAME } from "@/scenario/fire";
import { FIRE_POLICY_VERSION } from "@/scenario/fire-policy";
import type { ActionVariant, Lang } from "@/domain/types";

const idx = indexGazetteer(GAZETTEER);

function analysis(places: SignalAnalysis["places"], over: Partial<SignalAnalysis> = {}): SignalAnalysis {
  return {
    postId: "t",
    relevant: true,
    category: "flooding",
    noiseReason: null,
    places,
    severity: "medium",
    observed: { waterDepth: "unknown", hail: false, flowingWater: false, peopleAtRisk: false, poorVisibility: false, roadAffected: false },
    possibleRepost: false,
    repostReason: null,
    claim: null,
    question: null,
    summary: { en: "", ar: "" },
    evidence: [],
    confidence: 0.9,
    stage: "text",
    model: "test",
    analyzedAt: "2026-10-31T00:00:00Z",
    ...over,
  };
}

const post = (id: string, author: string, over: Partial<SignalPost> = {}): SignalPost => ({
  id,
  dataset: "scenario",
  platform: "x",
  platformId: null,
  url: null,
  publishedAt: "2026-10-31T10:00:00Z",
  author,
  text: "",
  language: "en",
  transcript: null,
  onScreenText: [],
  hashtags: [],
  media: "text",
  frames: [],
  geotag: null,
  views: null,
  synthetic: true,
  ...over,
});

describe("place-name normalisation", () => {
  it("keeps Arabic letters and folds letter variants, prefixes and diacritics", () => {
    expect(normalizeName("فلي")).toBe("فلي");
    expect(normalizeName("المدام")).toBe(normalizeName("مدام"));
    expect(normalizeName("Al Madam")).toBe("madam");
    expect(normalizeName("شارع الوحدة")).toBe(normalizeName("شارع الوحده"));
    expect(normalizeName("Khor Fakkan Road")).toBe("khor fakkan");
  });

  it("treats country, emirate and city geotags as too coarse to place a report", () => {
    expect(isGenericGeotag("United Arab Emirates")).toBe(true);
    expect(isGenericGeotag("Dubai, United Arab Emirates")).toBe(true);
    expect(isGenericGeotag("Expo Centre Sharjah, Al Taawun")).toBe(false);
  });
});

describe("gazetteer lookup (the model names places; coordinates come only from OSM)", () => {
  const replay = DATASET_GEO.replay;
  const at = (places: SignalAnalysis["places"], opts = replay) => resolvePlaces({ geotag: null }, analysis(places), idx, opts);

  it("resolves Arabic and English spellings of Sharjah storm places to the same OSM feature", () => {
    const ar = at([{ text: "المدام", nameEn: "Al Madam", nameAr: "المدام", kind: "town" }]);
    const en = at([{ text: "Madam", nameEn: "Madam", nameAr: "مدام", kind: "town" }]);
    expect(ar[0]?.entryId).toBeTruthy();
    expect(ar[0].lngLat[1]).toBeGreaterThan(24.8);
    expect(ar[0].lngLat[1]).toBeLessThan(25.0);
    expect(en[0]?.label.en).toMatch(/Madam/);
  });

  it("matches transliteration variants (Mleiha / Maleha / مليحة) near the same place", () => {
    const a = at([{ text: "مليحة", nameEn: "Mleiha", nameAr: "مليحة", kind: "town" }])[0];
    const b = at([{ text: "Maleha", nameEn: "Maleha", nameAr: "مليحة", kind: "town" }])[0];
    expect(a && b).toBeTruthy();
    const dLon = Math.abs(a.lngLat[0] - b.lngLat[0]);
    expect(dLon).toBeLessThan(0.1);
  });

  it("anchors a road on the stretch nearest the area being monitored", () => {
    const scen = DATASET_GEO.scenario;
    const r = at([{ text: "Al Wahda Street", nameEn: "Al Wahda Street", nameAr: "شارع الوحدة", kind: "road" }], scen)[0];
    expect(r.precision).toBe("road");
    // The scenario closure is on Al Wahda Street in Al Majaz, not the street of the same name in Kalba.
    expect(Math.abs(r.lngLat[0] - 55.39)).toBeLessThan(0.02);
  });

  it("never places country or emirate mentions, and drops same-named places far outside the area", () => {
    expect(at([{ text: "Sharjah", nameEn: "Sharjah", nameAr: "الشارقة", kind: "emirate" }])).toEqual([]);
    const far = at([{ text: "the corniche", nameEn: "Al Corniche", nameAr: "الكورنيش", kind: "landmark" }], DATASET_GEO.scenario);
    expect(far.every((p) => Math.abs(p.lngLat[0] - 55.38) < 0.06)).toBe(true);
  });

  it("uses a precise geotag but ignores coarse ones", () => {
    const precise = resolvePlaces({ geotag: { label: "Expo Centre Sharjah, Al Taawun", lngLat: [55.375, 25.318] } }, analysis([]), idx);
    const coarse = resolvePlaces({ geotag: { label: "United Arab Emirates", lngLat: [54, 24] } }, analysis([]), idx);
    expect(precise[0].precision).toBe("geotag");
    expect(coarse).toEqual([]);
  });
});

describe("hotspots, rumours and confusion", () => {
  const madam = (id: string, author: string, over: Partial<SignalAnalysis> = {}): SignalItem => ({
    post: post(id, author),
    analysis: analysis([], over),
    places: [{ mention: "Madam", entryId: "e1", label: { en: "Al Madam", ar: "المدام" }, kind: "town", lngLat: [55.78, 24.91], radiusM: 3500, precision: "place", match: "exact" }],
  });

  it("a single source is never corroborated; independent sources are", () => {
    const one = buildHotspots([madam("a", "u1"), madam("b", "u1")], 6000);
    expect(one).toHaveLength(1);
    expect(one[0].sources).toBe(1);
    expect(one[0].corroborated).toBe(false);
    const two = buildHotspots([madam("a", "u1"), madam("b", "u2")], 6000);
    expect(two[0].corroborated).toBe(true);
  });

  it("excludes noise, reposts, rumours and context posts from hotspots", () => {
    const hs = buildHotspots(
      [madam("a", "u1", { relevant: false, category: "noise" }), madam("b", "u2", { possibleRepost: true }), madam("c", "u3", { category: "rumour" }), madam("d", "u4", { category: "weather_context" })],
      6000,
    );
    expect(hs).toEqual([]);
  });

  it("groups paraphrases of the same claim into one rumour", () => {
    const r = (id: string, claim: string): SignalItem => ({ post: post(id, id), analysis: analysis([], { category: "rumour", claim }), places: [] });
    const out = buildRumours([r("1", "Al Wahda Street bridge collapsed"), r("2", "Al Wahda Bridge collapsed due to rain"), r("3", "Al Wahda Bridge collapsed with casualties"), r("4", "Khalid Lagoon wall burst")]);
    expect(out).toHaveLength(2);
    expect(out[0].postIds).toHaveLength(3);
  });

  it("groups public questions about the same thing", () => {
    const q = (id: string, question: string): SignalItem => ({ post: post(id, id), analysis: analysis([], { category: "confusion", question }), places: [] });
    const out = buildConfusion([q("1", "Can parents pick up children from school after a stay-indoors alert?"), q("2", "Can I leave to pick up my children from school?")]);
    expect(out).toHaveLength(1);
  });
});

describe("recorded datasets", () => {
  it("every synthetic scenario post has a recorded analysis", () => {
    for (const p of scenarioPosts(new Date())) expect(RECORDED_ANALYSIS.scenario[p.id], p.id).toBeTruthy();
  });

  it("real replay posts carry no handles, names or profile data", () => {
    const posts = replayPosts();
    expect(posts.length).toBeGreaterThan(50);
    for (const p of posts) {
      expect(Object.keys(p)).not.toContain("profileHandle");
      expect(p.author).toMatch(/^[0-9a-f]{12}$/);
      expect(p.synthetic).toBe(false);
    }
  });
});

describe("red-team stress test", () => {
  const validUntil = "2026-10-21T20:05:00+04:00";
  const fire = fireDetails();
  // Each action is attacked with the facts its own drill provides (the fire drill adds floor and assembly point).
  const factsFor = (policyVersion: string) =>
    policyVersion === FIRE_POLICY_VERSION
      ? { zone: TOWER_NAME, closure: CLOSURE_NAME, validUntil, floor: { en: `floor ${fire.fireFloor}`, ar: `الطابق ${fire.fireFloor}` }, assembly: fire.assemblyPoint.name }
      : { zone: ZONE_NAME, closure: CLOSURE_NAME, validUntil };
  const variants: ActionVariant[] = ["standard", "plain", "audio"];
  for (const attack of ATTACKS)
    for (const action of APPROVED_ACTIONS)
      for (const language of ["en", "ar"] as Lang[])
        for (const variant of variants)
          it(`blocks "${attack.id}" on ${action.id}/${language}/${variant}`, () => {
            const facts = factsFor(action.policyVersion);
            const content = attack.apply(renderApproved(action, language, variant, facts), language, lockedFactValues(action, language, facts));
            const v = validateCandidate({ actionId: action.id, language, variant, content }, { action, language, variant, facts }, policyByVersion(action.policyVersion));
            expect(v.passed).toBe(false);
          });
});
