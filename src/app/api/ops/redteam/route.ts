import type { NextRequest } from "next/server";
import { z } from "zod";
import { renderApproved, lockedFactValues } from "@/domain/comms/facts";
import { validateCandidate } from "@/domain/comms/validator";
import { ATTACKS } from "@/domain/comms/redteam";
import { APPROVED_ACTIONS, SAFETY_POLICY } from "@/scenario/policy";
import { INCIDENT_ID } from "@/scenario/scenario";
import { audit } from "@/server/bus";
import { handler, HttpError, rateLimit, requireOperator } from "@/server/http";
import { messageFacts } from "@/server/services/workflow";
import * as store from "@/server/store";

export const dynamic = "force-dynamic";

const Body = z.object({
  actionId: z.string().max(40),
  language: z.enum(["en", "ar"]),
  variant: z.enum(["standard", "plain", "audio"]).default("plain"),
  attack: z.string().max(40),
});

/**
 * Live stress test of the message validator: applies one unsafe edit to the approved wording and
 * runs it through the exact checks every model output must pass. Nothing is stored or sent.
 */
export const POST = handler(async (req: NextRequest) => {
  const op = requireOperator(req);
  rateLimit(`redteam:${op.id}`, 40, 12);
  const body = Body.parse(await req.json());
  const action = APPROVED_ACTIONS.find((a) => a.id === body.actionId);
  const attack = ATTACKS.find((a) => a.id === body.attack);
  if (!action || !attack) throw new HttpError(404, "Unknown action or attack");
  const incident = store.incidents.get(INCIDENT_ID);
  if (!incident) throw new HttpError(404, "No incident");
  const facts = messageFacts(incident);
  const approved = renderApproved(action, body.language, body.variant, facts);
  const content = attack.apply(approved, body.language, lockedFactValues(action, body.language, facts));
  const v = validateCandidate({ actionId: action.id, language: body.language, variant: body.variant, content }, { action, language: body.language, variant: body.variant, facts }, SAFETY_POLICY);
  audit(op.id, v.passed ? "redteam.passed" : "redteam.blocked", `Stress test "${attack.label.en}" on ${action.id}/${body.language}/${body.variant}: ${v.passed ? "NOT blocked" : `blocked by ${v.checks.filter((c) => !c.passed).length} check(s)`}`, {
    entity: action.id,
    data: { attack: attack.id, failed: v.checks.filter((c) => !c.passed).map((c) => c.id) },
  });
  return { attack: { id: attack.id, label: attack.label, injected: attack.injected[body.language] }, approved, candidate: content, passed: v.passed, checks: v.checks, fallback: "approved template" };
});

export const GET = handler(async (req: NextRequest) => {
  requireOperator(req);
  return { attacks: ATTACKS.map((a) => ({ id: a.id, label: a.label })) };
});
