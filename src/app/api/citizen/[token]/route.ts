import type { NextRequest } from "next/server";
import { clientKey, handler, rateLimit } from "@/server/http";
import { citizenInbox } from "@/server/services/inbox";

type Ctx = { params: Promise<{ token: string }> };

export const dynamic = "force-dynamic";

export const GET = handler(async (req: NextRequest, { params }: Ctx) => {
  const { token } = await params;
  // Per-device limit (many demo phones can share one NAT/IP).
  rateLimit(`inbox:${token.slice(0, 32)}`, 240, 60);
  rateLimit(`inbox-ip:${clientKey(req)}`, 3000, 600);
  return citizenInbox(token);
});
