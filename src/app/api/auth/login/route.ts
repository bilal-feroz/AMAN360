import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { checkPasscode, createSession, OPERATORS, SESSION_COOKIE } from "@/server/auth";
import { audit } from "@/server/bus";
import { clientKey, handler, HttpError, rateLimit } from "@/server/http";

const Body = z.object({ operatorId: z.string(), passcode: z.string().min(1).max(200) });

export const POST = handler(async (req: NextRequest) => {
  rateLimit(`login:${clientKey(req)}`, 10, 5);
  const body = Body.parse(await req.json());
  const op = OPERATORS.find((o) => o.id === body.operatorId);
  if (!op || !checkPasscode(body.passcode)) throw new HttpError(401, "Incorrect operator or passcode");
  audit(op.id, "operator.signed_in", `${op.name} signed in (${op.role})`);
  const res = NextResponse.json({ operator: op });
  res.cookies.set(SESSION_COOKIE, createSession(op), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 12 * 3600,
    secure: req.nextUrl.protocol === "https:",
  });
  return res;
});
