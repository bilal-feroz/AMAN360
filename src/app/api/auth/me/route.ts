import type { NextRequest } from "next/server";
import { OPERATORS } from "@/server/auth";
import { handler, requireOperator } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: NextRequest) => ({
  operator: requireOperator(req),
  operators: OPERATORS,
}));
