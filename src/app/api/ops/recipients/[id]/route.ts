import type { NextRequest } from "next/server";
import { handler, HttpError, requireOperator } from "@/server/http";
import { recipientChain } from "@/server/services/explain";

type Ctx = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export const GET = handler(async (req: NextRequest, { params }: Ctx) => {
  requireOperator(req);
  const { id } = await params;
  const chain = recipientChain(id);
  if (!chain) throw new HttpError(404, "Recipient not found");
  return chain;
});
