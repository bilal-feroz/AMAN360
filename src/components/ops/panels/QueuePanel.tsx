"use client";

import { ArrowRight, Ban, CloudRain, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button, Chip, Disclosure, Field } from "@/components/ui";
import { fmtDateTime, fmtTime } from "@/lib/format";
import { useUi } from "@/lib/ui-store";
import { useOps } from "../context";
import { ActionBar, PanelHeader } from "./PanelHeader";

const SEVERITY = { advisory: ["Advisory", "استشاري"], watch: ["Watch", "مراقبة"], warning: ["Warning", "تحذير"], emergency: ["Emergency", "طوارئ"] } as const;

export function QueuePanel() {
  const { state, t, lang, L, incidentAction, busy, canAct } = useOps();
  const { setView, flyTo } = useUi();
  if (!state) return null;
  const inc = state.incident;
  const v = inc.verification;
  const assessed = ["assessed", "approved", "active", "resolved"].includes(inc.state);
  const blocked = inc.state === "blocked";
  const sev = SEVERITY[inc.severity as keyof typeof SEVERITY];

  const activate = async () => {
    flyTo({ kind: "zone" });
    const ok = await incidentAction("activate");
    if (ok) setView("impact");
  };

  return (
    <div className="flex min-h-full flex-col">
      <PanelHeader eyebrow={assessed ? (lang === "ar" ? "الحادثة" : "Incident") : t("incidents")} title={L(inc.title)} />

      <div className="px-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip tone="amber" dot>
            {sev ? sev[lang === "ar" ? 1 : 0] : inc.severity}
          </Chip>
          <Chip tone={v.status === "verified" ? "teal" : v.status === "conflicting" ? "coral" : "neutral"} dot>
            {v.status === "verified" ? t("verified") : v.status === "conflicting" ? t("conflicting") : t("unverified")}
          </Chip>
        </div>
        <dl className="mt-4 divide-y divide-line rounded-2xl bg-surface-2/70 px-4 py-1 ring-1 ring-line">
          <Fact label={lang === "ar" ? "المنطقة" : "Zone"} onClick={() => flyTo({ kind: "zone" })}>
            {L(inc.areaName)}
          </Fact>
          <Fact label={lang === "ar" ? "الإغلاق" : "Closure"} onClick={() => flyTo({ kind: "closure" })}>
            {L(state.closures[0]?.name ?? inc.areaName)} · {state.closures.length} {lang === "ar" ? "مقاطع" : "segments"}
          </Fact>
          <Fact label={t("validUntil")}>{fmtTime(inc.validUntil, lang)}</Fact>
        </dl>

        {blocked && (
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-coral-soft px-3 py-2.5 text-[12.5px] font-medium text-coral-ink">
            <Ban size={15} className="mt-0.5 shrink-0" />
            {lang === "ar" ? "النشر محظور: الحقائق الحرجة متعارضة. يلزم مراجعة المشغّل." : "Publication blocked: critical facts conflict. Operator review required."}
          </div>
        )}

        <Disclosure
          className="mt-4"
          icon={v.status === "verified" ? <ShieldCheck size={15} className="text-teal" /> : <CloudRain size={15} className="text-muted" />}
          summary={
            <>
              {L(inc.sourceAgency.name)}
              {v.status === "verified" && <span className="text-muted"> · {v.notes.length} {lang === "ar" ? "فحوص ناجحة" : "checks passed"}</span>}
            </>
          }
        >
          <dl>
            <Field label={t("source")} mono>
              {inc.sourceRef}
            </Field>
            <Field label={t("issued")}>{fmtDateTime(inc.issuedAt, lang)}</Field>
            <Field label={t("policy")} mono>
              {inc.policyVersion}
            </Field>
            <Field label={lang === "ar" ? "الإجراءات" : "Actions"} mono>
              {inc.approvedActionIds.join(" · ")}
            </Field>
          </dl>
          {v.notes.length > 0 && v.status !== "unverified" && (
            <ul className="mt-2 space-y-1 text-[12px] text-ink-2">
              {v.notes.map((n) => (
                <li key={n} className="flex items-start gap-2">
                  {v.status === "verified" ? <ShieldCheck size={13} className="mt-0.5 shrink-0 text-teal" /> : <TriangleAlert size={13} className="mt-0.5 shrink-0 text-coral" />}
                  {n}
                </li>
              ))}
            </ul>
          )}
        </Disclosure>
      </div>

      <ActionBar>
        {!assessed && !blocked && (
          <>
            <p className="mb-2.5 text-center text-[12px] leading-snug text-muted">
              {lang === "ar"
                ? "يتحقق أمان من المصدر، ويحدّد المتأثرين، ويجهّز رسائل لموافقتك. لا يُرسل شيء قبل موافقتك."
                : "AMAN checks the source, finds who is affected and drafts messages for you to approve. Nothing is sent until you approve."}
            </p>
            <Button tone="danger" size="lg" className="w-full" onClick={activate} busy={busy === "activate"} disabled={!canAct} icon={<CloudRain size={17} />}>
              {busy === "activate" ? t("activating") : t("activate")}
            </Button>
          </>
        )}
        {assessed && (
          <Button tone="primary" size="lg" className="w-full" onClick={() => setView("impact")} icon={<ArrowRight size={16} className="rtl:rotate-180" />}>
            {lang === "ar" ? "عرض المتأثرين" : "See who is affected"}
          </Button>
        )}
        {blocked && (
          <Button size="lg" className="w-full" onClick={() => setView("audit")}>
            {lang === "ar" ? "عرض سجل التدقيق" : "Open audit log"}
          </Button>
        )}
      </ActionBar>
    </div>
  );
}

function Fact({ label, children, onClick }: { label: string; children: React.ReactNode; onClick?: () => void }) {
  return (
    <div className="grid grid-cols-[84px_1fr] gap-3 py-2.5 text-[13px]">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 text-ink">
        {onClick ? (
          <button onClick={onClick} className="text-start font-medium hover:text-teal-ink hover:underline">
            {children}
          </button>
        ) : (
          <span className="font-medium">{children}</span>
        )}
      </dd>
    </div>
  );
}
