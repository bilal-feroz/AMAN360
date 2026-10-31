"use client";

import { useEffect, useState } from "react";
import { CloudRain, MapPin, Scale, MessageSquareText, Reply, UserCheck, Check } from "lucide-react";
import { api } from "@/lib/api";
import { fmtTime } from "@/lib/format";
import { cn } from "@/components/ui";
import { useOps } from "../context";
import type { recipientChain } from "@/server/services/explain";
import { ACTION_LABEL } from "../workflow";

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
  const action = m ? ACTION_LABEL[m.actionId] : null;
  const ar = lang === "ar";
  const steps = [
    {
      icon: CloudRain,
      title: t("verifiedEvent"),
      done: chain.incident.verification.status === "verified",
      body: `${L(chain.incident.sourceAgency.name)} · ${fmtTime(chain.incident.verification.checkedAt, lang)}`,
      ref: chain.incident.id,
    },
    {
      icon: MapPin,
      title: t("geoMatch"),
      done: !!d,
      body: d && chain.incident.fire
        ? d.reasons[0]
        : d
        ? d.checks.locationUsable
          ? d.checks.insideZone
            ? ar
              ? "داخل منطقة الخطر المؤكدة"
              : "Inside the verified hazard zone"
            : d.checks.routeIntersectsClosure
              ? ar
                ? `المسار يعبر الإغلاق (على بعد ${d.checks.distanceToClosureM} م)`
                : `Route crosses the closure (${d.checks.distanceToClosureM} m ahead)`
              : ar
                ? `خارج المنطقة (${d.checks.distanceToZoneM} م من الحد)`
                : `Outside the zone (${d.checks.distanceToZoneM} m from the boundary)`
          : ar
            ? "الموقع غير قابل للاستخدام — لا استنتاج"
            : "Location unusable — nothing inferred"
        : null,
    },
    {
      icon: Scale,
      title: t("approvedRule"),
      done: !!d,
      body: chain.rule ? L(chain.rule.description) : null,
      ref: d ? `${d.ruleId} · ${d.policyVersion}` : undefined,
    },
    {
      icon: MessageSquareText,
      title: t("communication"),
      done: !!m?.deliveredAt,
      body: m
        ? `${action ? action[lang] : m.actionId} · ${m.language.toUpperCase()}${m.deliveredAt ? ` · ${t("delivered")} ${fmtTime(m.deliveredAt, lang, true)}` : ""}`
        : d?.outcome === "NO_ACTION"
          ? ar
            ? "لم تُرسل رسالة — لا تعليمات ضرورية"
            : "No message sent — none needed"
          : null,
      ref: m ? `${m.actionId} · ${m.variant}` : undefined,
    },
    {
      icon: Reply,
      title: t("citizenResponse"),
      done: !!lastResponse,
      body: lastResponse ? `${lastResponse.kind === "help" ? t("assistance") : lastResponse.kind === "safe" ? t("safe") : t("clarification")} · ${fmtTime(lastResponse.receivedAt, lang, true)}` : null,
    },
    {
      icon: UserCheck,
      title: t("humanFollowUp"),
      done: !!chain.case?.acknowledgedAt,
      body: chain.case ? (chain.case.acknowledgedAt ? `${t("acknowledged")} · ${fmtTime(chain.case.acknowledgedAt, lang, true)}` : t("open")) : null,
      ref: chain.case?.id,
    },
  ];
  return (
    <ol className="relative">
      {steps.map((s, i) => (
        <li key={s.title} className="relative flex gap-3 pb-3.5 last:pb-0" title={s.ref}>
          {i < steps.length - 1 && <span className={cn("absolute start-[11px] top-6 h-[calc(100%-20px)] w-[2px]", s.done ? "bg-teal/40" : "bg-line")} />}
          <span className={cn("relative z-10 grid h-6 w-6 shrink-0 place-items-center rounded-full ring-4 ring-surface", s.done ? "bg-teal text-white" : "bg-surface-2 text-muted")}>
            {s.done ? <Check size={12} strokeWidth={3} /> : <s.icon size={12} />}
          </span>
          <div className="min-w-0 flex-1 pt-px">
            <div className={cn("text-[12.5px] font-semibold", s.done ? "text-ink" : "text-muted")}>{s.title}</div>
            {s.body && <div className="mt-0.5 text-[12px] leading-relaxed text-ink-2">{s.body}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}
