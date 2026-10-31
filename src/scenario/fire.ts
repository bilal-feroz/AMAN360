import * as turf from "@turf/turf";
import type { Point, Polygon } from "geojson";
import type { Bilingual, FireDetails, HazardGeometry, Incident, Lang, Recipient, RoadClosure } from "@/domain/types";
import { FIRE_POLICY_VERSION } from "./fire-policy";
import { buildClosures, CLOSURE_NAME } from "./scenario";

/**
 * Training drill: a fire in a residential tower in Al Majaz (synthetic).
 *
 * The building is a real OpenStreetMap footprint from the 3D city (a 185 m tower) but it is named
 * "Tower A" and everything that happens in it is invented. The same 156 synthetic people live in
 * Al Majaz as in the flood drill — same names, phones and access links — so the drill shows one
 * platform handling a second kind of emergency: Mariam lives in this tower with her elderly father.
 */

export const FIRE_SCENARIO_ID = "SCN-SHJ-FIRE-01";
export const FIRE_INCIDENT_ID = "EVT-FIRE-001";
export const TOWER_ID = "BLD-TOWER-A";

export const TOWER_NAME: Bilingual = { en: "Tower A, Al Majaz", ar: "البرج أ، المجاز" };
export const FIRE_FLOOR = 12;
const TOWER_HEIGHT_M = 185;
const TOWER_FLOORS = 46;

export const TOWER_FOOTPRINT: Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [55.385497, 25.32239],
      [55.385499, 25.321824],
      [55.385734, 25.321825],
      [55.385732, 25.322391],
      [55.385497, 25.32239],
    ],
  ],
};
export const TOWER_CENTER: [number, number] = [55.38562, 25.32211];

/** Open lawn in Al Majaz Park, upwind (north-west) of the tower. */
const ASSEMBLY: FireDetails["assemblyPoint"] = {
  name: { en: "Al Majaz Park, south lawn", ar: "المسطح الأخضر الجنوبي في حديقة المجاز" },
  location: [55.3835, 25.3245],
};

/** North-westerly wind: smoke drifts south-east. The smoke area is a sector downwind of the tower. */
const WIND_FROM_DEG = 315;
export const SMOKE_AREA: Polygon = turf.sector(turf.point(TOWER_CENTER), 0.8, 110, 160, { steps: 24 }).geometry;

const SMOKE_NAME: Bilingual = { en: "Smoke area downwind of Tower A", ar: "منطقة الدخان باتجاه الرياح من البرج أ" };

export const SIM_CIVIL_DEFENCE = {
  id: "SIM-CD",
  name: { en: "Simulated Civil Defence Feed (mock)", ar: "موجز دفاع مدني محاكى (تجريبي)" },
} as const;

export const FIRE_ACTION_IDS = ["ACT-FIRE-ABOVE", "ACT-FIRE-BELOW", "ACT-FIRE-SMOKE", "ACT-FIRE-ROAD"];

export function fireDetails(): FireDetails {
  return {
    buildingId: TOWER_ID,
    buildingName: TOWER_NAME,
    footprint: TOWER_FOOTPRINT,
    heightM: TOWER_HEIGHT_M,
    floors: TOWER_FLOORS,
    fireFloor: FIRE_FLOOR,
    instruction: "full_evacuation",
    assemblyPoint: ASSEMBLY,
    wind: { fromDeg: WIND_FROM_DEG, label: { en: "North-west wind", ar: "رياح شمالية غربية" } },
  };
}

/** Raw payload as it would arrive from the (simulated) Civil Defence feed. */
export function buildFirePayload(now: Date) {
  const issued = new Date(now.getTime() - 2 * 60_000);
  const until = new Date(now.getTime() + 3 * 3600_000);
  return {
    feed: SIM_CIVIL_DEFENCE.id,
    ref: "SIM-CD/2026/FR-0219",
    category: "structure_fire_highrise" as const,
    severity: "emergency" as const,
    issuedAt: issued.toISOString(),
    validFrom: issued.toISOString(),
    validUntil: until.toISOString(),
    area: TOWER_NAME,
    geometry: SMOKE_AREA,
    signature: "sim-ed25519:valid",
    closures: [
      { id: "RC-WAHDA-NE", feed: "SIM-ROADS", confirmed: true },
      { id: "RC-WAHDA-SW", feed: "SIM-ROADS", confirmed: true },
    ],
    fire: { buildingId: TOWER_ID, floors: TOWER_FLOORS, fireFloor: FIRE_FLOOR, instruction: "full_evacuation" as const },
  };
}

export function buildFireIncident(now: Date): Incident {
  const p = buildFirePayload(now);
  const iso = now.toISOString();
  return {
    id: FIRE_INCIDENT_ID,
    scenarioId: FIRE_SCENARIO_ID,
    title: { en: "High-rise fire — Tower A, Al Majaz", ar: "حريق في برج سكني — البرج أ، المجاز" },
    summary: {
      en: `Simulated Civil Defence report: fire on floor ${FIRE_FLOOR} of Tower A, Al Majaz. Instruction: full evacuation. Smoke is drifting south-east; Al Wahda Street is closed for Civil Defence access.`,
      ar: `بلاغ دفاع مدني محاكى: حريق في الطابق ${FIRE_FLOOR} من البرج أ في المجاز. التعليمات: إخلاء كامل. يتجه الدخان نحو الجنوب الشرقي، وشارع الوحدة مغلق لوصول الدفاع المدني.`,
    },
    hazardCategory: "structure_fire_highrise",
    fire: fireDetails(),
    sourceAgency: { id: SIM_CIVIL_DEFENCE.id, name: SIM_CIVIL_DEFENCE.name, simulated: true },
    sourceRef: p.ref,
    verification: {
      status: "unverified",
      method: "Simulated feed signature check + schema validation",
      checkedAt: iso,
      signatureValid: false,
      notes: ["Received — awaiting verification"],
    },
    severity: p.severity,
    issuedAt: p.issuedAt,
    validFrom: p.validFrom,
    validUntil: p.validUntil,
    policyVersion: FIRE_POLICY_VERSION,
    approvedActionIds: FIRE_ACTION_IDS,
    state: "draft",
    areaName: TOWER_NAME,
    conflicts: [],
    createdAt: iso,
    updatedAt: iso,
  };
}

export function buildFireHazard(): HazardGeometry {
  return { id: "HZ-FIRE-001-SMOKE", incidentId: FIRE_INCIDENT_ID, kind: "affected_zone", name: SMOKE_NAME, geometry: SMOKE_AREA, sourceAgency: SIM_CIVIL_DEFENCE.id };
}

/** Al Wahda Street is kept clear for fire engines (same segments as the flood closure). */
export function buildFireClosures(): RoadClosure[] {
  return buildClosures().map((c) => ({ ...c, incidentId: FIRE_INCIDENT_ID, name: CLOSURE_NAME }));
}

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

const TOWER_RESIDENTS = 60;
const towerArea = (floor: number): Bilingual => ({ en: `Tower A, floor ${floor}`, ar: `البرج أ، الطابق ${floor}` });

const TRAPPED: { lang: Lang; vulnerability: Recipient["vulnerability"]; text: (f: number) => string }[] = [
  { lang: "en", vulnerability: ["child"], text: (f) => `Smoke in the corridor on floor ${f}. We closed the door and put towels under it. Two adults and a child.` },
  { lang: "ar", vulnerability: [], text: (f) => `الدخان كثيف أمام باب الشقة في الطابق ${f}، أغلقنا الباب وننتظر.` },
  { lang: "en", vulnerability: ["mobility"], text: (f) => `I use a wheelchair and the lifts are off. I'm on floor ${f} and can't use the stairs.` },
  { lang: "ar", vulnerability: ["elderly"], text: (f) => `والدتي مسنّة ولا تستطيع نزول الدرج، نحن في الطابق ${f}.` },
];
const STILL_INSIDE: { lang: Lang; text: (f: number) => string }[] = [
  { lang: "en", text: (f) => `Still on floor ${f}. The stairs are crowded, we are moving down slowly.` },
  { lang: "ar", text: (f) => `ما زلنا في الطابق ${f}، ننزل عبر الدرج ببطء.` },
  { lang: "en", text: (f) => `On floor ${f}, waiting for my neighbour, then going down.` },
  { lang: "ar", text: (f) => `في الطابق ${f}، الدرج مزدحم وسننزل الآن.` },
  { lang: "en", text: (f) => `Floor ${f} — there is some smoke on the stairs, going down the other stairwell.` },
];
const SMOKE_HELP: { lang: Lang; vulnerability: Recipient["vulnerability"]; text: string }[] = [
  { lang: "en", vulnerability: ["child"], text: "Smoke is coming in through the AC. My son has asthma." },
  { lang: "ar", vulnerability: ["elderly"], text: "رائحة الدخان قوية داخل الشقة ووالدي يعاني من ضيق في التنفس." },
];

/**
 * The fire drill's population: the flood drill's 156 people, with 60 Al Majaz residents (plus
 * Mariam and Priya) living in Tower A on known floors, and fresh simulated replies. Deterministic.
 */
export function buildFireRecipients(flood: Recipient[]): Recipient[] {
  const r = mulberry32(20261102);
  const people: Recipient[] = flood.map((p) => ({ ...p, building: null, sim: null }));
  const at = (p: Recipient) => turf.point(p.location!.coordinates);
  const inSmoke = (p: Recipient) => !!p.location && p.locationStatus === "ok" && turf.booleanPointInPolygon(at(p), SMOKE_AREA);
  const towerPoint = (): Point => {
    // A point inside the footprint (the tower is a thin rectangle).
    const [[a, b, c]] = TOWER_FOOTPRINT.coordinates;
    const u = 0.15 + r() * 0.7;
    const v = 0.15 + r() * 0.7;
    return { type: "Point", coordinates: [a[0] + (c[0] - a[0]) * u, b[1] + (a[1] - b[1]) * v].map((x) => Math.round(x * 1e6) / 1e6) };
  };
  const moveIn = (p: Recipient, floor: number) => {
    p.location = towerPoint();
    p.locationAccuracyM = 10;
    p.areaLabel = towerArea(floor);
    p.building = { id: TOWER_ID, name: TOWER_NAME, floor };
  };

  // Residents of Tower A: Al Majaz residents outside the smoke area, nearest the tower first.
  const candidates = people
    .filter((p) => p.mobility === "resident" && p.locationStatus === "ok" && p.areaLabel.en.startsWith("Al Majaz") && !p.persona && p.id !== "RES-022" && !inSmoke(p))
    .sort((a, b) => turf.distance(at(a), TOWER_CENTER) - turf.distance(at(b), TOWER_CENTER))
    .slice(0, TOWER_RESIDENTS);
  for (const p of candidates) moveIn(p, 1 + Math.floor(r() * TOWER_FLOORS));

  const mariam = people.find((p) => p.id === "RES-014")!;
  moveIn(mariam, 19);
  const priya = people.find((p) => p.id === "RES-022")!;
  moveIn(priya, 6);

  // Simulated replies. Tower: most get out; some are still on the stairs; four are trapped.
  const residents = candidates;
  const above = residents.filter((p) => p.building!.floor! >= FIRE_FLOOR);
  let trapped = 0;
  for (const p of above) {
    if (trapped >= TRAPPED.length) break;
    const t = TRAPPED[trapped++];
    p.language = t.lang;
    p.vulnerability = t.vulnerability;
    p.sim = { kind: "help", situation: "trapped", floor: p.building!.floor!, delaySec: Math.round(8 + r() * 20), text: t.text(p.building!.floor!) };
  }
  let inside = 0;
  let silent = 0;
  for (const p of residents) {
    if (p.sim) continue;
    if (inside < STILL_INSIDE.length && r() < 0.18) {
      const t = STILL_INSIDE[inside++];
      p.language = t.lang;
      p.sim = { kind: "help", situation: "inside", floor: p.building!.floor!, delaySec: Math.round(6 + r() * 24), text: t.text(p.building!.floor!) };
    } else if (silent < 8 && r() < 0.16) {
      silent++;
      p.sim = { kind: "none", delaySec: 0 };
    } else p.sim = { kind: "safe", situation: "out", delaySec: Math.round(10 + r() * 50) };
  }

  // Smoke area: most confirm they are fine indoors; two need help; one asks a question.
  let smokeHelp = 0;
  let asked = false;
  for (const p of people.filter((x) => !x.building && x.mobility !== "driver" && inSmoke(x) && !x.persona)) {
    if (smokeHelp < SMOKE_HELP.length) {
      const t = SMOKE_HELP[smokeHelp++];
      p.language = t.lang;
      p.vulnerability = t.vulnerability;
      p.sim = { kind: "help", delaySec: Math.round(10 + r() * 20), text: t.text };
    } else if (!asked) {
      asked = true;
      p.sim = { kind: "clarify", delaySec: Math.round(12 + r() * 20), text: "Should we leave our building too?" };
    } else p.sim = { kind: r() < 0.15 ? "none" : "safe", delaySec: Math.round(5 + r() * 30) };
  }

  // Drivers heading to the closed road confirm they are safe (Daniel is the live persona).
  for (const p of people.filter((x) => x.mobility === "driver" && x.areaLabel.en.includes("approaching") && !x.persona)) {
    p.sim = { kind: "safe", delaySec: Math.round(4 + r() * 30) };
  }
  return people;
}
