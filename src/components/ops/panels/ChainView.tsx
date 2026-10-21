"use client";

import { useEffect, useState } from "react";
import { CloudRain, MapPin, Scale, MessageSquareText, Reply, UserCheck, Check, Minus } from "lucide-react";
import { api } from "@/lib/api";
import { fmtTime } from "@/lib/format";
import { cn } from "@/components/ui";
import { useOps } from "../context";
import type { recipientChain } from "@/server/services/explain";

export type Chain = NonNullable<ReturnType<typeof recipientChain>>;

export function useChain(recipientId: string | null) {
  const { state } = useOps();
  const [chain, setChain] = useState<Chain | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!recipientId) return;
    let alive = true;
    api<Chain>(`/api/ops/recipients/${recipientId}`)
      .then((c) => alive && (setChain(c), setError(null)))
      .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
    };
  }, [recipientId, state?.version]);
  return { chain: chain && chain.recipient.id === recipientId ? chain : null, error };
}

/** Verified event → geographic match → approved rule → communication → response → human follow-up. */
export function ChainView({ chain }: { chain: Chain }) {
  const { lang, t, L } = useOps();
  const d = chain.decision;
  const m = chain.message;
  const lastResponse = chain.responses.at(-1);
  const steps = [
    {
      icon: CloudRain,
      title: t("verifiedEvent"),
      done: chain.incident.verification.status === "verified",
      body: (
        <>
          <span className="font-id">{chain.incident.id}</span> · {L(chain.incident.sourceAgency.name)}
          <br />
          {lang === "ar" ? "التحقق" : "Verification"}: {chain.incident.verification.status} · {fmtTime(chain.incident.verification.checkedAt, lang)}
        </>
      ),
    },
    {
      icon: MapPin,
      title: t("geoMatch"),
      done: !!d,
      body: d ? (
        <>
          {d.checks.locationUsable
            ? d.checks.insideZone
              ? lang === "ar"
                ? "الموقع يقع داخل مضلع الخطر المؤكد"
                : "Location intersects the verified hazard polygon"
              : d.checks.routeIntersectsClosure
                ? lang === "ar"
                  ? `المسار المُشارك يعبر الإغلاق ${d.checks.nearestClosureId} (على بعد ${d.checks.distanceToClosureM} م)`
                  : `Shared route crosses ${d.checks.nearestClosureId} (${d.checks.distanceToClosureM} m ahead)`
                : lang === "ar"
                  ? `خارج المنطقة (${d.checks.distanceToZoneM} م من الحد)`
                  : `Outside the zone (${d.checks.distanceToZoneM} m from boundary)`
            : lang === "ar"
              ? "الموقع غير قابل للاستخدام — لا استنتاج"
              : "Location unusable — nothing inferred"}
        </>
      ) : null,
    },
    {
      icon: Scale,
      title: t("approvedRule"),
      done: !!d,
      body: d ? (
        <>
          <span className="font-id">{d.ruleId}</span> · {d.policyVersion}
          <br />
          {chain.rule ? L(chain.rule.description) : null}
        </>
      ) : null,
    },
    {
      icon: MessageSquareText,
      title: t("communication"),
      done: !!m?.deliveredAt,
      body: m ? (
        <>
          <span className="font-id">{m.actionId}</span> · {m.language.toUpperCase()} · {m.variant}
          <br />
          {m.deliveredAt ? `${t("delivered")} ${fmtTime(m.deliveredAt, lang, true)} · ${m.channel === "in_app" ? (lang === "ar" ? "صندوق وارد محاكى" : "in-app sim inbox") : lang === "ar" ? "محاكي رسائل نصية" : "SMS simulator"}` : m.state}
        </>
      ) : d?.outcome === "NO_ACTION" ? (
        lang === "ar" ? "لم تُرسل رسالة — لا توجد تعليمات ضرورية" : "No message sent — no instruction needed"
      ) : null,
    },
    {
      icon: Reply,
      title: t("citizenResponse"),
      done: !!lastResponse,
      body: lastResponse ? (
        <>
          {lastResponse.kind === "help" ? t("assistance") : lastResponse.kind === "safe" ? t("safe") : t("clarification")} · {fmtTime(lastResponse.receivedAt, lang, true)}
          {lastResponse.text && (
            <span className="mt-1 block text-ink" dir="auto">
              “{lastResponse.text}”
            </span>
          )}
        </>
      ) : null,
    },
    {
      icon: UserCheck,
      title: t("humanFollowUp"),
      done: !!chain.case?.acknowledgedAt,
      body: chain.case ? (
        <>
          <span className="font-id">{chain.case.id}</span> · {chain.case.priority} · {chain.case.status}
          {chain.case.notes.filter((n) => n.by.startsWith("OP-")).map((n) => (
            <span key={n.at} className="mt-1 block text-ink">
              {fmtTime(n.at, lang)} — {n.text}
            </span>
          ))}
        </>
      ) : null,
    },
  ];
  return (
    <ol className="relative">
      {steps.map((s, i) => (
        <li key={s.title} className="relative flex gap-3 pb-4 last:pb-0">
          {i < steps.length - 1 && <span className={cn("absolute start-[13px] top-7 h-[calc(100%-24px)] w-[2px]", s.done ? "bg-teal/50" : "bg-line")} />}
          <span className={cn("relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full ring-4 ring-surface", s.done ? "bg-teal text-white" : "bg-surface-2 text-muted")}>
            <s.icon size={14} />
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex items-center gap-2 text-[12.5px] font-semibold text-ink">
              {s.title}
              {s.done ? <Check size={12} className="text-teal" /> : <Minus size={12} className="text-muted" />}
            </div>
            {s.body && <div className="mt-0.5 text-[12px] leading-relaxed text-ink-2">{s.body}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}
