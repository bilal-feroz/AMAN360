import type {
  ActionVariant,
  DecisionTrace,
  FireDetails,
  HazardGeometry,
  Incident,
  Recipient,
  RoadClosure,
  SafetyPolicy,
} from "./types";
import { assertValidLine, assertValidZone, evaluateGeo, GeometryError } from "./geo";

/**
 * The deterministic safety decision engine.
 *
 * This module is intentionally non-generative: given verified facts, a versioned policy and a
 * recipient profile, it returns exactly one rule outcome with a full trace. No language model is
 * consulted here, and nothing downstream can change the selected action.
 */

export interface GateResult {
  ok: boolean;
  blocks: { ruleId: string; reason: string }[];
}

/** Incident-level gate: verification, conflicts, expiry and geometry validity. Fail-closed. */
export function checkIncidentGate(
  incident: Incident,
  policy: SafetyPolicy,
  hazard: HazardGeometry | null,
  closures: RoadClosure[],
  now: Date,
): GateResult {
  const blocks: GateResult["blocks"] = [];
  if (incident.verification.status !== "verified" || !incident.verification.signatureValid) {
    blocks.push({ ruleId: "R-00-VERIFY", reason: `Source verification status is "${incident.verification.status}"` });
  }
  if (incident.conflicts.length > 0) {
    blocks.push({ ruleId: "R-01-CONFLICT", reason: `Conflicting facts: ${incident.conflicts.join("; ")}` });
  }
  if (new Date(incident.validUntil).getTime() <= now.getTime()) {
    blocks.push({ ruleId: "R-02-EXPIRED", reason: `Incident expired at ${incident.validUntil}` });
  }
  if (policy.status !== "active" || new Date(policy.expiresAt).getTime() <= now.getTime()) {
    blocks.push({ ruleId: "R-02-EXPIRED", reason: `Policy ${policy.version} is not active or has expired` });
  }
  if (new Date(policy.effectiveFrom).getTime() > now.getTime()) {
    blocks.push({ ruleId: "R-02-EXPIRED", reason: `Policy ${policy.version} is not yet in effect` });
  }
  if (incident.policyVersion !== policy.version) {
    blocks.push({ ruleId: "R-01-CONFLICT", reason: `Incident references ${incident.policyVersion}, active policy is ${policy.version}` });
  }
  // A building fire: AMAN only relays an authority instruction it has approved wording for.
  if (incident.fire && !(policy.approvedInstructionModes ?? []).includes(incident.fire.instruction)) {
    blocks.push({ ruleId: "R-03-MODE", reason: `No approved guidance for the authority instruction "${incident.fire.instruction}"` });
  }
  if (!hazard) {
    blocks.push({ ruleId: "R-01-CONFLICT", reason: "Missing verified hazard geometry" });
  } else {
    try {
      assertValidZone(hazard.geometry);
    } catch (e) {
      blocks.push({ ruleId: "R-01-CONFLICT", reason: `Invalid hazard geometry: ${(e as Error).message}` });
    }
  }
  for (const c of closures) {
    try {
      assertValidLine(c.geometry);
    } catch (e) {
      blocks.push({ ruleId: "R-01-CONFLICT", reason: `Invalid closure ${c.id}: ${(e as Error).message}` });
    }
    if (c.approvedDiversions.some((d) => !d.approvedBy)) {
      blocks.push({ ruleId: "R-01-CONFLICT", reason: `Closure ${c.id} has a diversion without an approval record` });
    }
  }
  return { ok: blocks.length === 0, blocks };
}

export function selectVariant(r: Pick<Recipient, "accessibility">): ActionVariant {
  if (r.accessibility.audio || r.accessibility.screenReader) return "audio";
  if (r.accessibility.plainLanguage) return "plain";
  return "standard";
}

export interface EngineContext {
  incident: Incident;
  policy: SafetyPolicy;
  hazard: HazardGeometry;
  closures: RoadClosure[];
  now: Date;
}

export function decide(recipient: Recipient, ctx: EngineContext, gate?: GateResult): DecisionTrace {
  const { incident, policy, hazard, closures, now } = ctx;
  const g = gate ?? checkIncidentGate(incident, policy, hazard, closures, now);
  const variant = selectVariant(recipient);
  const base = {
    recipientId: recipient.id,
    incidentId: incident.id,
    policyVersion: policy.version,
    language: recipient.language,
    variant,
    evaluatedAt: now.toISOString(),
  };
  const facts: DecisionTrace["factsUsed"] = [
    { label: "Hazard category", value: incident.hazardCategory, source: incident.sourceAgency.id },
    { label: "Severity (approved)", value: incident.severity, source: incident.sourceAgency.id },
    { label: "Verification", value: incident.verification.status, source: incident.verification.method },
    { label: "Valid until", value: incident.validUntil, source: incident.sourceRef },
    { label: "Hazard geometry", value: hazard.id, source: hazard.sourceAgency },
    ...closures.filter((c) => c.confirmed).map((c) => ({ label: "Confirmed closure", value: c.id, source: c.sourceAgency })),
  ];

  if (!g.ok) {
    return {
      ...base,
      ruleId: g.blocks[0].ruleId,
      outcome: "BLOCK",
      actionId: null,
      checks: evaluateGeo({ location: null, locationStatus: "missing", locationAccuracyM: 0, route: null }, geoCtx(ctx)),
      factsUsed: facts,
      reasons: g.blocks.map((b) => `${b.ruleId}: ${b.reason}`),
      category: "blocked",
    };
  }

  let checks;
  try {
    checks = evaluateGeo(recipient, geoCtx(ctx));
  } catch (e) {
    if (!(e instanceof GeometryError)) throw e;
    checks = evaluateGeo({ location: null, locationStatus: "invalid", locationAccuracyM: 0, route: null }, geoCtx(ctx));
  }

  if (!checks.locationUsable) {
    return {
      ...base,
      ruleId: "R-10-NOLOC",
      outcome: "REVIEW",
      actionId: null,
      checks,
      factsUsed: facts,
      reasons: [`Location status "${recipient.locationStatus}" — impact cannot be determined without inference`],
      category: "needs_review",
    };
  }

  if (incident.fire) return decideFire(recipient, incident.fire, checks, base, facts);

  if (checks.insideZone) {
    const why = checks.onBoundary
      ? "Location lies on the verified zone boundary (counted as inside)"
      : checks.withinUncertainty
        ? `Location is ${checks.distanceToZoneM} m outside the boundary, within location uncertainty (precautionary inclusion)`
        : "Location intersects the verified hazard polygon";
    return {
      ...base,
      ruleId: "R-20-ZONE",
      outcome: "SEND",
      actionId: "ACT-INDOOR-01",
      checks,
      factsUsed: facts,
      reasons: [why],
      category: "inside_zone",
    };
  }

  if (checks.routeIntersectsClosure && recipient.mobility === "driver") {
    return {
      ...base,
      ruleId: "R-30-CLOSURE",
      outcome: "SEND",
      actionId: "ACT-ROAD-02",
      checks,
      factsUsed: facts,
      reasons: [
        `Shared route crosses confirmed closure ${checks.nearestClosureId} (${checks.distanceToClosureM} m ahead)`,
        "No approved diversion exists — guidance must not suggest an alternative route",
      ],
      category: "approaching_closure",
    };
  }

  return {
    ...base,
    ruleId: "R-90-OUTSIDE",
    outcome: "NO_ACTION",
    actionId: null,
    checks,
    factsUsed: facts,
    reasons: [
      `Outside the verified zone (${checks.distanceToZoneM} m from boundary)` +
        (recipient.route ? "; shared route does not cross a confirmed closure" : ""),
    ],
    category: "outside",
  };
}

/**
 * Building fire (POLICY-2026-02). Order matters: the building first (floor decides the message),
 * then drivers heading for the closed access road, then people in the smoke area. A resident of
 * the building whose floor is unknown gets the fire-floor message — the precautionary one.
 */
function decideFire(
  recipient: Recipient,
  fire: FireDetails,
  checks: DecisionTrace["checks"],
  base: Pick<DecisionTrace, "recipientId" | "incidentId" | "policyVersion" | "language" | "variant" | "evaluatedAt">,
  facts: DecisionTrace["factsUsed"],
): DecisionTrace {
  const send = (ruleId: string, actionId: string, category: DecisionTrace["category"], reasons: string[]): DecisionTrace => ({
    ...base,
    ruleId,
    outcome: "SEND",
    actionId,
    checks,
    factsUsed: [...facts, { label: "Building", value: fire.buildingId, source: base.incidentId }, { label: "Fire floor", value: String(fire.fireFloor), source: base.incidentId }],
    reasons,
    category,
  });
  const home = recipient.building?.id === fire.buildingId ? recipient.building : null;
  if (home) {
    if (home.floor === null) return send("R-40-FIRE-ABOVE", "ACT-FIRE-ABOVE", "fire_above", ["Lives in the building; floor unknown — precautionary fire-floor guidance"]);
    if (home.floor >= fire.fireFloor) {
      return send("R-40-FIRE-ABOVE", "ACT-FIRE-ABOVE", "fire_above", [
        home.floor === fire.fireFloor ? `Lives on the fire floor (${home.floor})` : `Lives on floor ${home.floor}, above the fire on floor ${fire.fireFloor}`,
      ]);
    }
    return send("R-41-FIRE-BELOW", "ACT-FIRE-BELOW", "fire_below", [`Lives on floor ${home.floor}, below the fire on floor ${fire.fireFloor}`]);
  }
  if (recipient.mobility === "driver") {
    if (checks.routeIntersectsClosure) {
      return send("R-43-ACCESS", "ACT-FIRE-ROAD", "approaching_closure", [
        `Shared route crosses ${checks.nearestClosureId}, closed for Civil Defence access (${checks.distanceToClosureM} m ahead)`,
        "No approved diversion exists — guidance must not suggest an alternative route",
      ]);
    }
  } else if (checks.insideZone) {
    return send("R-42-SMOKE", "ACT-FIRE-SMOKE", "smoke_area", [checks.onBoundary || checks.withinUncertainty ? "On the edge of the verified smoke area (precautionary inclusion)" : "Inside the verified smoke area downwind of the building"]);
  }
  return {
    ...base,
    ruleId: "R-90-OUTSIDE",
    outcome: "NO_ACTION",
    actionId: null,
    checks,
    factsUsed: facts,
    reasons: [`Not in the building, not in the smoke area${recipient.mobility === "driver" ? " and not heading for the closed road" : ""}`],
    category: "outside",
  };
}

function geoCtx(ctx: EngineContext) {
  return {
    zone: ctx.hazard.geometry,
    closures: ctx.closures,
    boundaryUncertaintyM: ctx.policy.boundaryUncertaintyMeters,
    closureApproachM: ctx.policy.closureApproachMeters,
  };
}

export interface AssessmentSummary {
  total: number;
  send: number;
  insideZone: number;
  approachingClosure: number;
  outside: number;
  review: number;
  blocked: number;
  byAction: Record<string, number>;
  byLanguage: Record<string, number>;
  byVariant: Record<string, number>;
  /** Every decision category, including the fire ones (fire_above, fire_below, smoke_area). */
  byCategory: Record<string, number>;
}

export function assess(recipients: Recipient[], ctx: EngineContext) {
  const gate = checkIncidentGate(ctx.incident, ctx.policy, ctx.hazard, ctx.closures, ctx.now);
  const traces = recipients.map((r) => decide(r, ctx, gate));
  const summary: AssessmentSummary = {
    total: traces.length,
    send: 0,
    insideZone: 0,
    approachingClosure: 0,
    outside: 0,
    review: 0,
    blocked: 0,
    byAction: {},
    byLanguage: {},
    byVariant: {},
    byCategory: {},
  };
  for (const t of traces) {
    summary.byCategory[t.category] = (summary.byCategory[t.category] ?? 0) + 1;
    if (t.outcome === "SEND") {
      summary.send++;
      summary.byAction[t.actionId!] = (summary.byAction[t.actionId!] ?? 0) + 1;
      summary.byLanguage[t.language] = (summary.byLanguage[t.language] ?? 0) + 1;
      summary.byVariant[t.variant] = (summary.byVariant[t.variant] ?? 0) + 1;
    }
    if (t.category === "inside_zone") summary.insideZone++;
    if (t.category === "approaching_closure") summary.approachingClosure++;
    if (t.category === "outside") summary.outside++;
    if (t.category === "needs_review") summary.review++;
    if (t.category === "blocked") summary.blocked++;
  }
  return { gate, traces, summary };
}
