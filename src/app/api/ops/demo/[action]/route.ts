import type { NextRequest } from "next/server";
import { z } from "zod";
import { setMeta } from "@/server/db";
import { audit } from "@/server/bus";
import { handler, HttpError, requireOperator } from "@/server/http";
import { resetScenario } from "@/server/services/reset";
import { fastForward } from "@/server/services/sim";
import { approveGuidance, injectConflict, prepareGuidance, publish, assessImpact, verifySource } from "@/server/services/workflow";
import { INCIDENT_ID } from "@/scenario/scenario";
import { FIRE_INCIDENT_ID } from "@/scenario/fire";

/** Scenario presets — each is produced by running the real workflow, never by writing numbers. */
const PRESETS = ["rain-baseline", "rain-conflict-drill", "rain-responses-complete", "fire-baseline", "fire-responses-complete"] as const;

type Ctx = { params: Promise<{ action: string }> };

export const POST = handler(async (req: NextRequest, { params }: Ctx) => {
  const op = requireOperator(req, "duty_officer");
  const { action } = await params;
  if (action === "reset") {
    resetScenario(op.id);
    return { ok: true };
  }
  if (action === "fast-forward") return { processed: await fastForward() };
  if (action === "scenario") {
    const { id } = z.object({ id: z.enum(PRESETS) }).parse(await req.json());
    const fire = id.startsWith("fire-");
    const incidentId = fire ? FIRE_INCIDENT_ID : INCIDENT_ID;
    resetScenario(op.id, fire ? "fire" : "rain");
    if (id === "rain-conflict-drill") {
      // A second (simulated) feed disagrees on severity: the gate must block everything downstream.
      injectConflict(incidentId, op.id);
    }
    if (id.endsWith("-responses-complete")) {
      verifySource(incidentId, op.id);
      assessImpact(incidentId, op.id);
      await prepareGuidance(incidentId, op.id);
      approveGuidance(incidentId, op.id, "Preset: responses-complete checkpoint");
      publish(incidentId, op.id);
      await fastForward();
    }
    audit(op.id, "scenario.loaded", `Scenario preset loaded: ${id}`);
    return { ok: true };
  }
  if (action === "speed") {
    const { speed } = z.object({ speed: z.number().min(0.25).max(8) }).parse(await req.json());
    setMeta("sim_speed", String(speed));
    audit(op.id, "simulation.speed", `Simulation speed set to ${speed}×`);
    return { ok: true };
  }
  throw new HttpError(404, "Unknown demo action");
});
