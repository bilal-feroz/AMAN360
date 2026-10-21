import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { installationSecret } from "./db";

/**
 * Demo-appropriate operator authentication: a shared demo passcode (from env, never a real
 * credential) and an HMAC-signed, HttpOnly session cookie with role claims. A government deployment
 * would replace this with the authority's identity provider (see DEPLOYMENT.md).
 */

export type Role = "duty_officer" | "analyst";
export interface Operator {
  id: string;
  name: string;
  role: Role;
  title: { en: string; ar: string };
}

export const OPERATORS: Operator[] = [
  { id: "OP-ALYA", name: "Alya H.", role: "duty_officer", title: { en: "Duty officer (training)", ar: "ضابطة مناوبة (تدريب)" } },
  { id: "OP-SAMI", name: "Sami R.", role: "analyst", title: { en: "Analyst — read only (training)", ar: "محلل — قراءة فقط (تدريب)" } },
];

export const SESSION_COOKIE = "aman_session";
const TTL_MS = 12 * 3600_000;

const secret = () => process.env.AMAN_SESSION_SECRET?.trim() || installationSecret();
const passcode = () => process.env.AMAN_OPERATOR_PASSCODE?.trim() || "aman-demo-2026";

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function checkPasscode(input: string): boolean {
  return safeEqual(createHmac("sha256", "pc").update(input).digest("hex"), createHmac("sha256", "pc").update(passcode()).digest("hex"));
}

export function createSession(op: Operator): string {
  const payload = Buffer.from(JSON.stringify({ op: op.id, role: op.role, exp: Date.now() + TTL_MS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readSession(token: string | undefined | null): Operator | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !safeEqual(sig, sign(payload))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { op: string; exp: number };
    if (data.exp < Date.now()) return null;
    return OPERATORS.find((o) => o.id === data.op) ?? null;
  } catch {
    return null;
  }
}
