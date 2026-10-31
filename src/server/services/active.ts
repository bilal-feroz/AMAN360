import "server-only";
import type { SafetyPolicy } from "@/domain/types";
import { INCIDENT_ID } from "@/scenario/scenario";
import { FIRE_INCIDENT_ID } from "@/scenario/fire";
import { policyByVersion } from "@/scenario/policy";
import { getMeta } from "../db";

/** Which training drill is loaded: the heavy-rainfall flood (default) or the tower fire. */
export type ScenarioKind = "rain" | "fire";

export function scenarioKind(): ScenarioKind {
  return getMeta("scenario_kind") === "fire" ? "fire" : "rain";
}

/** The one incident the command center works on — the loaded drill's. */
export function activeIncidentId(): string {
  return scenarioKind() === "fire" ? FIRE_INCIDENT_ID : INCIDENT_ID;
}

/** The versioned policy an incident was issued under. */
export function policyFor(incident: { policyVersion: string }): SafetyPolicy {
  return policyByVersion(incident.policyVersion);
}
