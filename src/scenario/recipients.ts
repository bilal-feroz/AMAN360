import * as turf from "@turf/turf";
import type { Feature, FeatureCollection, LineString, Point, Polygon } from "geojson";
import type { AccessibilityProfile, Lang, Mobility, Recipient } from "@/domain/types";
import { evaluateGeo, type GeoContext } from "@/domain/geo";
import { CORRIDORS } from "./scenario";

/**
 * Deterministic generator for the synthetic population (no real people, no real personal data).
 * Every placement is checked with the same geo engine the platform uses, so the category counts
 * below are produced by real spatial computation rather than asserted.
 */

export const POPULATION_PLAN = {
  insideZone: 106,
  approachingClosure: 14,
  outside: 28,
  driversNotAffected: 4,
  missingLocation: 4,
} as const;

export const SIM_RESPONSE_PLAN = { safe: 84, help: 7, clarify: 3, none: 24 } as const;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const AR_NAMES = ["Fatima", "Ahmed", "Aisha", "Khalid", "Noura", "Saeed", "Hessa", "Rashid", "Maryam", "Yousef", "Latifa", "Hamad", "Shamma", "Sultan", "Amna", "Majid", "Reem", "Obaid", "Moza", "Salem", "Hind", "Jassim", "Alia", "Faisal", "Mahra", "Nasser", "Sara", "Ibrahim", "Lubna", "Tariq"];
const EN_NAMES = ["Priya", "Daniel", "Anjali", "Michael", "Grace", "Rahul", "Sofia", "Thomas", "Leila", "Arjun", "Hannah", "Ravi", "Emma", "Joseph", "Nadia", "Kevin", "Asha", "Lucas", "Mei", "Samuel", "Irina", "Vikram", "Chloe", "Omari", "Elena", "Farid", "Julia", "Aditya", "Zara", "Martin"];
const INITIALS = "ABDFHKMNRSTZ";

const HELP_TEXTS: { text: string; lang: Lang; vulnerability: Recipient["vulnerability"] }[] = [
  { text: "Water is entering the ground floor lobby. My elderly mother cannot use the stairs.", lang: "en", vulnerability: ["elderly"] },
  { text: "عالقون في الطابق الأرضي والمياه ترتفع عند المدخل.", lang: "ar", vulnerability: [] },
  { text: "My car stalled in water near the building entrance. I am okay but cannot move it.", lang: "en", vulnerability: [] },
  { text: "والدي يحتاج إلى جهاز أكسجين، وانقطعت الكهرباء في الشقة.", lang: "ar", vulnerability: ["medical"] },
  { text: "The basement parking is flooded and residents on our floor are asking what to do.", lang: "en", vulnerability: [] },
  { text: "طفلي مريض ونحتاج إلى مساعدة للخروج من المبنى بأمان.", lang: "ar", vulnerability: ["child"] },
  { text: "Wheelchair user on the 3rd floor and the lift is not working.", lang: "en", vulnerability: ["mobility"] },
];

const CLARIFY_TEXTS: { text: string; lang: Lang }[] = [
  { text: "Is it safe to drive to work this afternoon?", lang: "en" },
  { text: "هل ستصل المياه إلى مبنانا في الطابق الأرضي؟", lang: "ar" },
  { text: "When does the warning end?", lang: "en" },
];

export const PERSONA_TEXT = {
  mariamHelp: "المياه دخلت إلى الطابق الأرضي، ووالدي كبير في السن ولا يستطيع صعود الدرج.",
};

const round4 = (n: number) => Math.round(n * 1e4) / 1e4;

function a11y(r: () => number, overrides: Partial<AccessibilityProfile> = {}): AccessibilityProfile {
  const x = r();
  return {
    plainLanguage: x < 0.12,
    largeText: x > 0.82,
    screenReader: x > 0.95,
    audio: x > 0.97,
    highContrast: x > 0.9,
    ...overrides,
  };
}

interface BuildingPick {
  pt: [number, number];
  h: number;
  name?: string;
}

export interface GenerateOptions {
  buildings: FeatureCollection<Polygon>;
  geo: GeoContext;
  tokenFor: (id: string) => string;
  seed?: number;
}

export function generateRecipients(opts: GenerateOptions): Recipient[] {
  const r = mulberry32(opts.seed ?? 20261021);
  const pick = <T,>(arr: T[]) => arr[Math.floor(r() * arr.length)];

  // Candidate buildings: centroid inside the footprint, classified by the geo engine.
  const inside: BuildingPick[] = [];
  const outside: BuildingPick[] = [];
  for (const f of opts.buildings.features as Feature<Polygon, { h: number; name?: string }>[]) {
    if (!f.geometry || turf.area(f) < 120) continue;
    const c = turf.pointOnFeature(f).geometry.coordinates as [number, number];
    const pt: [number, number] = [round4(c[0]), round4(c[1])];
    const checks = evaluateGeo({ location: turf.point(pt).geometry, locationStatus: "ok", locationAccuracyM: 10, route: null }, opts.geo);
    if (checks.insideZone && !checks.withinUncertainty && !checks.onBoundary) inside.push({ pt, h: f.properties.h, name: f.properties.name });
    else if (!checks.insideZone && (checks.distanceToZoneM ?? 0) > 150) outside.push({ pt, h: f.properties.h, name: f.properties.name });
  }
  // Weight by building height (towers house more people), sampled without replacement.
  const weighted = (list: BuildingPick[], n: number): BuildingPick[] => {
    const pool = list.map((b) => ({ b, w: Math.max(1, Math.min(60, b.h / 3)) }));
    const out: BuildingPick[] = [];
    for (let i = 0; i < n && pool.length; i++) {
      const total = pool.reduce((s, p) => s + p.w, 0);
      let x = r() * total;
      let idx = 0;
      while (idx < pool.length - 1 && (x -= pool[idx].w) > 0) idx++;
      out.push(pool[idx].b);
      pool.splice(idx, 1);
    }
    return out;
  };

  const people: Omit<Recipient, "id" | "token" | "sim">[] = [];
  const nameFor = (lang: Lang) => `${pick(lang === "ar" ? AR_NAMES : EN_NAMES)} ${INITIALS[Math.floor(r() * INITIALS.length)]}.`;
  const base = (lang: Lang, mobility: Mobility, location: Point | null, area: Recipient["areaLabel"], route: LineString | null = null) => ({
    displayName: nameFor(lang),
    language: lang,
    mobility,
    location,
    locationStatus: (location ? "ok" : "missing") as Recipient["locationStatus"],
    locationAccuracyM: 10,
    areaLabel: area,
    route,
    accessibility: a11y(r),
    vulnerability: (r() < 0.12 ? [pick(["elderly", "mobility", "medical", "child"] as const)] : []) as Recipient["vulnerability"],
    channel: (r() < 0.8 ? "in_app" : "sms_sim") as Recipient["channel"],
  });

  const ZONE_AREA = { en: "Al Majaz (affected zone)", ar: "المجاز (المنطقة المتأثرة)" };
  for (const b of weighted(inside, POPULATION_PLAN.insideZone)) {
    people.push(base(r() < 0.6 ? "ar" : "en", "resident", turf.point(b.pt).geometry, ZONE_AREA));
  }

  // Drivers heading north-east on Al Wahda Street toward the confirmed closure (outside the zone).
  const ne = CORRIDORS["COR-WAHDA-NE"];
  const neLen = turf.length(turf.feature(ne), { units: "meters" });
  const closureStart = turf.nearestPointOnLine(ne, turf.point(opts.geo.closures[0].geometry.coordinates[0]), { units: "meters" }).properties.location;
  let made = 0;
  for (let attempt = 0; made < POPULATION_PLAN.approachingClosure && attempt < 500; attempt++) {
    const along = 60 + r() * Math.max(10, closureStart - 260);
    const pos = turf.along(ne, along, { units: "meters" }).geometry.coordinates as [number, number];
    const pt = turf.point([round4(pos[0]), round4(pos[1])]).geometry;
    const route = turf.lineSlice(turf.point(pos), turf.point(ne.coordinates.at(-1)!), ne).geometry;
    const checks = evaluateGeo({ location: pt, locationStatus: "ok", locationAccuracyM: 10, route }, opts.geo);
    if (checks.insideZone || !checks.routeIntersectsClosure) continue;
    people.push({
      ...base(r() < 0.45 ? "ar" : "en", "driver", pt, { en: "Al Wahda Street (approaching closure)", ar: "شارع الوحدة (باتجاه الإغلاق)" }, route),
      vulnerability: [],
    });
    made++;
  }
  if (made !== POPULATION_PLAN.approachingClosure || neLen < 300) throw new Error("Could not place approaching drivers");

  const OUT_AREA = { en: "Sharjah (outside affected zone)", ar: "الشارقة (خارج المنطقة المتأثرة)" };
  for (const b of weighted(outside, POPULATION_PLAN.outside)) {
    people.push(base(r() < 0.55 ? "ar" : "en", r() < 0.2 ? "visitor" : "resident", turf.point(b.pt).geometry, OUT_AREA));
  }

  // Drivers near the area whose routes do not cross a closure (heading away / other roads).
  const sw = CORRIDORS["COR-WAHDA-SW"];
  const swLen = turf.length(turf.feature(sw), { units: "meters" });
  made = 0;
  for (let attempt = 0; made < POPULATION_PLAN.driversNotAffected && attempt < 500; attempt++) {
    const along = swLen - 120 - r() * 500;
    const pos = turf.along(sw, along, { units: "meters" }).geometry.coordinates as [number, number];
    const pt = turf.point([round4(pos[0]), round4(pos[1])]).geometry;
    const route = turf.lineSlice(turf.point(pos), turf.point(sw.coordinates.at(-1)!), sw).geometry;
    const checks = evaluateGeo({ location: pt, locationStatus: "ok", locationAccuracyM: 10, route }, opts.geo);
    if (checks.insideZone || checks.routeIntersectsClosure) continue;
    people.push({
      ...base(r() < 0.5 ? "ar" : "en", "driver", pt, { en: "Al Wahda Street (heading away)", ar: "شارع الوحدة (مبتعدًا عن الإغلاق)" }, route),
      vulnerability: [],
    });
    made++;
  }

  // Recipients whose location cannot be used: missing, stale, invalid.
  const statuses: Recipient["locationStatus"][] = ["missing", "missing", "stale", "invalid"];
  for (const s of statuses.slice(0, POPULATION_PLAN.missingLocation)) {
    const p = base(r() < 0.5 ? "ar" : "en", "resident", null, { en: "Location unavailable", ar: "الموقع غير متاح" });
    p.locationStatus = s;
    if (s === "stale") p.location = turf.point(pick(inside).pt).geometry;
    if (s === "invalid") p.location = { type: "Point", coordinates: [NaN, 25.32] };
    people.push(p);
  }

  // Shuffle deterministically, then assign ids and simulated behaviours.
  for (let i = people.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [people[i], people[j]] = [people[j], people[i]];
  }
  const recipients: Recipient[] = people.map((p, i) => {
    const id = `RES-${String(i + 1).padStart(3, "0")}`;
    return { ...p, id, token: opts.tokenFor(id), sim: null };
  });

  assignPersonas(recipients, inside);
  assignSimulatedResponses(recipients, r);
  return recipients;
}

function assignPersonas(recipients: Recipient[], inside: BuildingPick[]) {
  const PERSONA_IDS = ["RES-014", "RES-022", "RES-047", "RES-131"];
  const byId = (id: string) => recipients.find((x) => x.id === id)!;
  const free = (pred: (x: Recipient) => boolean) => recipients.filter((x) => pred(x) && !PERSONA_IDS.includes(x.id));
  const isZoneRes = (x: Recipient) => x.mobility === "resident" && x.areaLabel.en.startsWith("Al Majaz") && x.locationStatus === "ok";

  /** Moves the profile currently at sourceId into targetId (and vice versa); returns the new target. */
  const swap = (targetId: string, sourceId: string) => {
    if (sourceId === targetId) return byId(targetId);
    const tIdx = recipients.findIndex((x) => x.id === targetId);
    const sIdx = recipients.findIndex((x) => x.id === sourceId);
    const target = recipients[tIdx];
    const source = recipients[sIdx];
    recipients[tIdx] = { ...source, id: target.id, token: target.token };
    recipients[sIdx] = { ...target, id: source.id, token: source.token };
    return recipients[tIdx];
  };

  // Mariam — Arabic-speaking resident in the tallest tower inside the zone; cares for an elderly father.
  const tower = [...inside].sort((a, b) => b.h - a.h)[0];
  const zoneNow = recipients.filter(isZoneRes);
  const mariamSrc = zoneNow.reduce((best, x) => {
    const d = (p: Recipient) => turf.distance(p.location!.coordinates, tower.pt);
    return d(x) < d(best) ? x : best;
  }, zoneNow[0]);
  const mariam = swap("RES-014", mariamSrc.id);
  Object.assign(mariam, {
    displayName: "Mariam A.",
    language: "ar",
    location: turf.point(tower.pt).geometry,
    persona: "mariam",
    vulnerability: ["elderly"],
    channel: "in_app",
    accessibility: { plainLanguage: false, largeText: true, screenReader: false, audio: false, highContrast: false },
  } satisfies Partial<Recipient>);

  // Priya — English-speaking resident inside the zone who prefers plain language.
  const priyaSrc = byId("RES-022") && isZoneRes(byId("RES-022")) ? byId("RES-022") : free(isZoneRes)[0];
  const priya = swap("RES-022", priyaSrc.id);
  Object.assign(priya, {
    displayName: "Priya S.",
    language: "en",
    channel: "in_app",
    vulnerability: [],
    accessibility: { plainLanguage: true, largeText: false, screenReader: false, audio: false, highContrast: false },
  } satisfies Partial<Recipient>);

  // Daniel — English-speaking driver approaching the closure (the one closest to it).
  const drivers = recipients.filter((x) => x.mobility === "driver" && x.areaLabel.en.includes("approaching") && x.id !== "RES-014" && x.id !== "RES-022");
  const danielSrc = drivers.reduce((best, x) => (x.location!.coordinates[1] > best.location!.coordinates[1] ? x : best), drivers[0]);
  const daniel = swap("RES-047", danielSrc.id);
  Object.assign(daniel, {
    displayName: "Daniel R.",
    language: "en",
    persona: "daniel",
    channel: "in_app",
    accessibility: { plainLanguage: false, largeText: false, screenReader: false, audio: false, highContrast: false },
  } satisfies Partial<Recipient>);

  // Omar — Arabic-speaking resident outside the zone (receives no emergency instruction).
  const isOutsideRes = (x: Recipient) => x.areaLabel.en.startsWith("Sharjah") && x.mobility === "resident";
  const omarSrc = isOutsideRes(byId("RES-131")) ? byId("RES-131") : free(isOutsideRes)[0];
  const omar = swap("RES-131", omarSrc.id);
  Object.assign(omar, {
    displayName: "Omar K.",
    language: "ar",
    persona: "omar",
    channel: "in_app",
    accessibility: { plainLanguage: false, largeText: false, screenReader: false, audio: false, highContrast: false },
  } satisfies Partial<Recipient>);
}

function pick<T>(arr: T[], r: () => number): T {
  return arr[Math.floor(r() * arr.length)];
}

function shuffle<T>(arr: T[], r: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function assignSimulatedResponses(recipients: Recipient[], r: () => number) {
  // Behaviours only matter for recipients the engine will alert; they are re-checked at assessment.
  const alertable = recipients.filter(
    (x) =>
      x.locationStatus === "ok" &&
      (x.areaLabel.en.startsWith("Al Majaz") || x.areaLabel.en.includes("approaching")) &&
      x.persona !== "mariam" &&
      x.persona !== "daniel",
  );
  const kinds: ("safe" | "help" | "clarify" | "none")[] = [
    ...Array(SIM_RESPONSE_PLAN.help).fill("help"),
    ...Array(SIM_RESPONSE_PLAN.clarify).fill("clarify"),
    ...Array(SIM_RESPONSE_PLAN.none).fill("none"),
  ];
  // Help requests come from inside the zone; drivers mostly confirm safety.
  const zone = alertable.filter((x) => x.mobility === "resident" && x.id !== "RES-022");
  const order = shuffle(zone, r);
  let help = 0;
  let clarify = 0;
  const assigned = new Map<string, Recipient["sim"]>();
  for (const x of order) {
    const k = kinds.shift();
    if (!k) break;
    if (k === "help") {
      const h = HELP_TEXTS[help++];
      if (x.language !== h.lang) x.displayName = `${pick(h.lang === "ar" ? AR_NAMES : EN_NAMES, r)} ${INITIALS[Math.floor(r() * INITIALS.length)]}.`;
      x.language = h.lang;
      x.vulnerability = h.vulnerability;
      assigned.set(x.id, { kind: "help", delaySec: Math.round(6 + r() * 26), text: h.text });
    } else if (k === "clarify") {
      const c = CLARIFY_TEXTS[clarify++];
      if (x.language !== c.lang) x.displayName = `${pick(c.lang === "ar" ? AR_NAMES : EN_NAMES, r)} ${INITIALS[Math.floor(r() * INITIALS.length)]}.`;
      x.language = c.lang;
      assigned.set(x.id, { kind: "clarify", delaySec: Math.round(8 + r() * 20), text: c.text });
    } else {
      assigned.set(x.id, { kind: "none", delaySec: 0 });
    }
  }
  for (const x of alertable) {
    x.sim = assigned.get(x.id) ?? { kind: "safe", delaySec: Math.round(4 + r() * 34) };
  }
}
