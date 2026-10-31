import type { NextRequest } from "next/server";
import { z } from "zod";
import { handler, requireOperator } from "@/server/http";
import { networkSummary, setCellOutage } from "@/server/services/network";

export const dynamic = "force-dynamic";

/** Cell-outage drill: turn the simulated tower outage in the warning zone on or off. */
export const POST = handler(async (req: NextRequest) => {
  const op = requireOperator(req, "duty_officer");
  const body = z.object({ outage: z.boolean() }).parse(await req.json());
  setCellOutage(body.outage, op.id);
  return networkSummary();
});
