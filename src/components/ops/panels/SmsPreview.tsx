"use client";

import { useState } from "react";
import { MessageSquareText } from "lucide-react";
import { smsAlert, smsSegments, SMS_LANGS, SMS_REVIEW, type SmsLang } from "@/domain/comms/sms";
import { LANGUAGE_NAMES } from "@/domain/language";
import { cn, Disclosure } from "@/components/ui";
import { useOps } from "../context";

/**
 * The same approved action as an SMS, for phones without the app or without internet. Facts are
 * filled by code from the verified incident; English and Arabic are approved wording, the other
 * languages are marked as awaiting native-speaker review.
 */
export function SmsPreview({ actionId }: { actionId: string }) {
  const { state, lang } = useOps();
  const [code, setCode] = useState<SmsLang>("hi");
  if (!state?.hazard) return null;
  const facts = { zone: state.hazard.name, closure: state.closures[0]?.name ?? { en: "", ar: "" }, validUntil: state.incident.validUntil };
  const text = smsAlert(actionId, code, facts);
  if (!text) return null;
  const seg = smsSegments(text);
  const L = (en: string, ar: string) => (lang === "ar" ? ar : en);
  return (
    <Disclosure icon={<MessageSquareText size={15} className="text-teal" />} summary={L(`SMS for phones without the app · ${SMS_LANGS.length} languages`, `رسالة SMS للهواتف دون التطبيق · ${SMS_LANGS.length} لغات`)}>
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={L("SMS language", "لغة الرسالة")}>
        {SMS_LANGS.map((c) => (
          <button
            key={c}
            role="tab"
            aria-selected={c === code}
            onClick={() => setCode(c)}
            className={cn("rounded-full px-2.5 py-1 text-[11.5px] font-medium ring-1 transition", c === code ? "bg-ink text-white ring-ink" : "text-ink-2 ring-line hover:bg-surface-2")}
          >
            {LANGUAGE_NAMES[c]?.native ?? c}
          </button>
        ))}
      </div>
      <p dir="auto" className="mt-2.5 whitespace-pre-line rounded-xl bg-surface-2 px-3 py-2.5 text-[12.5px] leading-relaxed text-ink ring-1 ring-line">
        {text}
      </p>
      <p className="mt-2 flex flex-wrap items-center gap-x-2 text-[11.5px] text-muted">
        <span className="tnum">
          {seg.segments} SMS · {seg.encoding === "UCS-2" ? "Unicode" : "GSM-7"} · {seg.chars} {L("characters", "حرفًا")}
        </span>
        <span aria-hidden>·</span>
        {SMS_REVIEW[code] === "approved" ? (
          <span className="text-teal-ink">{L("Approved wording", "صياغة معتمدة")}</span>
        ) : (
          <span className="text-amber-ink">{L("Draft translation, needs native-speaker sign-off", "ترجمة مسودة تحتاج إلى اعتماد متحدث أصلي")}</span>
        )}
      </p>
      <p className="mt-2 text-[11.5px] leading-relaxed text-ink-2">
        {L(
          "People reply 1 (safe), 2 (help) or 3 (question), or in their own words. Replies follow the language they write in.",
          "يردّ الناس بـ 1 (بخير) أو 2 (مساعدة) أو 3 (سؤال)، أو بكلماتهم. تتبع الردود لغة كتابتهم.",
        )}
      </p>
    </Disclosure>
  );
}
