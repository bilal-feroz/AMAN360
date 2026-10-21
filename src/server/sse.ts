import "server-only";
import type { NextRequest } from "next/server";
import { bus, currentVersion, type BusEvent } from "./bus";
import { processDue } from "./services/sim";

/** Server-Sent Events: pushes a change notification whenever any record changes. */
export function sseResponse(req: NextRequest, filter?: (e: BusEvent) => boolean) {
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          cleanup();
        }
      };
      send("hello", { version: currentVersion() });
      const onChange = (e: BusEvent) => {
        if (!filter || filter(e)) send("change", e);
      };
      bus.on("change", onChange);
      // The stream also drives the delivery/response simulator.
      const tick = setInterval(() => void processDue(), 400);
      const heartbeat = setInterval(() => send("ping", { version: currentVersion(), t: Date.now() }), 15_000);
      cleanup = () => {
        bus.off("change", onChange);
        clearInterval(tick);
        clearInterval(heartbeat);
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
