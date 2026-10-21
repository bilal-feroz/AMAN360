import "server-only";
import { createHash, createHmac } from "node:crypto";
import type { Recipient } from "@/domain/types";
import population from "@/scenario/population.json";
import { buildClosures, buildHazardGeometry, buildIncident, buildSourcePayload, INCIDENT_ID, SCENARIO_ID } from "@/scenario/scenario";
import { db, installationSecret, setMeta, tx } from "../db";
import { audit } from "../bus";
import * as store from "../store";

/** Opaque, unguessable citizen token, stable for this installation (HMAC of the recipient id). */
export function citizenToken(recipientId: string): string {
  return createHmac("sha256", installationSecret()).update(`citizen:${recipientId}`).digest("base64url").slice(0, 26);
}

/** Restores the documented baseline: a calm city with one verified-feed alert waiting in the queue. */
export function resetScenario(actor = "system"): void {
  const now = new Date();
  tx(() => {
    store.wipeScenarioTables();
    const incident = buildIncident(now);
    const payload = buildSourcePayload(now);
    store.incidents.save(incident);
    store.hazards.save(buildHazardGeometry());
    for (const c of buildClosures()) store.closures.save(c);
    const raw = JSON.stringify(payload);
    db()
      .prepare("INSERT INTO hazard_sources (id, incident_id, feed, received_at, payload, checksum) VALUES (?, ?, ?, ?, ?, ?)")
      .run(`SRC-${payload.ref}`, INCIDENT_ID, payload.feed, now.toISOString(), raw, createHash("sha256").update(raw).digest("hex"));
    for (const p of (population as { recipients: Omit<Recipient, "token">[] }).recipients) {
      store.recipients.save({ ...p, token: citizenToken(p.id) } as Recipient);
    }
    setMeta("scenario", SCENARIO_ID);
    setMeta("reset_at", now.toISOString());
    setMeta("sim_speed", "1");
    audit(actor, "scenario.reset", "Training scenario reset to baseline (synthetic data)", { entity: SCENARIO_ID });
    audit("SIM-MET", "source.ingested", `Simulated hazard feed ${payload.ref} received — awaiting verification`, {
      entity: INCIDENT_ID,
      data: { feed: payload.feed, ref: payload.ref, severity: payload.severity },
    });
  });
}

export function ensureSeeded(): void {
  const row = db().prepare("SELECT COUNT(*) c FROM incidents").get() as { c: number };
  if (row.c === 0) resetScenario("system");
}
