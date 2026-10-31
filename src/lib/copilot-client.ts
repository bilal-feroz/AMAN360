"use client";
import { useCallback, useRef, useState } from "react";
import type { CheckStatus, ComponentKind, ComponentProps, CopilotEvent, CopilotMode } from "@/domain/copilot";

export type Part =
  | { type: "text"; text: string }
  | {
      type: "component";
      id: string;
      kind: ComponentKind;
      label: string;
      data: ComponentProps | null;
      checks: Record<string, { status: CheckStatus; detail?: string }>;
      dropped: string | null;
    };

export interface Exchange {
  id: number;
  question: string;
  status: "streaming" | "done" | "error";
  startedAt: number;
  ms: number | null;
  meta: { mode: CopilotMode; model: string | null; label: string; note?: string } | null;
  steps: { id: string; text: string; state: "running" | "done" | "failed" }[];
  thinking: { text: string; ms: number | null; active: boolean };
  parts: Part[];
  error: string | null;
}

/** Reduces one streamed event into the exchange (immutable update). */
export function applyEvent(x: Exchange, e: CopilotEvent): Exchange {
  switch (e.t) {
    case "meta":
      return { ...x, meta: { mode: e.mode, model: e.model, label: e.label, note: e.note ?? x.meta?.note } };
    case "step": {
      const steps = x.steps.some((s) => s.id === e.id) ? x.steps.map((s) => (s.id === e.id ? { ...s, ...e } : s)) : [...x.steps, { id: e.id, text: e.text, state: e.state }];
      return { ...x, steps };
    }
    case "thinking":
      return { ...x, thinking: { text: x.thinking.text + e.delta, ms: null, active: true } };
    case "thinking_done":
      return { ...x, thinking: { ...x.thinking, ms: (x.thinking.ms ?? 0) + e.ms, active: false } };
    case "text": {
      const last = x.parts.at(-1);
      if (last?.type === "text") return { ...x, parts: [...x.parts.slice(0, -1), { type: "text", text: last.text + e.delta }] };
      return { ...x, parts: [...x.parts, { type: "text", text: e.delta }] };
    }
    case "component_start":
      return { ...x, parts: [...x.parts, { type: "component", id: e.id, kind: e.kind, label: e.label, data: null, checks: {}, dropped: null }] };
    case "component": {
      const { t: _t, id, ...data } = e;
      return { ...x, parts: x.parts.map((p) => (p.type === "component" && p.id === id ? { ...p, data: data as ComponentProps } : p)) };
    }
    case "check":
      return {
        ...x,
        parts: x.parts.map((p) => (p.type === "component" && p.id === e.id ? { ...p, checks: { ...p.checks, [e.checkId]: { status: e.status, detail: e.detail } } } : p)),
      };
    case "component_dropped":
      return { ...x, parts: x.parts.map((p) => (p.type === "component" && p.id === e.id ? { ...p, dropped: e.reason } : p)) };
    case "done":
      return { ...x, status: x.status === "error" ? "error" : "done", ms: e.ms, thinking: { ...x.thinking, active: false } };
    case "error":
      return { ...x, status: "error", error: e.message };
  }
}

/** Reads a `text/event-stream` body of `data: <json>` frames. */
export async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<CopilotEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const frame = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const line = frame.split("\n").find((l) => l.startsWith("data: "));
      if (line) yield JSON.parse(line.slice(6)) as CopilotEvent;
    }
  }
}

/** Text the model wrote for an exchange, used as compact history for follow-up questions. */
function answerText(x: Exchange) {
  return x.parts
    .map((p) => (p.type === "text" ? p.text : p.data ? `[${p.label} card shown]` : ""))
    .filter(Boolean)
    .join(" ")
    .slice(0, 1400);
}

export function useCopilot(lang: "en" | "ar") {
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const nextId = useRef(1);
  const latest = useRef<Exchange[]>([]);
  latest.current = exchanges;
  const busy = exchanges.at(-1)?.status === "streaming";

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q) return;
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const id = nextId.current++;
      const fresh: Exchange = { id, question: q, status: "streaming", startedAt: Date.now(), ms: null, meta: null, steps: [], thinking: { text: "", ms: null, active: false }, parts: [], error: null };
      const history = latest.current
        .filter((x) => x.status === "done")
        .slice(-3)
        .map((x) => ({ q: x.question, a: answerText(x) || "(cards shown)" }));
      setExchanges((xs) => [...xs.map((x) => (x.status === "streaming" ? { ...x, status: "done" as const, ms: Date.now() - x.startedAt } : x)), fresh]);
      const update = (e: CopilotEvent) => setExchanges((xs) => xs.map((x) => (x.id === id ? applyEvent(x, e) : x)));
      try {
        const res = await fetch("/api/ops/copilot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: q, lang, history }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}));
          update({ t: "error", message: (data as { error?: string }).error ?? `HTTP ${res.status}` });
          return;
        }
        for await (const e of readEvents(res.body)) update(e);
        setExchanges((xs) => xs.map((x) => (x.id === id && x.status === "streaming" ? { ...x, status: "done", ms: x.ms ?? Date.now() - x.startedAt } : x)));
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        update({ t: "error", message: lang === "ar" ? "انقطع الاتصال" : "Connection lost" });
      }
    },
    [lang],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setExchanges((xs) => xs.map((x) => (x.status === "streaming" ? { ...x, status: "done", ms: Date.now() - x.startedAt } : x)));
  }, []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setExchanges([]);
  }, []);

  return { exchanges, ask, stop, clear, busy };
}
