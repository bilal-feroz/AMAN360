import type {
  ActionVariant,
  DecisionTrace,
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
  };
  for (const t of traces) {
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
