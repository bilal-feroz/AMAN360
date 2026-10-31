import type { NextRequest } from "next/server";
import { z } from "zod";
import type { CopilotEvent } from "@/domain/copilot";
import { handler, rateLimit, requireOperator } from "@/server/http";
import { copilotStatus, runCopilot } from "@/server/copilot/run";

export const dynamic = "force-dynamic";

const Body = z.object({
  question: z.string().trim().min(1).max(500),
  lang: z.enum(["en", "ar"]),
  history: z
    .array(z.object({ q: z.string().max(500), a: z.string().max(1500) }))
    .max(6)
    .default([]),
});

export const GET = handler(async (req: NextRequest) => {
  requireOperator(req);
  return copilotStatus();
});

/** Streams generative-UI events (one JSON object per SSE `data:` line). Read-only: never changes state. */
export const POST = handler(async (req: NextRequest) => {
  const op = requireOperator(req);
  rateLimit(`copilot:${op.id}`, 10, 4);
  const body = Body.parse(await req.json());
  const encoder = new TextEncoder();
  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort());
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: CopilotEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          abort.abort();
        }
      };
      try {
        await runCopilot(body, emit, abort.signal);
      } catch (e) {
        console.error(e);
        emit({ t: "error", message: "Copilot failed" });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
});
