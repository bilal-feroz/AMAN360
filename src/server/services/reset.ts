import "server-only";
import { createHash, createHmac } from "node:crypto";
import type { Recipient } from "@/domain/types";
import population from "@/scenario/population.json";
import { buildClosures, buildHazardGeometry, buildIncident, buildSourcePayload, INCIDENT_ID, SCENARIO_ID } from "@/scenario/scenario";
import { buildFireClosures, buildFireHazard, buildFireIncident, buildFirePayload, buildFireRecipients, FIRE_INCIDENT_ID, FIRE_SCENARIO_ID } from "@/scenario/fire";
import { db, getMeta, installationSecret, setMeta, tx } from "../db";
import { audit } from "../bus";
import * as store from "../store";
import { resetAutomation } from "./automation";
import { scenarioKind, type ScenarioKind } from "./active";

/** Opaque, unguessable citizen token, stable for this installation (HMAC of the recipient id). */
export function citizenToken(recipientId: string): string {
  return createHmac("sha256", installationSecret()).update(`citizen:${recipientId}`).digest("base64url").slice(0, 26);
}

/**
 * Restores a drill's documented baseline: a calm city with one verified-feed alert waiting.
 * `kind` picks the drill (heavy rainfall by default); omitted, the loaded drill is reset again.
 */
export function resetScenario(actor = "system", kind: ScenarioKind = getMeta("scenario_kind") ? scenarioKind() : "rain"): void {
  const now = new Date();
  const fire = kind === "fire";
  const incidentId = fire ? FIRE_INCIDENT_ID : INCIDENT_ID;
  const scenarioId = fire ? FIRE_SCENARIO_ID : SCENARIO_ID;
  tx(() => {
    store.wipeScenarioTables();
    const incident = fire ? buildFireIncident(now) : buildIncident(now);
    const payload = fire ? buildFirePayload(now) : buildSourcePayload(now);
    store.incidents.save(incident);
    store.hazards.save(fire ? buildFireHazard() : buildHazardGeometry());
    for (const c of fire ? buildFireClosures() : buildClosures()) store.closures.save(c);
    const raw = JSON.stringify(payload);
    db()
      .prepare("INSERT INTO hazard_sources (id, incident_id, feed, received_at, payload, checksum) VALUES (?, ?, ?, ?, ?, ?)")
      .run(`SRC-${payload.ref}`, incidentId, payload.feed, now.toISOString(), raw, createHash("sha256").update(raw).digest("hex"));
    const flood = (population as { recipients: Omit<Recipient, "token">[] }).recipients.map((p) => ({ ...p, token: citizenToken(p.id) }) as Recipient);
    for (const p of fire ? buildFireRecipients(flood) : flood) store.recipients.save(p);
    setMeta("scenario", scenarioId);
    setMeta("scenario_kind", kind);
    setMeta("reset_at", now.toISOString());
    setMeta("sim_speed", "1");
    setMeta("cell_outage", "0");
    audit(actor, "scenario.reset", `Training scenario reset to baseline (synthetic data): ${fire ? "tower fire" : "heavy rainfall"}`, { entity: scenarioId });
    audit(payload.feed, "source.ingested", `Simulated ${fire ? "Civil Defence" : "hazard"} feed ${payload.ref} received — awaiting verification`, {
      entity: incidentId,
      data: { feed: payload.feed, ref: payload.ref, severity: payload.severity },
    });
  });
  resetAutomation(incidentId);
}

export function ensureSeeded(): void {
  const row = db().prepare("SELECT COUNT(*) c FROM incidents").get() as { c: number };
  if (row.c === 0) resetScenario("system");
}
