"use client";

import { useEffect, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import {
  ArrowUpRight,
  Check,
  CircleDashed,
  Flag,
  LayoutList,
  LifeBuoy,
  ListChecks,
  Loader2,
  Lock,
  MapPin,
  MessageSquareText,
  Route,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import type { ActionItem, CasesProps, CheckItem, CheckStatus, ComponentKind, CopilotMode, GraphRow, GuidanceProps, OverviewProps, Tone, TraceProps } from "@/domain/copilot";
import type { Part } from "@/lib/copilot-client";
import { useUi } from "@/lib/ui-store";
import { cn } from "@/components/ui";
import { useOps } from "@/components/ops/context";

type Lang = "en" | "ar";
const L = (lang: Lang, en: string, ar: string) => (lang === "ar" ? ar : en);

const KIND_ICON: Record<ComponentKind, ReactNode> = {
  overview: <LayoutList size={14} />,
  cases: <LifeBuoy size={14} />,
  trace: <Route size={14} />,
  guidance: <MessageSquareText size={14} />,
  checks: <ListChecks size={14} />,
  actions: <Flag size={14} />,
};

const ease = [0.22, 1, 0.36, 1] as const;

// ---------------------------------------------------------------------------------- primitives

/** Renders model/rule prose: **bold** and record ids in mono. */
export function Prose({ text, streaming }: { text: string; streaming?: boolean }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\b(?:RES|CASE|EVT|HZ|RC|ACT|REV)-[A-Z0-9-]+\b|\bR-\d{2}-[A-Z]+\b|\bPOLICY-\d{4}-\d{2}\b)/g);
  return (
    <p className="whitespace-pre-wrap text-[13.5px] leading-[1.6] text-ink">
      {parts.map((p, i) =>
        !p ? null : p.startsWith("**") ? (
          <strong key={i} className="font-semibold">
            {p.slice(2, -2)}
          </strong>
        ) : /^(RES|CASE|EVT|HZ|RC|ACT|REV|R|POLICY)-/.test(p) ? (
          <span key={i} className="font-id text-[12px] text-teal-ink" dir="ltr">
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
      {streaming && <span className="ms-0.5 inline-block h-[1.05em] w-[2px] translate-y-[2px] animate-pulse bg-teal align-baseline" />}
    </p>
  );
}

function ToneDot({ tone, size = 20 }: { tone: Tone; size?: number }) {
  const s = { width: size, height: size };
  if (tone === "done")
    return (
      <span style={s} className="grid shrink-0 place-items-center rounded-full bg-teal text-white">
        <Check size={size * 0.6} strokeWidth={3} />
      </span>
    );
  if (tone === "help")
    return (
      <span style={s} className="grid shrink-0 place-items-center rounded-full bg-coral text-white">
        <LifeBuoy size={size * 0.6} strokeWidth={2.4} />
      </span>
    );
  if (tone === "blocked")
    return (
      <span style={s} className="grid shrink-0 place-items-center rounded-full bg-coral-ink text-white">
        <X size={size * 0.6} strokeWidth={3} />
      </span>
    );
  if (tone === "attention")
    return (
      <span style={s} className="relative grid shrink-0 place-items-center rounded-full bg-amber-soft ring-2 ring-amber">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-ink" />
      </span>
    );
  return (
    <span style={s} className="grid shrink-0 place-items-center text-slate">
      <CircleDashed size={size} strokeWidth={1.6} />
    </span>
  );
}

function Tag({ text, tone = "neutral" }: { text: string; tone?: "teal" | "coral" | "amber" | "neutral" }) {
  return (
    <span
      dir="ltr"
      className={cn(
        "rounded-md px-1.5 py-[1px] font-id text-[10.5px] leading-[16px]",
        tone === "neutral" && "bg-surface-2 text-ink-2 ring-1 ring-line",
        tone === "teal" && "bg-teal-soft text-teal-ink",
        tone === "coral" && "bg-coral-soft text-coral-ink",
        tone === "amber" && "bg-amber-soft text-amber-ink",
      )}
    >
      {text}
    </span>
  );
}

/** The connected "graph" of pipeline rows, revealed one by one. */
function GraphRows({ rows }: { rows: GraphRow[] }) {
  return (
    <ol className="relative">
      {rows.map((r, i) => (
        <motion.li
          key={r.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease, delay: 0.05 + i * 0.07 }}
          className={cn("relative grid grid-cols-[20px_1fr_auto] gap-x-3 rounded-lg px-2 py-[7px]", r.emphasized && "bg-teal-soft/70 ring-1 ring-teal/20")}
        >
          {i < rows.length - 1 && <span className="absolute start-[17.5px] top-[29px] bottom-[-7px] w-px bg-line-strong" aria-hidden />}
          <span className="pt-[1px]">
            <ToneDot tone={r.tone} />
          </span>
          <div className="min-w-0">
            <div className={cn("text-[13px] leading-5", r.tone === "pending" ? "text-muted" : "font-medium text-ink")}>{r.label}</div>
            {r.detail && <div className="mt-0.5 text-[12px] leading-[1.45] text-muted">{r.detail}</div>}
            {r.tags.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {r.tags.map((t, j) => (
                  <Tag key={j} text={t.text} tone={t.tone} />
                ))}
              </div>
            )}
          </div>
          <div className="whitespace-nowrap pt-[2px] text-[11px] text-muted tnum">{r.meta}</div>
        </motion.li>
      ))}
    </ol>
  );
}

/** A check pill that resolves from "running" to its real result, staggered for legibility. */
function CheckPill({ item, result, index, lang }: { item: CheckItem; result?: { status: CheckStatus; detail?: string }; index: number; lang: Lang }) {
  const reduced = useUi((s) => s.reducedMotion);
  const [shown, setShown] = useState<CheckStatus>("pending");
  useEffect(() => {
    if (!result) return;
    if (reduced) {
      setShown(result.status);
      return;
    }
    const t = setTimeout(() => setShown(result.status), 260 + index * 240);
    return () => clearTimeout(t);
  }, [result, index, reduced]);
  const detail = result?.detail ?? item.detail;
  return (
    <motion.span
      layout
      title={detail}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors duration-300",
        shown === "pending" && "bg-surface-2 text-muted ring-1 ring-line",
        shown === "pass" && "bg-teal-soft text-teal-ink ring-1 ring-teal/25",
        shown === "fail" && "bg-coral-soft text-coral-ink ring-1 ring-coral/30",
      )}
    >
      {shown === "pending" ? <Loader2 size={12} className="animate-spin" /> : shown === "pass" ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={3} />}
      {item.label}
      <span className="sr-only">{shown === "pending" ? L(lang, "checking", "قيد الفحص") : shown}</span>
    </motion.span>
  );
}

function useRunAction() {
  const ops = useOps();
  return async (a: ActionItem) => {
    const ui = useUi.getState();
    const point = (id: string) => {
      const p = ops.state?.personas.find((x) => x.id === id);
      if (p?.location) ui.flyTo({ kind: "point", lngLat: p.location.coordinates as [number, number], zoom: 16.9, pitch: 62 });
    };
    switch (a.kind) {
      case "activate_incident":
        if (await ops.incidentAction("activate")) ui.flyTo({ kind: "zone" });
        return;
      case "prepare_guidance":
        if (await ops.incidentAction("prepare")) ui.setView("guidance");
        return;
      case "approve_guidance":
        ui.setView("guidance");
        await ops.incidentAction("approve");
        return;
      case "issue_alerts":
        ui.setView("guidance");
        await ops.incidentAction("publish");
        return;
      case "open_case": {
        const c = ops.state?.cases.find((x) => x.id === a.target);
        ui.selectCase(a.target);
        if (c) point(c.recipientId);
        return;
      }
      case "open_recipient":
        ui.selectRecipient(a.target);
        point(a.target);
        return;
      case "open_guidance":
        ui.setView("guidance");
        return;
      case "open_responses":
        ui.setView("responses");
        return;
      case "fly_zone":
        ui.flyTo({ kind: "zone" });
        return;
      case "fly_closure":
        ui.flyTo({ kind: "closure" });
        return;
    }
  };
}

const WORKFLOW = new Set(["activate_incident", "prepare_guidance", "approve_guidance", "issue_alerts"]);

function ActionButton({ a, primary }: { a: ActionItem; primary?: boolean }) {
  const run = useRunAction();
  const { operator, lang } = useOps();
  const [busy, setBusy] = useState(false);
  const roleBlocked = WORKFLOW.has(a.kind) && operator.role !== "duty_officer";
  const allowed = a.allowed && !roleBlocked;
  const reason = roleBlocked ? L(lang, "Only the duty officer can do this", "هذا متاح للضابط المناوب فقط") : a.reason;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <button
        disabled={!allowed || busy}
        title={reason}
        onClick={async () => {
          setBusy(true);
          try {
            await run(a);
          } finally {
            setBusy(false);
          }
        }}
        className={cn(
          "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[12.5px] font-medium transition-colors",
          allowed && primary && "bg-teal text-white hover:bg-teal-ink",
          allowed && !primary && "bg-surface-2 text-ink ring-1 ring-line hover:bg-surface-3",
          !allowed && "cursor-not-allowed bg-surface-2 text-muted ring-1 ring-line",
        )}
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : !allowed ? <Lock size={12} /> : null}
        {a.label}
        {allowed && !busy && <ArrowUpRight size={13} className="rtl:-scale-x-100" />}
      </button>
      {!allowed && reason && <span className="text-[11px] leading-tight text-muted">{reason}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------- cards

function Shell({ kind, label, aside, children, footer }: { kind: ComponentKind; label: string; aside?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, ease }}
      className="overflow-hidden rounded-xl bg-surface ring-1 ring-line shadow-[0_1px_0_rgb(16_44_51/0.03),0_10px_28px_-20px_rgb(16_44_51/0.35)]"
    >
      <header className="flex items-center gap-2 border-b border-line bg-surface-2/60 px-3 py-2">
        <span className="text-teal">{KIND_ICON[kind]}</span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-2 rtl:tracking-normal">{label}</span>
        <div className="ms-auto flex items-center gap-1.5">{aside}</div>
      </header>
      <div className="p-3">{children}</div>
      {footer && <div className="border-t border-line bg-surface-2/40 px-3 py-2.5">{footer}</div>}
    </motion.section>
  );
}

function Building({ kind, label, lang }: { kind: ComponentKind; label: string; lang: Lang }) {
  return (
    <Shell
      kind={kind}
      label={label}
      aside={
        <span className="inline-flex items-center gap-1 text-[11px] text-muted">
          <Loader2 size={12} className="animate-spin" />
          {L(lang, "Building", "جارٍ الإنشاء")}
        </span>
      }
    >
      <div className="space-y-2.5 py-1">
        {[0.92, 0.7, 0.82].map((w, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="h-5 w-5 shrink-0 animate-pulse rounded-full bg-surface-3" />
            <span className="h-3 animate-pulse rounded bg-surface-3" style={{ width: `${w * 100}%`, animationDelay: `${i * 120}ms` }} />
          </div>
        ))}
      </div>
    </Shell>
  );
}

const STATE_LABEL: Record<string, { en: string; ar: string }> = {
  draft: { en: "Awaiting activation", ar: "بانتظار التفعيل" },
  assessed: { en: "Assessed", ar: "تم التقييم" },
  approved: { en: "Approved", ar: "معتمدة" },
  active: { en: "Alerts issued", ar: "صدرت التنبيهات" },
  resolved: { en: "Resolved", ar: "مغلقة" },
  blocked: { en: "Blocked", ar: "محظورة" },
};

function toneChip(t: Tone) {
  return t === "done" ? "bg-teal-soft text-teal-ink" : t === "help" || t === "blocked" ? "bg-coral-soft text-coral-ink" : t === "attention" ? "bg-amber-soft text-amber-ink" : "bg-surface-2 text-ink-2";
}

function OverviewCard({ p, checks, label, lang }: { p: OverviewProps; checks: Record<string, { status: CheckStatus; detail?: string }>; label: string; lang: Lang }) {
  return (
    <Shell
      kind="overview"
      label={label}
      aside={
        <>
          <span className="font-id text-[10.5px] text-muted">{p.incidentId}</span>
          <span className={cn("rounded-full px-2 py-[2px] text-[10.5px] font-semibold", toneChip(p.stateTone))}>{STATE_LABEL[p.state]?.[lang] ?? p.state}</span>
        </>
      }
      footer={
        <div className="flex items-center gap-2.5">
          <ToneDot tone={p.next.tone} size={18} />
          <span className="min-w-0 flex-1 text-[12.5px] font-medium text-ink">{p.next.label}</span>
          {p.next.action && <ActionButton a={p.next.action} primary />}
        </div>
      }
    >
      <div className="mb-2 px-2">
        <div className="text-[14.5px] font-semibold leading-snug text-ink">{p.title}</div>
        <div className="mt-0.5 text-[12.5px] leading-snug text-ink-2">{p.headline}</div>
      </div>
      <GraphRows rows={p.rows} />
      {p.checks.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line px-1 pt-3">
          {p.checks.map((c, i) => (
            <CheckPill key={c.id} item={c} result={checks[c.id]} index={i} lang={lang} />
          ))}
        </div>
      )}
    </Shell>
  );
}

function ago(iso: string, lang: Lang) {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return m < 1 ? L(lang, "now", "الآن") : m < 60 ? L(lang, `${m}m ago`, `قبل ${m} د`) : L(lang, `${Math.round(m / 60)}h ago`, `قبل ${Math.round(m / 60)} س`);
}

function CasesCard({ p, label, lang }: { p: CasesProps; label: string; lang: Lang }) {
  const [showOriginal, setShowOriginal] = useState<string | null>(null);
  return (
    <Shell
      kind="cases"
      label={label}
      aside={
        <span className="text-[11px] text-muted tnum">
          {L(lang, `${p.totals.open} open · ${p.totals.p1} urgent`, `${p.totals.open} مفتوحة · ${p.totals.p1} عاجلة`)}
        </span>
      }
    >
      <ol className="space-y-2">
        {p.items.map((c, i) => (
          <motion.li
            key={c.caseId}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, ease, delay: 0.05 + i * 0.09 }}
            className="rounded-lg p-2.5 ring-1 ring-line"
          >
            <div className="flex items-center gap-2">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-ink text-[10.5px] font-semibold text-white tnum">{i + 1}</span>
              <span className={cn("rounded px-1.5 py-[1px] text-[10.5px] font-bold", c.priority === "P1" ? "bg-coral text-white" : "bg-amber-soft text-amber-ink")}>{c.priority}</span>
              <span className="min-w-0 truncate text-[13px] font-semibold text-ink">{c.displayName}</span>
              <span className="rounded-full bg-coral-soft px-2 py-[1px] text-[10.5px] font-medium text-coral-ink">{c.need}</span>
              <span className="ms-auto whitespace-nowrap text-[11px] text-muted">{ago(c.openedAt, lang)}</span>
            </div>
            <div className="mt-1.5 ps-7">
              <p className="text-[12.5px] leading-[1.5] text-ink-2">{showOriginal === c.caseId ? `“${c.original}”` : c.summary}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
                <span className="inline-flex items-center gap-1">
                  <MapPin size={11} />
                  {c.area}
                </span>
                <span className="font-id">{c.caseId}</span>
                {c.summaryBy === "llm" ? (
                  <button className="inline-flex items-center gap-1 text-teal-ink hover:underline" onClick={() => setShowOriginal((s) => (s === c.caseId ? null : c.caseId))}>
                    <Sparkles size={11} />
                    {showOriginal === c.caseId ? L(lang, "Show AI summary", "عرض ملخص الذكاء الاصطناعي") : L(lang, "AI summary · show citizen's words", "ملخص آلي · عرض كلمات المواطن")}
                  </button>
                ) : (
                  <span>{L(lang, "Citizen's own words", "كلمات المواطن")}</span>
                )}
                <span className="ms-auto">
                  <ActionButton a={{ kind: "open_case", target: c.caseId, label: L(lang, "Open", "فتح"), allowed: true }} />
                </span>
              </div>
            </div>
          </motion.li>
        ))}
      </ol>
    </Shell>
  );
}

function TraceCard({ p, label, lang, mode }: { p: TraceProps; label: string; lang: Lang; mode: CopilotMode }) {
  return (
    <Shell
      kind="trace"
      label={label}
      aside={<span className="font-id text-[10.5px] text-muted">{p.recipientId}</span>}
      footer={
        <div className="flex items-start gap-2">
          {mode === "llm" ? <Sparkles size={14} className="mt-0.5 shrink-0 text-teal" /> : <ShieldCheck size={14} className="mt-0.5 shrink-0 text-ink-2" />}
          <div className="min-w-0 flex-1">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted rtl:tracking-normal">
              {mode === "llm" ? L(lang, "Claude's explanation", "شرح Claude") : L(lang, "Policy rule", "قاعدة السياسة")}
            </div>
            <p className="mt-0.5 text-[12.5px] leading-[1.55] text-ink">{p.explanation}</p>
          </div>
        </div>
      }
    >
      <div className="mb-2 flex items-center gap-2 px-2">
        <span className="text-[14.5px] font-semibold text-ink">{p.displayName}</span>
        <span className="rounded bg-surface-2 px-1.5 py-[1px] text-[10.5px] font-medium uppercase text-ink-2 ring-1 ring-line">{p.language}</span>
        {p.location && (
          <span className="ms-auto">
            <ActionButton a={{ kind: "open_recipient", target: p.recipientId, label: L(lang, "Map", "الخريطة"), allowed: true }} />
          </span>
        )}
      </div>
      <GraphRows rows={p.rows} />
    </Shell>
  );
}

function GuidanceCard({ p, label, lang }: { p: GuidanceProps; label: string; lang: Lang }) {
  const side = (s: GuidanceProps["en"], l: Lang) => (
    <div dir={l === "ar" ? "rtl" : "ltr"} lang={l} className="min-w-0 rounded-lg p-2.5 ring-1 ring-line">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">{l === "ar" ? "العربية" : "English"}</div>
      <div className="text-[13px] font-semibold leading-snug text-ink">{s.headline}</div>
      <p className="mt-1 text-[12px] leading-[1.5] text-ink-2">{s.body}</p>
      <ol className="mt-1.5 space-y-1">
        {s.steps.map((st, i) => (
          <li key={i} className="flex gap-1.5 text-[12px] leading-[1.45] text-ink">
            <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-teal-soft text-[9.5px] font-bold text-teal-ink tnum">{i + 1}</span>
            {st}
          </li>
        ))}
      </ol>
      <div className="mt-2 flex flex-wrap gap-1">
        {s.facts.map((f, i) => (
          <span key={i} className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-[1px] text-[10.5px] text-ink-2">
            <Lock size={9} />
            {f}
          </span>
        ))}
      </div>
    </div>
  );
  return (
    <Shell
      kind="guidance"
      label={label}
      aside={
        <>
          <Tag text={p.actionId} tone="coral" />
          <Tag text={p.variant} />
        </>
      }
      footer={
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
          <span>{L(lang, `${p.recipients} recipients`, `${p.recipients} مستلمًا`)}</span>
          <span className="inline-flex items-center gap-1">
            <ShieldCheck size={11} />
            {p.mode}
          </span>
          <span className="ms-auto">
            <ActionButton a={{ kind: "open_guidance", target: "", label: L(lang, "Open approval", "فتح الاعتماد"), allowed: true }} />
          </span>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-2 @[520px]:grid-cols-2">
        {side(p.en, "en")}
        {side(p.ar, "ar")}
      </div>
    </Shell>
  );
}

function ChecksCard({ items, checks, label, lang }: { items: CheckItem[]; checks: Record<string, { status: CheckStatus; detail?: string }>; label: string; lang: Lang }) {
  return (
    <Shell kind="checks" label={label} aside={<span className="text-[11px] text-muted">{L(lang, "deterministic · run now", "حتمية · الآن")}</span>}>
      <ul className="space-y-1.5">
        {items.map((c, i) => (
          <li key={c.id} className="flex items-start gap-2">
            <CheckPill item={c} result={checks[c.id]} index={i} lang={lang} />
            {(checks[c.id]?.detail ?? c.detail) && <span className="pt-1 text-[11.5px] leading-snug text-muted">{checks[c.id]?.detail ?? c.detail}</span>}
          </li>
        ))}
      </ul>
    </Shell>
  );
}

function ActionsRow({ items }: { items: ActionItem[] }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease }} className="flex flex-wrap items-start gap-2">
      {items.map((a, i) => (
        <ActionButton key={i} a={a} primary={i === 0} />
      ))}
    </motion.div>
  );
}

export function ComponentPart({ part, lang, mode }: { part: Extract<Part, { type: "component" }>; lang: Lang; mode: CopilotMode }) {
  if (part.dropped)
    return (
      <div className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-[12px] text-muted ring-1 ring-line">
        <TriangleAlert size={13} />
        {L(lang, `${part.label} not shown — ${part.dropped}`, `لم يُعرض ${part.label} — ${part.dropped}`)}
      </div>
    );
  const d = part.data;
  if (!d) return part.kind === "actions" ? null : <Building kind={part.kind} label={part.label} lang={lang} />;
  switch (d.kind) {
    case "overview":
      return <OverviewCard p={d.props} checks={part.checks} label={part.label} lang={lang} />;
    case "cases":
      return <CasesCard p={d.props} label={part.label} lang={lang} />;
    case "trace":
      return <TraceCard p={d.props} label={part.label} lang={lang} mode={mode} />;
    case "guidance":
      return <GuidanceCard p={d.props} label={part.label} lang={lang} />;
    case "checks":
      return <ChecksCard items={d.props.items} checks={part.checks} label={part.label} lang={lang} />;
    case "actions":
      return <ActionsRow items={d.props.items} />;
  }
}
