import type { NextRequest } from "next/server";
import { z } from "zod";
import { setMeta } from "@/server/db";
import { audit } from "@/server/bus";
import { handler, HttpError, requireOperator } from "@/server/http";
import { resetScenario } from "@/server/services/reset";
import { fastForward } from "@/server/services/sim";

type Ctx = { params: Promise<{ action: string }> };

export const POST = handler(async (req: NextRequest, { params }: Ctx) => {
  const op = requireOperator(req, "duty_officer");
  const { action } = await params;
  if (action === "reset") {
    resetScenario(op.id);
    return { ok: true };
  }
  if (action === "fast-forward") return { processed: await fastForward() };
  if (action === "speed") {
    const { speed } = z.object({ speed: z.number().min(0.25).max(8) }).parse(await req.json());
    setMeta("sim_speed", String(speed));
    audit(op.id, "simulation.speed", `Simulation speed set to ${speed}×`);
    return { ok: true };
  }
  throw new HttpError(404, "Unknown demo action");
});
