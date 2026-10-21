import geometry from "./geometry.json";
import type { HazardGeometry, Incident, RoadClosure, Bilingual } from "@/domain/types";
import { POLICY_VERSION } from "./policy";
import type { LineString, Polygon } from "geojson";

export const SCENARIO_ID = "SCN-SHJ-RAIN-01";
export const INCIDENT_ID = "EVT-RAIN-001";

export const SCENARIO_LABEL: Bilingual = {
  en: "TRAINING SCENARIO — SYNTHETIC DATA",
  ar: "سيناريو تدريبي — بيانات اصطناعية",
};

export const SIM_AGENCIES = {
  met: {
    id: "SIM-MET",
    name: { en: "Simulated Meteorological Feed (mock)", ar: "موجز أرصاد جوية محاكى (تجريبي)" },
  },
  roads: {
    id: "SIM-ROADS",
    name: { en: "Simulated Roads & Traffic Feed (mock)", ar: "موجز طرق ومرور محاكى (تجريبي)" },
  },
} as const;

export const ZONE_NAME: Bilingual = {
  en: "Al Majaz — blocks between Jamal Abdul Naser St and Al Wahda St",
  ar: "المجاز — المربعات الواقعة بين شارع جمال عبد الناصر وشارع الوحدة",
};

export const CLOSURE_NAME: Bilingual = {
  en: "Al Wahda Street near Al Majaz (both directions)",
  ar: "شارع الوحدة بالقرب من المجاز (بالاتجاهين)",
};

/** Raw payload as it would arrive from the (simulated) hazard feed. */
export function buildSourcePayload(now: Date) {
  const issued = new Date(now.getTime() - 4 * 60_000);
  const until = new Date(now.getTime() + 6 * 3600_000);
  return {
    feed: SIM_AGENCIES.met.id,
    ref: "SIM-MET/2026/HR-0412",
    category: "flood_risk_heavy_rain",
    severity: "warning" as const,
    issuedAt: issued.toISOString(),
    validFrom: issued.toISOString(),
    validUntil: until.toISOString(),
    area: ZONE_NAME,
    geometry: geometry.hazardZone as Polygon,
    signature: "sim-ed25519:valid",
    closures: [
      { id: "RC-WAHDA-NE", feed: SIM_AGENCIES.roads.id, confirmed: true },
      { id: "RC-WAHDA-SW", feed: SIM_AGENCIES.roads.id, confirmed: true },
    ],
  };
}

export function buildIncident(now: Date): Incident {
  const p = buildSourcePayload(now);
  const iso = now.toISOString();
  return {
    id: INCIDENT_ID,
    scenarioId: SCENARIO_ID,
    title: {
      en: "Heavy rainfall — localized flood risk and road closure",
      ar: "أمطار غزيرة — خطر فيضان موضعي وإغلاق طريق",
    },
    summary: {
      en: "Verified simulated alert: heavy rainfall is causing a localized flood risk in Al Majaz. Al Wahda Street is closed in both directions near the affected blocks.",
      ar: "تنبيه محاكى مؤكَّد: تتسبّب الأمطار الغزيرة في خطر فيضان موضعي في منطقة المجاز، مع إغلاق شارع الوحدة بالاتجاهين بالقرب من المربعات المتأثرة.",
    },
    hazardCategory: "flood_risk_heavy_rain",
    sourceAgency: { id: SIM_AGENCIES.met.id, name: SIM_AGENCIES.met.name, simulated: true },
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
    policyVersion: POLICY_VERSION,
    approvedActionIds: ["ACT-INDOOR-01", "ACT-ROAD-02"],
    state: "draft",
    areaName: ZONE_NAME,
    conflicts: [],
    createdAt: iso,
    updatedAt: iso,
  };
}

export function buildHazardGeometry(): HazardGeometry {
  return {
    id: "HZ-RAIN-001-A",
    incidentId: INCIDENT_ID,
    kind: "affected_zone",
    name: ZONE_NAME,
    geometry: geometry.hazardZone as Polygon,
    sourceAgency: SIM_AGENCIES.met.id,
  };
}

export function buildClosures(): RoadClosure[] {
  return [
    {
      id: "RC-WAHDA-NE",
      incidentId: INCIDENT_ID,
      name: CLOSURE_NAME,
      direction: { en: "North-east bound", ar: "باتجاه الشمال الشرقي" },
      sourceAgency: SIM_AGENCIES.roads.id,
      confirmed: true,
      geometry: geometry.closures["RC-WAHDA-NE"] as LineString,
      approvedDiversions: [],
    },
    {
      id: "RC-WAHDA-SW",
      incidentId: INCIDENT_ID,
      name: CLOSURE_NAME,
      direction: { en: "South-west bound", ar: "باتجاه الجنوب الغربي" },
      sourceAgency: SIM_AGENCIES.roads.id,
      confirmed: true,
      geometry: geometry.closures["RC-WAHDA-SW"] as LineString,
      approvedDiversions: [],
    },
  ];
}

export const CORRIDORS = geometry.corridors as Record<string, LineString>;
export const HAZARD_POLYGON = geometry.hazardZone as Polygon;

/** Camera anchors used by the command center (lng, lat). */
export const PLACES = {
  sharjah: { center: [55.3925, 25.3463] as [number, number] },
  alMajaz: { center: [55.3872, 25.3262] as [number, number] },
  zone: { center: [55.3893, 25.3238] as [number, number] },
  closure: { center: [55.3903, 25.3228] as [number, number] },
  fountain: { center: [55.3871, 25.3279] as [number, number] },
};
