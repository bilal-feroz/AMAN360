"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { OpsState } from "@/server/services/state";
import { api } from "./api";

export type { OpsState };

/**
 * Live operational state: fetched from /api/ops/state and refreshed whenever the server pushes a
 * change over SSE. If the stream drops (network blip, server restart) it falls back to polling the
 * version and reconnects automatically — the command center never needs a manual refresh.
 */
export function useOpsState(viewAt: string | null) {
  const [state, setState] = useState<OpsState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<"live" | "reconnecting" | "polling">("reconnecting");
  const inflight = useRef(false);
  const queued = useRef(false);
  const viewAtRef = useRef(viewAt);
  viewAtRef.current = viewAt;

  const refresh = useCallback(async () => {
    if (inflight.current) {
      queued.current = true;
      return;
    }
    inflight.current = true;
    try {
      const q = viewAtRef.current ? `?at=${encodeURIComponent(viewAtRef.current)}` : "";
      const s = await api<OpsState>(`/api/ops/state${q}`);
      setState(s);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      if ((e as { status?: number }).status === 401) window.location.href = "/login";
    } finally {
      inflight.current = false;
      if (queued.current) {
        queued.current = false;
        void refresh();
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [viewAt, refresh]);

  useEffect(() => {
    let es: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const schedule = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => void refresh(), 120);
    };
    const connect = () => {
      if (closed) return;
      es = new EventSource("/api/ops/stream");
      es.addEventListener("hello", () => {
        setConnection("live");
        if (poll) {
          clearInterval(poll);
          poll = null;
        }
        schedule();
      });
      es.addEventListener("change", schedule);
      es.onerror = () => {
        es?.close();
        setConnection("polling");
        if (!poll) poll = setInterval(() => void refresh(), 2500);
        retry = setTimeout(connect, 3000);
      };
    };
    connect();
    return () => {
      closed = true;
      es?.close();
      if (poll) clearInterval(poll);
      if (retry) clearTimeout(retry);
      if (debounce) clearTimeout(debounce);
    };
  }, [refresh]);

  return { state, error, connection, refresh };
}
