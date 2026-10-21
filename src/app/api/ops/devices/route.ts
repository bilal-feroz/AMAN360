import type { NextRequest } from "next/server";
import { handler, requireOperator } from "@/server/http";
import * as store from "@/server/store";

export const dynamic = "force-dynamic";

/** Simulated citizen devices for the live demo (synthetic personas only). Operator-only: links carry access tokens. */
export const GET = handler(async (req: NextRequest) => {
  requireOperator(req);
  return {
    devices: store.recipients
      .all()
      .filter((r) => r.persona || r.id === "RES-022")
      .map((r) => ({
        id: r.id,
        displayName: r.displayName,
        language: r.language,
        mobility: r.mobility,
        persona: r.persona ?? "priya",
        areaLabel: r.areaLabel,
        accessibility: r.accessibility,
        token: r.token,
      })),
  };
});
