import type { NextRequest } from "next/server";
import { handler, requireOperator } from "@/server/http";
import { getOpsState } from "@/server/services/state";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: NextRequest) => {
  requireOperator(req);
  const at = req.nextUrl.searchParams.get("at");
  return getOpsState(at && !Number.isNaN(Date.parse(at)) ? at : null);
});
