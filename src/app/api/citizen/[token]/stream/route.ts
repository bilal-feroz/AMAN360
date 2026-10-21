import type { NextRequest } from "next/server";
import { handler } from "@/server/http";
import { recipientForToken } from "@/server/services/citizen";
import { sseResponse } from "@/server/sse";

type Ctx = { params: Promise<{ token: string }> };

export const dynamic = "force-dynamic";

const RELEVANT = new Set(["scenario.reset", "messages.issued", "delivery.progress", "case.acknowledge", "case.follow_up", "case.resolve", "review.resolved", "incident.resolved"]);

/** Citizen devices receive change notifications only (no data); they re-fetch their own inbox. */
export const GET = handler(async (req: NextRequest, { params }: Ctx) => {
  const { token } = await params;
  recipientForToken(token);
  return sseResponse(req, (e) => RELEVANT.has(e.type) || e.type.startsWith("response."));
});
