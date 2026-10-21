import type { NextRequest } from "next/server";
import { z } from "zod";
import { handler, requireOperator } from "@/server/http";
import { updateCase } from "@/server/services/cases";

type Ctx = { params: Promise<{ id: string }> };
const Body = z.object({ action: z.enum(["acknowledge", "follow_up", "resolve"]), note: z.string().max(600).optional() });

export const POST = handler(async (req: NextRequest, { params }: Ctx) => {
  const op = requireOperator(req, "duty_officer");
  const { id } = await params;
  const body = Body.parse(await req.json());
  return { case: updateCase(id, op.id, body.action, body.note) };
});
