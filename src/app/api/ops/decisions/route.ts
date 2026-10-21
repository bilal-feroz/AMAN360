import type { NextRequest } from "next/server";
import { handler, requireOperator } from "@/server/http";
import { decisionTable } from "@/server/services/explain";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: NextRequest) => {
  requireOperator(req);
  return { rows: decisionTable() };
});
