"use client";

import { Ban, CloudRain, Flame, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button, Chip, Disclosure, Field } from "@/components/ui";
import { fmtDateTime, fmtTime } from "@/lib/format";
import { useUi } from "@/lib/ui-store";
import { useOps } from "../context";
import { ActionBar, PanelHeader } from "./PanelHeader";
import { AgentCard, ApproveSendBar } from "./AgentCard";

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

  const running = state.automation.agent.status === "running" || busy === "pipeline";
  const prepared = state.guidance.length > 0;

  // Runs the agent's full preparation now instead of waiting for it to pick the alert up.
  const activate = async () => {
    flyTo({ kind: "zone" });
    await incidentAction("pipeline");
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
        <div className="mt-4">
          <AgentCard />
        </div>
        <dl className="mt-4 divide-y divide-line rounded-2xl bg-surface-2/70 px-4 py-1 ring-1 ring-line">
          {inc.fire ? (
            <>
              <Fact label={lang === "ar" ? "المبنى" : "Building"} onClick={() => flyTo({ kind: "building" })}>
                {L(inc.fire.buildingName)} · {inc.fire.floors} {lang === "ar" ? "طابقًا" : "floors"}
              </Fact>
              <Fact label={lang === "ar" ? "الحريق" : "Fire"}>
                <span className="text-coral-ink">{lang === "ar" ? `الطابق ${inc.fire.fireFloor}` : `Floor ${inc.fire.fireFloor}`}</span>
              </Fact>
              <Fact label={lang === "ar" ? "التعليمات" : "Instruction"}>
                {inc.fire.instruction === "full_evacuation"
                  ? lang === "ar"
                    ? "إخلاء كامل — الدفاع المدني"
                    : "Full evacuation — Civil Defence"
                  : inc.fire.instruction.replace("_", " ")}
              </Fact>
              <Fact label={lang === "ar" ? "التجمع" : "Assembly"}>{L(inc.fire.assemblyPoint.name)}</Fact>
              <Fact label={lang === "ar" ? "الدخان" : "Smoke"} onClick={() => flyTo({ kind: "zone" })}>
                {lang === "ar" ? "يتجه نحو الجنوب الشرقي" : "Drifting south-east"} · {L(inc.fire.wind.label)}
              </Fact>
            </>
          ) : (
            <Fact label={lang === "ar" ? "المنطقة" : "Zone"} onClick={() => flyTo({ kind: "zone" })}>
              {L(inc.areaName)}
            </Fact>
          )}
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
          icon={v.status === "verified" ? <ShieldCheck size={15} className="text-teal" /> : inc.fire ? <Flame size={15} className="text-muted" /> : <CloudRain size={15} className="text-muted" />}
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
        {!blocked && (running || !prepared) && !["active", "resolved"].includes(inc.state) && (
          <Button tone="danger" size="lg" className="w-full" onClick={activate} busy={running} disabled={!canAct} icon={inc.fire ? <Flame size={17} /> : <CloudRain size={17} />}>
            {running ? (lang === "ar" ? "أمان يجهّز…" : "AMAN is preparing…") : assessed ? t("prepareGuidance") : t("activate")}
          </Button>
        )}
        {!blocked && ((prepared && !running) || ["active", "resolved"].includes(inc.state)) && <ApproveSendBar review />}
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
