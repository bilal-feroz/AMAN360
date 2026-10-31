import "server-only";
import type { Message, Recipient, ResponseKind } from "@/domain/types";
import { detectLanguage, LANGUAGE_NAMES } from "@/domain/language";
import { isSmsLang, matchSmsQuestion, parseSms, replyLanguage, smsAlert, smsAnswer, smsReply, smsSegments, SMS_LANGS, SMS_REVIEW, type SmsLang, type SmsReplyKind } from "@/domain/comms/sms";
import { audit } from "../bus";
import * as store from "../store";
import { activeMessageFor, recipientForToken, submitResponse } from "./citizen";
import { networkFor } from "./network";
import { messageFacts, WorkflowError } from "./workflow";

/**
 * Two-way SMS over a simulated gateway. In production the inbound side is the SMS provider's
 * webhook (sender number instead of the access token); everything after that is the same code
 * path as the citizen app: a numbered reply becomes the same safe / help / question response,
 * help text goes to AI triage and the duty officer, questions get approved answers only.
 */

/** Language a basic phone starts in (synthetic personas). Others use their profile language. */
const DEFAULT_SMS_LANG: Record<string, SmsLang> = { "RES-053": "hi" };
export const SMS_PERSONA_ID = "RES-053";

export function phoneLang(r: Recipient): SmsLang {
  const saved = store.sms.lang(r.id);
  return isSmsLang(saved) ? saved : (DEFAULT_SMS_LANG[r.id] ?? r.language);
}

function send(r: Recipient, lang: SmsLang, text: string, data: Record<string, unknown>, at = new Date().toISOString()) {
  store.sms.add({ recipientId: r.id, dir: "out", at, text, lang, data: { ...data, ...smsSegments(text) } });
}

/** Called by the delivery simulator when an SMS alert reaches the handset. */
export function logAlertSms(m: Message, at: string) {
  const r = store.recipients.get(m.recipientId);
  const incident = store.incidents.get(m.incidentId);
  if (!r || !incident) return;
  const lang = phoneLang(r);
  const text = smsAlert(m.actionId, lang, messageFacts(incident));
  if (text) send(r, lang, text, { kind: "alert", messageId: m.id }, at);
}

function resendAlert(r: Recipient, lang: SmsLang) {
  const m = activeMessageFor(r.id);
  const incident = m && store.incidents.get(m.incidentId);
  if (!m || !m.deliveredAt || !incident || incident.state === "resolved") return;
  const text = smsAlert(m.actionId, lang, messageFacts(incident));
  if (text) send(r, lang, text, { kind: "alert", messageId: m.id, resent: true });
}

export async function receiveSms(token: string, raw: string) {
  const r = recipientForToken(token);
  if (networkFor(r).status !== "ok") throw new WorkflowError("No service (simulated cell outage) — the message was not sent", 503);
  const body = raw.replace(/[\u0000-\u0008\u000b-\u001f]/g, "").trim().slice(0, 480);
  if (!body) throw new WorkflowError("Empty message", 400);

  const awaiting = (store.sms.thread(r.id).filter((e) => e.dir === "out").at(-1)?.data?.awaiting as "help_details" | "question" | undefined) ?? null;
  const parsed = parseSms(body, awaiting);
  let lang = phoneLang(r);
  const next = parsed.kind === "language" ? parsed.lang : replyLanguage(body, lang);
  if (next !== lang) {
    store.sms.setLang(r.id, next);
    lang = next;
  }
  store.sms.add({ recipientId: r.id, dir: "in", at: new Date().toISOString(), text: body, lang: detectLanguage(body, null), data: { parsed: parsed.kind } });
  const reply = (kind: SmsReplyKind, extra: Record<string, unknown> = {}) => send(r, lang, smsReply(kind, lang), { kind, ...extra });

  if (parsed.kind === "language") {
    reply("lang_set");
    resendAlert(r, lang);
    audit(`citizen:${r.id}`, "sms.language", `${r.id} switched SMS language to ${LANGUAGE_NAMES[lang]?.en ?? lang}`, { entity: r.id });
    return smsThread(token);
  }

  const message = activeMessageFor(r.id);
  if (!message || !message.deliveredAt) {
    reply("no_alert");
    audit(`citizen:${r.id}`, "sms.inbound", `${r.id} sent an SMS with no active alert — automatic reply sent`, { entity: r.id });
    return smsThread(token);
  }
  if (parsed.kind === "unknown") {
    reply("unknown");
    return smsThread(token);
  }
  if (parsed.kind === "question" && !parsed.text) {
    reply("ask", { awaiting: "question" });
    return smsThread(token);
  }

  const kind: ResponseKind = parsed.kind === "safe" ? "safe" : parsed.kind === "help" ? "help" : "clarify";
  const text = parsed.kind === "help" ? parsed.details : parsed.kind === "question" || parsed.kind === "freeform" ? parsed.text : null;
  const questionId = kind === "clarify" && text ? matchSmsQuestion(text) : null;
  let result: Awaited<ReturnType<typeof submitResponse>>;
  try {
    result = await submitResponse({ token, messageId: message.id, kind, text, questionId, source: "citizen_live" });
  } catch (e) {
    if (e instanceof WorkflowError && [404, 409, 410].includes(e.status)) {
      reply("closed");
      return smsThread(token);
    }
    throw e;
  }

  const incident = store.incidents.get(message.incidentId)!;
  if (kind === "safe") reply("safe");
  else if (kind === "help") (text ? reply("help_details") : reply("help", { awaiting: "help_details" }));
  else if (result.answer) send(r, lang, smsAnswer(result.answer.id, lang, messageFacts(incident)) ?? result.answer.text, { kind: "answer", answerId: result.answer.id });
  else reply(parsed.kind === "freeform" ? "forwarded" : "escalated");

  audit(`citizen:${r.id}`, "sms.inbound", `${r.id} replied by SMS in ${LANGUAGE_NAMES[lang]?.en ?? lang}: ${kind === "safe" ? "I am safe" : kind === "help" ? `help request${result.caseId ? ` (${result.caseId})` : ""}` : result.answer ? `question, answered with ${result.answer.id}` : "question, passed to a person"}`, {
    entity: result.caseId ?? message.id,
    data: { channel: "sms", lang, kind },
  });
  return smsThread(token);
}

export function smsThread(token: string) {
  const r = recipientForToken(token);
  const lang = phoneLang(r);
  const net = networkFor(r);
  const waiting = store.messages.forRecipient(r.id).filter((m) => m.state === "queued" && m.deliveryAttempts > 0).length;
  return {
    phone: {
      id: r.id,
      displayName: r.displayName,
      areaLabel: r.areaLabel,
      lang,
      review: SMS_REVIEW[lang],
      network: net.status,
      waiting,
    },
    languages: SMS_LANGS.map((code) => ({ code, en: LANGUAGE_NAMES[code]?.en ?? code, native: LANGUAGE_NAMES[code]?.native ?? code })),
    thread: store.sms.thread(r.id).map((e) => ({
      id: e.id,
      dir: e.dir,
      at: e.at,
      text: e.text,
      kind: (e.data?.kind as string | undefined) ?? null,
      encoding: (e.data?.encoding as string | undefined) ?? smsSegments(e.text).encoding,
      segments: (e.data?.segments as number | undefined) ?? smsSegments(e.text).segments,
    })),
  };
}
