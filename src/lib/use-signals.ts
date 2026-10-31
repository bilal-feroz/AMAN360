"use client";
import { create } from "zustand";
import { useEffect } from "react";
import type { SignalsView } from "@/server/signals/service";
import { api } from "./api";
import { useUi, type SignalDatasetId } from "./ui-store";

export type { SignalsView };
export type SignalItemView = SignalsView["items"][number];
export type HotspotView = SignalsView["hotspots"][number];

interface SignalsStore {
  views: Partial<Record<SignalDatasetId, SignalsView>>;
  loading: Partial<Record<SignalDatasetId, boolean>>;
  error: string | null;
  load: (d: SignalDatasetId) => Promise<void>;
}

export const useSignalsStore = create<SignalsStore>((set, get) => ({
  views: {},
  loading: {},
  error: null,
  load: async (d) => {
    if (get().loading[d]) return;
    set((s) => ({ loading: { ...s.loading, [d]: true } }));
    try {
      const at = useUi.getState().viewAt;
      const v = await api<SignalsView>(`/api/ops/signals?dataset=${d}${at ? `&at=${encodeURIComponent(at)}` : ""}`);
      set((s) => ({ views: { ...s.views, [d]: v }, error: null }));
    } catch (e) {
      set({ error: (e as Error).message });
    } finally {
      set((s) => ({ loading: { ...s.loading, [d]: false } }));
    }
  },
}));

/**
 * Keeps the signals view fresh while the panel is open. The live scenario reloads on every
 * operations-state version (posts arrive on the scenario clock); the real-world replay is static
 * apart from operator actions, which reload it themselves.
 */
export function useSignalsSync(version: number | undefined) {
  const view = useUi((s) => s.view);
  const dataset = useUi((s) => s.signals.dataset);
  const viewAt = useUi((s) => s.viewAt);
  const load = useSignalsStore((s) => s.load);
  const tick = dataset === "scenario" ? version : 0;
  useEffect(() => {
    if (view !== "signals") return;
    void load(dataset);
  }, [view, dataset, tick, viewAt, load]);
}

export function signalAction(action: "request_verification" | "issue_clarification" | "dismiss" | "reanalyse", dataset: SignalDatasetId, targetId: string) {
  return api<unknown>("/api/ops/signals", { json: { action, dataset, targetId } });
}
