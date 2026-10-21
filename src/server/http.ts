import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { readSession, SESSION_COOKIE, type Operator, type Role } from "./auth";
import { ensureSeeded } from "./services/reset";
import { processDue } from "./services/sim";
import { WorkflowError } from "./services/workflow";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const buckets = new Map<string, { tokens: number; at: number }>();

/** Simple token-bucket rate limit (per key). */
export function rateLimit(key: string, perMinute: number, burst = perMinute) {
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: burst, at: now };
  b.tokens = Math.min(burst, b.tokens + ((now - b.at) / 60_000) * perMinute);
  b.at = now;
  if (b.tokens < 1) {
    buckets.set(key, b);
    throw new HttpError(429, "Too many requests — please wait a moment");
  }
  b.tokens -= 1;
  buckets.set(key, b);
}

export function clientKey(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

export function requireOperator(req: NextRequest, role?: Role): Operator {
  const op = readSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!op) throw new HttpError(401, "Operator sign-in required");
  if (role && op.role !== role) throw new HttpError(403, "Your role does not permit this action");
  return op;
}

/** Wraps a handler with seeding, simulation tick, and consistent JSON error responses. */
export function handler<C>(fn: (req: NextRequest, ctx: C) => Promise<Response | unknown>) {
  return async (req: NextRequest, ctx: C) => {
    try {
      ensureSeeded();
      await processDue();
      const out = await fn(req, ctx);
      return out instanceof Response ? out : NextResponse.json(out);
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      if (e instanceof WorkflowError) return NextResponse.json({ error: e.message, details: e.details ?? null }, { status: e.status });
      if (e instanceof ZodError) return NextResponse.json({ error: "Invalid request", details: e.issues }, { status: 400 });
      console.error(e);
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
  };
}
