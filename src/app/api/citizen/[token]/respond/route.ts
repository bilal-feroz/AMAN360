import type { NextRequest } from "next/server";
import { z } from "zod";
import { clientKey, handler, rateLimit } from "@/server/http";
import { submitResponse } from "@/server/services/citizen";

type Ctx = { params: Promise<{ token: string }> };
const Body = z.object({
  kind: z.enum(["safe", "help", "clarify"]),
  messageId: z.string().max(80).optional(),
  text: z.string().max(500).nullable().optional(),
  questionId: z.string().max(40).nullable().optional(),
  idempotencyKey: z.string().min(8).max(80).optional(),
});

export const POST = handler(async (req: NextRequest, { params }: Ctx) => {
  const { token } = await params;
  rateLimit(`respond:${token.slice(0, 32)}`, 20, 8);
  rateLimit(`respond-ip:${clientKey(req)}`, 120, 30);
  const body = Body.parse(await req.json());
  const result = await submitResponse({ token, ...body, source: "citizen_live" });
  return {
    duplicate: result.duplicate,
    messageState: result.messageState,
    caseId: result.caseId,
    answer: result.answer,
    escalated: result.escalated,
    receivedAt: result.response.receivedAt,
  };
});
