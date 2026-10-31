import type { NextRequest } from "next/server";
import { z } from "zod";
import { clientKey, handler, rateLimit } from "@/server/http";
import { receiveSms, smsThread } from "@/server/services/sms";

type Ctx = { params: Promise<{ token: string }> };

export const dynamic = "force-dynamic";

/** The SMS thread on a simulated basic phone. */
export const GET = handler(async (req: NextRequest, { params }: Ctx) => {
  const { token } = await params;
  rateLimit(`sms:${token.slice(0, 32)}`, 240, 60);
  rateLimit(`sms-ip:${clientKey(req)}`, 3000, 600);
  return smsThread(token);
});

const Body = z.object({ text: z.string().min(1).max(480) });

/**
 * Inbound SMS from the simulated gateway. In production this is the SMS provider's webhook, with
 * the sender's number in place of the access token.
 */
export const POST = handler(async (req: NextRequest, { params }: Ctx) => {
  const { token } = await params;
  rateLimit(`sms-in:${token.slice(0, 32)}`, 20, 8);
  rateLimit(`sms-in-ip:${clientKey(req)}`, 120, 30);
  const body = Body.parse(await req.json());
  return receiveSms(token, body.text);
});
