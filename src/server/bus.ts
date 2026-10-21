import "server-only";
import { EventEmitter } from "node:events";
import { db, getMeta, J, setMeta } from "./db";

/**
 * In-process change bus. Every state mutation records an audit event and bumps a monotonically
 * increasing version; SSE subscribers are notified and re-fetch derived state. Because the version
 * lives in SQLite, clients also detect changes after a server restart (polling fallback).
 */

export interface BusEvent {
  version: number;
  type: string;
  entity?: string | null;
  summary?: string;
  at: string;
}

const g = globalThis as unknown as { __amanBus?: EventEmitter };
export const bus: EventEmitter = g.__amanBus ?? (g.__amanBus = new EventEmitter().setMaxListeners(200));

export function currentVersion(): number {
  return Number(getMeta("version") ?? 0);
}

export function audit(
  actor: string,
  type: string,
  summary: string,
  opts: { entity?: string | null; data?: Record<string, unknown> | null; at?: string } = {},
): BusEvent {
  const at = opts.at ?? new Date().toISOString();
  db()
    .prepare("INSERT INTO audit_events (at, actor, type, entity, summary, data) VALUES (?, ?, ?, ?, ?, ?)")
    .run(at, actor, type, opts.entity ?? null, summary, opts.data ? J.str(opts.data) : null);
  const version = currentVersion() + 1;
  setMeta("version", String(version));
  const evt: BusEvent = { version, type, entity: opts.entity ?? null, summary, at };
  queueMicrotask(() => bus.emit("change", evt));
  return evt;
}

/** Bump the version without an audit row (high-frequency simulation updates). */
export function touch(type: string): BusEvent {
  const version = currentVersion() + 1;
  setMeta("version", String(version));
  const evt: BusEvent = { version, type, at: new Date().toISOString() };
  queueMicrotask(() => bus.emit("change", evt));
  return evt;
}
