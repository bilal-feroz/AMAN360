import type { NextRequest } from "next/server";
import { z } from "zod";
import { handler, HttpError, requireOperator } from "@/server/http";
import { approveGuidance, assessImpact, injectConflict, prepareGuidance, publish, resolveIncident, verifySource } from "@/server/services/workflow";

type Ctx = { params: Promise<{ id: string; action: string }> };
const Body = z.object({ note: z.string().max(500).optional() }).optional();

export const POST = handler(async (req: NextRequest, { params }: Ctx) => {
  const { id, action } = await params;
  const op = requireOperator(req, "duty_officer");
  const body = Body.parse(await req.json().catch(() => undefined));
  switch (action) {
    case "verify":
      return { incident: verifySource(id, op.id) };
    case "assess":
      return { summary: assessImpact(id, op.id).summary };
    case "activate": {
      // Activation = source verification followed by geographic assessment (two audited steps).
      const incident = verifySource(id, op.id);
      if (incident.verification.status !== "verified") return { incident, summary: null };
      return { incident, summary: assessImpact(id, op.id).summary };
    }
    case "prepare":
      return { guidance: await prepareGuidance(id, op.id) };
    case "approve":
      approveGuidance(id, op.id, body?.note);
      return { ok: true };
    case "publish":
      return publish(id, op.id);
    case "resolve":
      resolveIncident(id, op.id);
      return { ok: true };
    case "conflict":
      injectConflict(id, op.id);
      return { ok: true };
    default:
      throw new HttpError(404, "Unknown action");
  }
});
