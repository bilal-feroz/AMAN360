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
    case "assessed":
    case "approved":
      // The Alert view holds the agent's "Ready to send" card and the one-tap send.
      return "queue";
    case "active":
      // In a building fire, accounting for the people still inside comes first.
      if (state.fireBoard && state.fireBoard.totals.trapped + state.fireBoard.totals.inside > 0) return "building";
      return state.metrics.cases.open > 0 ? "responses" : null;
    default:
      return null;
  }
}

/** Human names for the approved actions, so the UI never has to show their IDs up front. */
export const ACTION_LABEL: Record<string, { en: string; ar: string; audience: { en: string; ar: string } }> = {
  "ACT-INDOOR-01": { en: "Stay indoors", ar: "البقاء في الداخل", audience: { en: "Inside the zone", ar: "داخل المنطقة" } },
  "ACT-ROAD-02": { en: "Do not enter the closure", ar: "عدم دخول الطريق المغلق", audience: { en: "Drivers", ar: "السائقون" } },
  "ACT-FIRE-ABOVE": { en: "Leave by the stairs", ar: "المغادرة عبر الدرج", audience: { en: "Fire floor & above", ar: "طابق الحريق وما فوقه" } },
  "ACT-FIRE-BELOW": { en: "Leave calmly", ar: "المغادرة بهدوء", audience: { en: "Below the fire", ar: "تحت طابق الحريق" } },
  "ACT-FIRE-SMOKE": { en: "Keep windows closed", ar: "إبقاء النوافذ مغلقة", audience: { en: "Smoke area", ar: "منطقة الدخان" } },
  "ACT-FIRE-ROAD": { en: "Keep the road clear", ar: "إبقاء الطريق خاليًا", audience: { en: "Drivers", ar: "السائقون" } },
};

/** Colours for decision categories (people on the map and in lists). */
export const CATEGORY_TONE: Record<string, string> = {
  inside_zone: "bg-coral",
  fire_above: "bg-coral-ink",
  fire_below: "bg-coral",
  smoke_area: "bg-amber",
  approaching_closure: "bg-amber",
};
