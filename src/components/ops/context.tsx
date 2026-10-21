"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { OpsState } from "@/lib/use-ops-state";
import { t as translate, type DictKey, type Lang } from "@/lib/i18n";
import { api, ApiError, demoAction, opsAction } from "@/lib/api";
import type { Operator } from "@/server/auth";

interface OpsCtx {
  state: OpsState | null;
  lang: Lang;
  t: (k: DictKey) => string;
  L: <T>(v: { en: T; ar: T }) => T;
  operator: Operator;
  canAct: boolean;
  busy: string | null;
  error: string | null;
  clearError: () => void;
  run: (key: string, fn: () => Promise<unknown>) => Promise<boolean>;
  incidentAction: (action: string, json?: unknown) => Promise<boolean>;
  demo: (action: string, json?: unknown) => Promise<boolean>;
  caseAction: (id: string, action: "acknowledge" | "follow_up" | "resolve", note?: string) => Promise<boolean>;
  reviewAction: (id: string, resolution: string) => Promise<boolean>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<OpsCtx | null>(null);

export function OpsProvider({
  state,
  lang,
  operator,
  refresh,
  children,
}: {
  state: OpsState | null;
  lang: Lang;
  operator: Operator;
  refresh: () => Promise<void>;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (key: string, fn: () => Promise<unknown>) => {
      setBusy(key);
      setError(null);
      try {
        await fn();
        await refresh();
        return true;
      } catch (e) {
        const err = e as ApiError;
        const details = Array.isArray(err.details) ? ` — ${(err.details as { reason?: string }[]).map((d) => d.reason ?? String(d)).join("; ")}` : "";
        setError(`${err.message}${details}`);
        return false;
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );

  const value = useMemo<OpsCtx>(
    () => ({
      state,
      lang,
      t: (k) => translate(lang, k),
      L: (v) => v[lang],
      operator,
      canAct: operator.role === "duty_officer",
      busy,
      error,
      clearError: () => setError(null),
      run,
      incidentAction: (action, json) => run(action, () => opsAction(state?.incident.id ?? "EVT-RAIN-001", action, json ?? {})),
      demo: (action, json) => run(`demo:${action}`, () => demoAction(action, json ?? {})),
      caseAction: (id, action, note) => run(`case:${action}`, () => api(`/api/ops/cases/${id}`, { json: { action, note } })),
      reviewAction: (id, resolution) => run(`review:${id}`, () => api(`/api/ops/reviews/${id}`, { json: { resolution } })),
      refresh,
    }),
    [state, lang, operator, busy, error, run, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOps() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useOps outside OpsProvider");
  return v;
}
