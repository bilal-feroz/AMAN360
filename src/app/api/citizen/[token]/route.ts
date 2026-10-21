import type { NextRequest } from "next/server";
import { clientKey, handler, rateLimit } from "@/server/http";
import { citizenInbox } from "@/server/services/inbox";

type Ctx = { params: Promise<{ token: string }> };

export const dynamic = "force-dynamic";

export const GET = handler(async (req: NextRequest, { params }: Ctx) => {
  const { token } = await params;
  rateLimit(`inbox:${clientKey(req)}`, 600, 120);
  return citizenInbox(token);
});
