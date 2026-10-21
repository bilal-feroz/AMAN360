import "server-only";
import Database from "better-sqlite3";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

/**
 * SQLite persistence for the demo. A single file (default .data/aman360.db) holds every record so
 * that browser reloads and server restarts keep the scenario state. Spatial processing is done in
 * Turf.js; see ARCHITECTURE.md for the PostGIS migration path.
 */

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY, state TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS hazard_sources (
  id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, feed TEXT NOT NULL, received_at TEXT NOT NULL,
  payload TEXT NOT NULL, checksum TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS hazard_geometries (
  id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS road_closures (
  id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS recipients (
  id TEXT PRIMARY KEY, token TEXT NOT NULL UNIQUE, data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS assessments (
  id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, created_at TEXT NOT NULL, gate TEXT NOT NULL, summary TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS decisions (
  incident_id TEXT NOT NULL, recipient_id TEXT NOT NULL, outcome TEXT NOT NULL, category TEXT NOT NULL,
  action_id TEXT, data TEXT NOT NULL, PRIMARY KEY (incident_id, recipient_id)
);
CREATE TABLE IF NOT EXISTS guidance (
  id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, action_id TEXT NOT NULL, language TEXT NOT NULL,
  variant TEXT NOT NULL, state TEXT NOT NULL, data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, operator_id TEXT NOT NULL, at TEXT NOT NULL,
  guidance_ids TEXT NOT NULL, note TEXT
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, recipient_id TEXT NOT NULL, guidance_id TEXT NOT NULL,
  action_id TEXT NOT NULL, language TEXT NOT NULL, variant TEXT NOT NULL, channel TEXT NOT NULL,
  state TEXT NOT NULL, created_at TEXT NOT NULL, approved_at TEXT, queued_at TEXT, sent_at TEXT,
  delivered_at TEXT, responded_at TEXT, no_response_at TEXT, delivery_attempts INTEGER NOT NULL DEFAULT 0,
  UNIQUE (incident_id, recipient_id)
);
CREATE TABLE IF NOT EXISTS delivery_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT NOT NULL, attempt INTEGER NOT NULL,
  channel TEXT NOT NULL, status TEXT NOT NULL, at TEXT NOT NULL, detail TEXT
);
CREATE TABLE IF NOT EXISTS responses (
  id TEXT PRIMARY KEY, message_id TEXT NOT NULL, recipient_id TEXT NOT NULL, incident_id TEXT NOT NULL,
  kind TEXT NOT NULL, received_at TEXT NOT NULL, source TEXT NOT NULL, idempotency_key TEXT UNIQUE,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, recipient_id TEXT NOT NULL, response_id TEXT NOT NULL,
  priority TEXT NOT NULL, status TEXT NOT NULL, opened_at TEXT NOT NULL, data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS review_items (
  id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL,
  created_at TEXT NOT NULL, data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sim_schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT, due_at INTEGER NOT NULL, kind TEXT NOT NULL,
  payload TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS sim_due ON sim_schedule (done, due_at);
CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, actor TEXT NOT NULL, type TEXT NOT NULL,
  entity TEXT, summary TEXT NOT NULL, data TEXT
);
`;

type Db = Database.Database;
const g = globalThis as unknown as { __amanDb?: Db; __amanSecret?: string };

export function dataDir(): string {
  const dir = path.resolve(process.env.AMAN_DATA_DIR || ".data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function db(): Db {
  if (g.__amanDb) return g.__amanDb;
  const file = process.env.AMAN_DB_PATH?.trim() || path.join(dataDir(), "aman360.db");
  const conn = new Database(file);
  conn.exec(SCHEMA);
  g.__amanDb = conn;
  return conn;
}

/** For tests: use an isolated in-memory database. */
export function useMemoryDb(): Db {
  g.__amanDb?.close();
  const conn = new Database(":memory:");
  conn.exec(SCHEMA);
  g.__amanDb = conn;
  return conn;
}

/** A per-installation secret (never committed) used for citizen tokens and, if unset, sessions. */
export function installationSecret(): string {
  if (g.__amanSecret) return g.__amanSecret;
  const file = path.join(dataDir(), "secret");
  if (!existsSync(file)) writeFileSync(file, randomBytes(32).toString("hex"), { mode: 0o600 });
  g.__amanSecret = readFileSync(file, "utf8").trim();
  return g.__amanSecret;
}

export function tx<T>(fn: () => T): T {
  return db().transaction(fn)();
}

export function getMeta(key: string): string | null {
  const row = db().prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setMeta(key: string, value: string): void {
  db().prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

export const J = {
  parse<T>(s: string | null | undefined): T {
    return (s ? JSON.parse(s) : null) as T;
  },
  str(v: unknown): string {
    return JSON.stringify(v);
  },
};
