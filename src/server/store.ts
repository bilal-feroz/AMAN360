import "server-only";
import type {
  AssistanceCase,
  CitizenResponse,
  DecisionTrace,
  GuidanceDraft,
  HazardGeometry,
  Incident,
  Message,
  MessageState,
  Recipient,
  ReviewItem,
  RoadClosure,
  AuditEvent,
} from "@/domain/types";
import type { AssessmentSummary, GateResult } from "@/domain/safety-engine";
import { db, J } from "./db";

/** Typed repository over the SQLite tables. No business rules live here. */

export const incidents = {
  get(id: string): Incident | null {
    const row = db().prepare("SELECT data FROM incidents WHERE id = ?").get(id) as { data: string } | undefined;
    return row ? J.parse<Incident>(row.data) : null;
  },
  all(): Incident[] {
    return (db().prepare("SELECT data FROM incidents ORDER BY id").all() as { data: string }[]).map((r) => J.parse<Incident>(r.data));
  },
  save(i: Incident) {
    db()
      .prepare("INSERT INTO incidents (id, state, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET state = excluded.state, data = excluded.data, updated_at = excluded.updated_at")
      .run(i.id, i.state, J.str(i), i.updatedAt);
  },
};

export const hazards = {
  forIncident(incidentId: string): HazardGeometry | null {
    const row = db().prepare("SELECT data FROM hazard_geometries WHERE incident_id = ? LIMIT 1").get(incidentId) as { data: string } | undefined;
    return row ? J.parse<HazardGeometry>(row.data) : null;
  },
  save(h: HazardGeometry) {
    db().prepare("INSERT OR REPLACE INTO hazard_geometries (id, incident_id, data) VALUES (?, ?, ?)").run(h.id, h.incidentId, J.str(h));
  },
};

export const closures = {
  forIncident(incidentId: string): RoadClosure[] {
    return (db().prepare("SELECT data FROM road_closures WHERE incident_id = ? ORDER BY id").all(incidentId) as { data: string }[]).map((r) =>
      J.parse<RoadClosure>(r.data),
    );
  },
  save(c: RoadClosure) {
    db().prepare("INSERT OR REPLACE INTO road_closures (id, incident_id, data) VALUES (?, ?, ?)").run(c.id, c.incidentId, J.str(c));
  },
};

export const recipients = {
  all(): Recipient[] {
    return (db().prepare("SELECT data FROM recipients ORDER BY id").all() as { data: string }[]).map((r) => J.parse<Recipient>(r.data));
  },
  get(id: string): Recipient | null {
    const row = db().prepare("SELECT data FROM recipients WHERE id = ?").get(id) as { data: string } | undefined;
    return row ? J.parse<Recipient>(row.data) : null;
  },
  byToken(token: string): Recipient | null {
    const row = db().prepare("SELECT data FROM recipients WHERE token = ?").get(token) as { data: string } | undefined;
    return row ? J.parse<Recipient>(row.data) : null;
  },
  save(r: Recipient) {
    db().prepare("INSERT OR REPLACE INTO recipients (id, token, data) VALUES (?, ?, ?)").run(r.id, r.token, J.str(r));
  },
};

export const assessments = {
  latest(incidentId: string): { id: string; createdAt: string; gate: GateResult; summary: AssessmentSummary } | null {
    const row = db().prepare("SELECT * FROM assessments WHERE incident_id = ? ORDER BY created_at DESC LIMIT 1").get(incidentId) as
      | { id: string; created_at: string; gate: string; summary: string }
      | undefined;
    return row ? { id: row.id, createdAt: row.created_at, gate: J.parse(row.gate), summary: J.parse(row.summary) } : null;
  },
  save(id: string, incidentId: string, at: string, gate: GateResult, summary: AssessmentSummary) {
    db().prepare("INSERT INTO assessments (id, incident_id, created_at, gate, summary) VALUES (?, ?, ?, ?, ?)").run(id, incidentId, at, J.str(gate), J.str(summary));
  },
};

export const decisions = {
  forIncident(incidentId: string): DecisionTrace[] {
    return (db().prepare("SELECT data FROM decisions WHERE incident_id = ? ORDER BY recipient_id").all(incidentId) as { data: string }[]).map((r) =>
      J.parse<DecisionTrace>(r.data),
    );
  },
  get(incidentId: string, recipientId: string): DecisionTrace | null {
    const row = db().prepare("SELECT data FROM decisions WHERE incident_id = ? AND recipient_id = ?").get(incidentId, recipientId) as { data: string } | undefined;
    return row ? J.parse<DecisionTrace>(row.data) : null;
  },
  replaceAll(incidentId: string, traces: DecisionTrace[]) {
    const d = db();
    d.prepare("DELETE FROM decisions WHERE incident_id = ?").run(incidentId);
    const ins = d.prepare("INSERT INTO decisions (incident_id, recipient_id, outcome, category, action_id, data) VALUES (?, ?, ?, ?, ?, ?)");
    for (const t of traces) ins.run(incidentId, t.recipientId, t.outcome, t.category, t.actionId, J.str(t));
  },
};

export const guidance = {
  forIncident(incidentId: string): GuidanceDraft[] {
    return (db().prepare("SELECT data FROM guidance WHERE incident_id = ? ORDER BY action_id, language, variant").all(incidentId) as { data: string }[]).map(
      (r) => J.parse<GuidanceDraft>(r.data),
    );
  },
  get(id: string): GuidanceDraft | null {
    const row = db().prepare("SELECT data FROM guidance WHERE id = ?").get(id) as { data: string } | undefined;
    return row ? J.parse<GuidanceDraft>(row.data) : null;
  },
  save(gd: GuidanceDraft) {
    db()
      .prepare("INSERT OR REPLACE INTO guidance (id, incident_id, action_id, language, variant, state, data) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(gd.id, gd.incidentId, gd.actionId, gd.language, gd.variant, gd.state, J.str(gd));
  },
  deleteForIncident(incidentId: string) {
    db().prepare("DELETE FROM guidance WHERE incident_id = ?").run(incidentId);
  },
};

type MessageRow = {
  id: string;
  incident_id: string;
  recipient_id: string;
  guidance_id: string;
  action_id: string;
  language: string;
  variant: string;
  channel: string;
  state: string;
  created_at: string;
  approved_at: string | null;
  queued_at: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  responded_at: string | null;
  no_response_at: string | null;
  delivery_attempts: number;
};

const toMessage = (r: MessageRow): Message & { noResponseAt: string | null } => ({
  id: r.id,
  incidentId: r.incident_id,
  recipientId: r.recipient_id,
  guidanceId: r.guidance_id,
  actionId: r.action_id,
  language: r.language as Message["language"],
  variant: r.variant as Message["variant"],
  channel: r.channel as Message["channel"],
  state: r.state as MessageState,
  createdAt: r.created_at,
  approvedAt: r.approved_at,
  queuedAt: r.queued_at,
  sentAt: r.sent_at,
  deliveredAt: r.delivered_at,
  respondedAt: r.responded_at,
  noResponseAt: r.no_response_at,
  deliveryAttempts: r.delivery_attempts,
});

export type StoredMessage = ReturnType<typeof toMessage>;

export const messages = {
  forIncident(incidentId: string): StoredMessage[] {
    return (db().prepare("SELECT * FROM messages WHERE incident_id = ? ORDER BY id").all(incidentId) as MessageRow[]).map(toMessage);
  },
  forRecipient(recipientId: string): StoredMessage[] {
    return (db().prepare("SELECT * FROM messages WHERE recipient_id = ? ORDER BY created_at DESC").all(recipientId) as MessageRow[]).map(toMessage);
  },
  get(id: string): StoredMessage | null {
    const row = db().prepare("SELECT * FROM messages WHERE id = ?").get(id) as MessageRow | undefined;
    return row ? toMessage(row) : null;
  },
  insert(m: Message) {
    return db()
      .prepare(
        `INSERT OR IGNORE INTO messages (id, incident_id, recipient_id, guidance_id, action_id, language, variant, channel, state, created_at, approved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(m.id, m.incidentId, m.recipientId, m.guidanceId, m.actionId, m.language, m.variant, m.channel, m.state, m.createdAt, m.approvedAt).changes;
  },
  /** Compare-and-set state transition; returns false if the message was not in an allowed state. */
  transition(id: string, from: MessageState[], to: MessageState, stamp: Partial<Record<"queued_at" | "sent_at" | "delivered_at" | "responded_at" | "no_response_at", string>> = {}, incAttempts = false): boolean {
    const sets = ["state = ?", ...Object.keys(stamp).map((k) => `${k} = ?`)];
    if (incAttempts) sets.push("delivery_attempts = delivery_attempts + 1");
    const placeholders = from.map(() => "?").join(",");
    const res = db()
      .prepare(`UPDATE messages SET ${sets.join(", ")} WHERE id = ? AND state IN (${placeholders})`)
      .run(to, ...Object.values(stamp), id, ...from);
    return res.changes === 1;
  },
  recordAttempt(messageId: string, attempt: number, channel: string, status: string, at: string, detail?: string) {
    db().prepare("INSERT INTO delivery_attempts (message_id, attempt, channel, status, at, detail) VALUES (?, ?, ?, ?, ?, ?)").run(messageId, attempt, channel, status, at, detail ?? null);
  },
  attempts(messageId: string) {
    return db().prepare("SELECT attempt, channel, status, at, detail FROM delivery_attempts WHERE message_id = ? ORDER BY id").all(messageId) as {
      attempt: number;
      channel: string;
      status: string;
      at: string;
      detail: string | null;
    }[];
  },
};

export const responses = {
  forIncident(incidentId: string): CitizenResponse[] {
    return (db().prepare("SELECT data FROM responses WHERE incident_id = ? ORDER BY received_at").all(incidentId) as { data: string }[]).map((r) =>
      J.parse<CitizenResponse>(r.data),
    );
  },
  forMessage(messageId: string): CitizenResponse[] {
    return (db().prepare("SELECT data FROM responses WHERE message_id = ? ORDER BY received_at").all(messageId) as { data: string }[]).map((r) =>
      J.parse<CitizenResponse>(r.data),
    );
  },
  byIdempotency(key: string): CitizenResponse | null {
    const row = db().prepare("SELECT data FROM responses WHERE idempotency_key = ?").get(key) as { data: string } | undefined;
    return row ? J.parse<CitizenResponse>(row.data) : null;
  },
  insert(r: CitizenResponse, idempotencyKey: string | null) {
    db()
      .prepare("INSERT INTO responses (id, message_id, recipient_id, incident_id, kind, received_at, source, idempotency_key, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(r.id, r.messageId, r.recipientId, r.incidentId, r.kind, r.receivedAt, r.source, idempotencyKey, J.str(r));
  },
  count(): number {
    return (db().prepare("SELECT COUNT(*) c FROM responses").get() as { c: number }).c;
  },
};

export const cases = {
  forIncident(incidentId: string): AssistanceCase[] {
    return (db().prepare("SELECT data FROM cases WHERE incident_id = ? ORDER BY opened_at").all(incidentId) as { data: string }[]).map((r) =>
      J.parse<AssistanceCase>(r.data),
    );
  },
  get(id: string): AssistanceCase | null {
    const row = db().prepare("SELECT data FROM cases WHERE id = ?").get(id) as { data: string } | undefined;
    return row ? J.parse<AssistanceCase>(row.data) : null;
  },
  openForRecipient(incidentId: string, recipientId: string): AssistanceCase | null {
    const row = db()
      .prepare("SELECT data FROM cases WHERE incident_id = ? AND recipient_id = ? AND status != 'resolved' ORDER BY opened_at DESC LIMIT 1")
      .get(incidentId, recipientId) as { data: string } | undefined;
    return row ? J.parse<AssistanceCase>(row.data) : null;
  },
  save(c: AssistanceCase) {
    db()
      .prepare("INSERT OR REPLACE INTO cases (id, incident_id, recipient_id, response_id, priority, status, opened_at, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(c.id, c.incidentId, c.recipientId, c.responseId, c.priority, c.status, c.openedAt, J.str(c));
  },
  nextId(): string {
    const n = (db().prepare("SELECT COUNT(*) c FROM cases").get() as { c: number }).c + 1;
    return `CASE-${String(n).padStart(4, "0")}`;
  },
};

export const reviews = {
  forIncident(incidentId: string): ReviewItem[] {
    return (db().prepare("SELECT data FROM review_items WHERE incident_id = ? ORDER BY created_at").all(incidentId) as { data: string }[]).map((r) =>
      J.parse<ReviewItem>(r.data),
    );
  },
  get(id: string): ReviewItem | null {
    const row = db().prepare("SELECT data FROM review_items WHERE id = ?").get(id) as { data: string } | undefined;
    return row ? J.parse<ReviewItem>(row.data) : null;
  },
  save(r: ReviewItem) {
    db().prepare("INSERT OR REPLACE INTO review_items (id, incident_id, kind, status, created_at, data) VALUES (?, ?, ?, ?, ?, ?)").run(r.id, r.incidentId, r.kind, r.status, r.createdAt, J.str(r));
  },
  nextId(): string {
    const n = (db().prepare("SELECT COUNT(*) c FROM review_items").get() as { c: number }).c + 1;
    return `REV-${String(n).padStart(4, "0")}`;
  },
};

export const auditLog = {
  recent(limit = 200): AuditEvent[] {
    return (db().prepare("SELECT * FROM audit_events ORDER BY id DESC LIMIT ?").all(limit) as (Omit<AuditEvent, "data"> & { data: string | null })[]).map((r) => ({
      ...r,
      data: J.parse(r.data),
    }));
  },
  since(id: number): AuditEvent[] {
    return (db().prepare("SELECT * FROM audit_events WHERE id > ? ORDER BY id").all(id) as (Omit<AuditEvent, "data"> & { data: string | null })[]).map((r) => ({
      ...r,
      data: J.parse(r.data),
    }));
  },
  firstOfType(type: string): AuditEvent | null {
    const r = db().prepare("SELECT * FROM audit_events WHERE type = ? ORDER BY id LIMIT 1").get(type) as (Omit<AuditEvent, "data"> & { data: string | null }) | undefined;
    return r ? { ...r, data: J.parse(r.data) } : null;
  },
};

export const schedule = {
  add(dueAt: number, kind: string, payload: Record<string, unknown>) {
    db().prepare("INSERT INTO sim_schedule (due_at, kind, payload) VALUES (?, ?, ?)").run(dueAt, kind, J.str(payload));
  },
  due(now: number, limit = 500) {
    return (db().prepare("SELECT id, due_at, kind, payload FROM sim_schedule WHERE done = 0 AND due_at <= ? ORDER BY due_at, id LIMIT ?").all(now, limit) as {
      id: number;
      due_at: number;
      kind: string;
      payload: string;
    }[]).map((r) => ({ id: r.id, dueAt: r.due_at, kind: r.kind, payload: J.parse<Record<string, unknown>>(r.payload) }));
  },
  pending(): number {
    return (db().prepare("SELECT COUNT(*) c FROM sim_schedule WHERE done = 0").get() as { c: number }).c;
  },
  nextDue(): number | null {
    const r = db().prepare("SELECT MIN(due_at) d FROM sim_schedule WHERE done = 0").get() as { d: number | null };
    return r.d;
  },
  markDone(id: number) {
    db().prepare("UPDATE sim_schedule SET done = 1 WHERE id = ?").run(id);
  },
  /** Pull every pending item forward (used by "fast-forward" in presentation mode). */
  shiftAll(byMs: number) {
    db().prepare("UPDATE sim_schedule SET due_at = due_at - ? WHERE done = 0").run(byMs);
  },
  clear() {
    db().prepare("DELETE FROM sim_schedule").run();
  },
};

export function wipeScenarioTables() {
  const d = db();
  for (const t of [
    "incidents",
    "hazard_sources",
    "hazard_geometries",
    "road_closures",
    "recipients",
    "assessments",
    "decisions",
    "guidance",
    "approvals",
    "messages",
    "delivery_attempts",
    "responses",
    "cases",
    "review_items",
    "sim_schedule",
    "audit_events",
  ]) {
    d.prepare(`DELETE FROM ${t}`).run();
  }
}
