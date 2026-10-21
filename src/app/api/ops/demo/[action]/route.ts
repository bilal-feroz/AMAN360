import type { NextRequest } from "next/server";
import { z } from "zod";
import { setMeta } from "@/server/db";
import { audit } from "@/server/bus";
import { handler, HttpError, requireOperator } from "@/server/http";
import { resetScenario } from "@/server/services/reset";
import { fastForward } from "@/server/services/sim";
import { approveGuidance, injectConflict, prepareGuidance, publish, assessImpact, verifySource } from "@/server/services/workflow";
import { INCIDENT_ID } from "@/scenario/scenario";

/** Scenario presets — each is produced by running the real workflow, never by writing numbers. */
const PRESETS = ["rain-baseline", "rain-conflict-drill", "rain-responses-complete"] as const;

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
    resetScenario(op.id);
    if (id === "rain-conflict-drill") {
      // A second (simulated) feed disagrees on severity: the gate must block everything downstream.
      injectConflict(INCIDENT_ID, op.id);
    }
    if (id === "rain-responses-complete") {
      verifySource(INCIDENT_ID, op.id);
      assessImpact(INCIDENT_ID, op.id);
      await prepareGuidance(INCIDENT_ID, op.id);
      approveGuidance(INCIDENT_ID, op.id, "Preset: responses-complete checkpoint");
      publish(INCIDENT_ID, op.id);
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
