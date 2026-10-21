import type { NextRequest } from "next/server";
import { handler, requireOperator } from "@/server/http";
import { sseResponse } from "@/server/sse";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: NextRequest) => {
  requireOperator(req);
  return sseResponse(req);
});
