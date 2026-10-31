import type { NextRequest } from "next/server";
import { z } from "zod";
import { handler, rateLimit, requireOperator } from "@/server/http";
import { dismissSignal, issueClarification, reanalyse, requestVerification, signalsView } from "@/server/signals/service";

export const dynamic = "force-dynamic";

const Dataset = z.enum(["scenario", "replay"]);

/** Social intelligence for one dataset (read-only). */
export const GET = handler(async (req: NextRequest) => {
  requireOperator(req);
  const dataset = Dataset.parse(req.nextUrl.searchParams.get("dataset") ?? "scenario");
  return signalsView(dataset, req.nextUrl.searchParams.get("at"));
});

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("request_verification"), dataset: Dataset, targetId: z.string().max(80) }),
  z.object({ action: z.literal("issue_clarification"), dataset: Dataset, targetId: z.string().max(80) }),
  z.object({ action: z.literal("dismiss"), dataset: Dataset, targetId: z.string().max(80) }),
  z.object({ action: z.literal("reanalyse"), dataset: Dataset, targetId: z.string().max(80) }),
]);

export const POST = handler(async (req: NextRequest) => {
  const body = Action.parse(await req.json());
  if (body.action === "reanalyse") {
    // Reading a post again changes nothing operational, so analysts may do it too.
    const op = requireOperator(req);
    rateLimit(`reanalyse:${op.id}`, 6, 3);
    return reanalyse(body.dataset, body.targetId, op.id);
  }
  const op = requireOperator(req, "duty_officer");
  if (body.action === "request_verification") requestVerification(body.dataset, body.targetId, op.id);
  else if (body.action === "issue_clarification") issueClarification(body.dataset, body.targetId, op.id);
  else dismissSignal(body.dataset, body.targetId, op.id);
  return { ok: true };
});
