import type { OpsState } from "@/lib/use-ops-state";
import type { PanelView } from "@/lib/ui-store";

/**
 * The single place that answers "what should the operator do next?" — drives the rail's
 * next-step marker and the incident pill in the top bar.
 */
export function nextView(state: OpsState | null): PanelView | null {
  if (!state) return null;
  switch (state.incident.state) {
    case "draft":
    case "blocked":
      return "queue";
    case "assessed":
    case "approved":
      // The Alert view holds the agent's "Ready to send" card and the one-tap send.
      return "queue";
    case "active":
      return state.metrics.cases.open > 0 ? "responses" : null;
    default:
      return null;
  }
}

/** Human names for the two approved actions, so the UI never has to show their IDs up front. */
export const ACTION_LABEL: Record<string, { en: string; ar: string; audience: { en: string; ar: string } }> = {
  "ACT-INDOOR-01": { en: "Stay indoors", ar: "البقاء في الداخل", audience: { en: "Inside the zone", ar: "داخل المنطقة" } },
  "ACT-ROAD-02": { en: "Do not enter the closure", ar: "عدم دخول الطريق المغلق", audience: { en: "Drivers", ar: "السائقون" } },
};
