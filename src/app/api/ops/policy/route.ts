import type { NextRequest } from "next/server";
import { z } from "zod";
import { handler, requireOperator } from "@/server/http";
import { setAutomationPolicy } from "@/server/services/automation";
import { INCIDENT_ID } from "@/scenario/scenario";

const Body = z.object({ autoPrepare: z.boolean().optional(), autoSend: z.boolean().optional() });

/** Automation policy: agent auto-prepare, and the pre-authorised auto-send (duty officer only). */
export const POST = handler(async (req: NextRequest) => {
  const op = requireOperator(req, "duty_officer");
  await setAutomationPolicy(INCIDENT_ID, op.id, Body.parse(await req.json()));
  return { ok: true };
});
