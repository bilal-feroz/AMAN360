import type { NextRequest } from "next/server";
import { z } from "zod";
import { handler, requireOperator } from "@/server/http";
import { resolveReview } from "@/server/services/cases";

type Ctx = { params: Promise<{ id: string }> };
const Body = z.object({ resolution: z.string().min(1).max(600) });

export const POST = handler(async (req: NextRequest, { params }: Ctx) => {
  const op = requireOperator(req, "duty_officer");
  const { id } = await params;
  resolveReview(id, op.id, Body.parse(await req.json()).resolution);
  return { ok: true };
});
