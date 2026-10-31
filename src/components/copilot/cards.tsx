"use client";

import { useEffect, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import {
  Radar,
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
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import type { ActionItem, CasesProps, CheckItem, CheckStatus, ComponentKind, CopilotMode, GraphRow, GuidanceProps, OverviewProps, SignalsProps, Tone, TraceProps } from "@/domain/copilot";
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
  signals: <Radar size={14} />,
};

const ease = [0.22, 1, 0.36, 1] as const;

// ---------------------------------------------------------------------------------- primitives

const ID_RE = /(\*\*[^*]+\*\*|\b(?:RES|CASE|EVT|HZ|RC|ACT|REV|SIM|OP)-[A-Za-z0-9/-]+\b|\bR-\d{2}-[A-Z]+\b|\bPOLICY-\d{4}-\d{2}\b)/g;
const HAS_ID = /\b(?:RES|CASE|EVT|HZ|RC|ACT|REV|SIM|OP)-[A-Za-z0-9/-]+\b/;

/** **bold** and record ids (kept left-to-right and unbroken, also inside Arabic text). */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(ID_RE).map((p, i) =>
        !p ? null : p.startsWith("**") ? (
          <strong key={i} className="font-semibold">
            {p.slice(2, -2)}
          </strong>
        ) : /^(RES|CASE|EVT|HZ|RC|ACT|REV|SIM|OP|R|POLICY)-/.test(p) ? (
          <bdi key={i} dir="ltr" className="whitespace-nowrap font-id text-[0.88em] text-muted">
            {p}
          </bdi>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

/** Renders model/rule prose. */
export function Prose({ text, streaming }: { text: string; streaming?: boolean }) {
  return (
    <p className="whitespace-pre-wrap text-[13.5px] leading-[1.6] text-ink">
      <Rich text={text} />
      {streaming && <span className="ms-0.5 inline-block h-[1.05em] w-[2px] translate-y-[2px] animate-pulse bg-teal align-baseline" />}
    </p>
  );
}

function ToneDot({ tone, size = 18 }: { tone: Tone; size?: number }) {
  const s = { width: size, height: size };
  if (tone === "done")
    return (
      <span style={s} className="grid shrink-0 place-items-center rounded-full bg-teal text-white">
        <Check size={size * 0.6} strokeWidth={3} />
      </span>
    );
  if (tone === "help")
    return (
      <span style={s} className="grid shrink-0 place-items-center rounded-full bg-coral-ink text-white">
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
      <span style={s} className="grid shrink-0 place-items-center rounded-full bg-amber-soft ring-2 ring-amber">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-ink" />
      </span>
    );
  return (
    <span style={s} className="grid shrink-0 place-items-center text-slate">
      <CircleDashed size={size} strokeWidth={1.6} />
    </span>
  );
}

/** The connected "graph" of pipeline rows, revealed one by one. Record ids stay in the tooltip. */
function GraphRows({ rows }: { rows: GraphRow[] }) {
  return (
    <ol className="relative">
      {rows.map((r, i) => (
        <motion.li
          key={r.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease, delay: 0.05 + i * 0.07 }}
          title={r.tags.map((t) => t.text).join(" · ") || undefined}
          className={cn("relative grid grid-cols-[18px_1fr_auto] gap-x-3 rounded-lg px-2 py-[6px]", r.emphasized && "bg-teal-soft/70")}
        >
          {i < rows.length - 1 && <span className="absolute start-[16.5px] top-[27px] bottom-[-6px] w-px bg-line-strong" aria-hidden />}
          <span className="pt-[1px]">
            <ToneDot tone={r.tone} />
          </span>
          <div className="min-w-0">
            <div className={cn("text-[13px] leading-5", r.tone === "pending" ? "text-muted" : "font-medium text-ink")}>{r.label}</div>
            {r.detail && <div className="mt-0.5 text-[12px] leading-[1.45] text-muted">{r.detail}</div>}
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
        "inline-flex items-center gap-1.5 rounded-full px-2 py-[3px] text-[11.5px] font-medium transition-colors duration-300",
        shown === "pending" && "bg-surface-2 text-muted",
        shown === "pass" && "bg-teal-soft text-teal-ink",
        shown === "fail" && "bg-coral-soft text-coral-ink",
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
      case "open_signals":
      case "open_replay": {
        const dataset = a.kind === "open_replay" ? "replay" : "scenario";
        ui.setSignals({ dataset, postId: null, hotspotId: null });
        ui.setView("signals");
        ui.flyTo(dataset === "replay" ? { kind: "replay" } : { kind: "zone" });
        return;
      }
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
  // Record ids belong in the tooltip, not on the button face.
  const label = a.kind === "open_case" && HAS_ID.test(a.label) ? L(lang, "Open case", "فتح الحالة") : a.label;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <button
        disabled={!allowed || busy}
        title={[a.label !== label ? a.label : null, reason].filter(Boolean).join(" — ") || undefined}
        onClick={async () => {
          setBusy(true);
          try {
            await run(a);
          } finally {
            setBusy(false);
          }
        }}
        className={cn(
          "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] px-3 text-[12.5px] font-semibold transition-colors",
          allowed && primary && "bg-teal text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.16),0_1px_2px_rgb(6_70_67/0.35)] hover:bg-teal-ink",
          allowed && !primary && "bg-surface text-ink shadow-[0_1px_2px_rgb(16_44_51/0.06)] ring-1 ring-line-strong/80 hover:bg-surface-2",
          !allowed && "cursor-not-allowed bg-surface-2 text-muted",
        )}
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : !allowed ? <Lock size={12} /> : null}
        {label}
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
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease }}
      className="overflow-hidden rounded-2xl bg-surface shadow-[0_1px_2px_rgb(16_44_51/0.05)] ring-1 ring-line"
    >
      <header className="flex items-center gap-2 px-3.5 pb-1 pt-3">
        <span className="text-muted">{KIND_ICON[kind]}</span>
        <span className="text-[12.5px] font-semibold text-ink-2">{label}</span>
        <div className="ms-auto flex items-center gap-1.5">{aside}</div>
      </header>
      <div className="px-2 pb-2.5 pt-1">{children}</div>
      {footer && <div className="border-t border-line px-3.5 py-2.5">{footer}</div>}
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
      <div className="space-y-2.5 px-1.5 py-1">
        {[0.92, 0.7, 0.82].map((w, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="h-[18px] w-[18px] shrink-0 animate-pulse rounded-full bg-surface-3" />
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
        <span title={p.incidentId} className={cn("rounded-full px-2 py-[2px] text-[11px] font-semibold", toneChip(p.stateTone))}>
          {STATE_LABEL[p.state]?.[lang] ?? p.state}
        </span>
      }
      footer={
        <div className="flex items-center gap-2.5">
          <ToneDot tone={p.next.tone} size={18} />
          <span className="min-w-0 flex-1 text-[13px] font-semibold text-ink">{p.next.label}</span>
          {p.next.action && <ActionButton a={p.next.action} primary />}
        </div>
      }
    >
      <div className="mb-2 px-1.5">
        <div className="text-[14.5px] font-semibold leading-snug text-ink">{p.title}</div>
        <div className="mt-0.5 text-[12.5px] leading-snug text-ink-2">{p.headline}</div>
      </div>
      <GraphRows rows={p.rows} />
      {p.checks.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-line px-1.5 pt-2.5">
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
  const llm = p.items[0]?.summaryBy === "llm";
  return (
    <Shell
      kind="cases"
      label={label}
      footer={
        <p className="flex items-center gap-1.5 text-[11.5px] leading-snug text-muted">
          {llm && <Sparkles size={11} className="shrink-0 text-violet" />}
          {llm ? L(lang, "Claude suggests order and summaries. Priority comes from the rules.", "Claude يقترح الترتيب والملخصات. الأولوية من القواعد.") : L(lang, "Ordered by rules: P1 first, then oldest.", "مرتبة بالقواعد: P1 أولاً ثم الأقدم.")}
        </p>
      }
      aside={
        <span className="text-[11.5px] text-muted tnum">
          {L(lang, `${p.totals.open} open · ${p.totals.p1} urgent`, `${p.totals.open} مفتوحة · ${p.totals.p1} عاجلة`)}
        </span>
      }
    >
      <ol className="space-y-1.5 px-1.5">
        {p.items.map((c, i) => (
          <motion.li
            key={c.caseId}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, ease, delay: 0.05 + i * 0.09 }}
            className="rounded-xl p-2.5 ring-1 ring-line"
          >
            <div className="flex items-center gap-2" title={c.caseId}>
              <span className={cn("rounded-md px-1.5 py-[1px] text-[11px] font-bold", c.priority === "P1" ? "bg-coral-ink text-white" : "bg-amber-soft text-amber-ink")}>{c.priority}</span>
              <bdi className="min-w-0 truncate text-[13px] font-semibold text-ink">{c.displayName}</bdi>
              <span className="truncate text-[11.5px] font-medium text-coral-ink">{c.need}</span>
              <span className="ms-auto whitespace-nowrap text-[11px] text-muted">{ago(c.openedAt, lang)}</span>
            </div>
            <p className="mt-1.5 text-[12.5px] leading-[1.5] text-ink-2" dir="auto">
              {showOriginal === c.caseId ? `“${c.original}”` : c.summary}
            </p>
            <div className="mt-2 flex items-center gap-3 text-[11.5px] text-muted">
              <span className="inline-flex min-w-0 items-center gap-1 truncate">
                <MapPin size={11} className="shrink-0" />
                {c.area}
              </span>
              {c.summaryBy === "llm" && (
                <button className="shrink-0 font-medium text-violet-ink hover:underline" onClick={() => setShowOriginal((s) => (s === c.caseId ? null : c.caseId))}>
                  {showOriginal === c.caseId ? L(lang, "AI summary", "ملخص آلي") : L(lang, "Their words", "كلماتهم")}
                </button>
              )}
              <span className="ms-auto shrink-0">
                <ActionButton a={{ kind: "open_case", target: c.caseId, label: L(lang, "Open", "فتح"), allowed: true }} />
              </span>
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
      footer={
        <div>
          <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-muted">
            {mode === "llm" && <Sparkles size={11} className="text-violet" />}
            {mode === "llm" ? L(lang, "Claude's explanation", "شرح Claude") : L(lang, "Policy rule", "قاعدة السياسة")}
          </div>
          <p className="mt-0.5 text-[12.5px] leading-[1.55] text-ink">
            <Rich text={p.explanation} />
          </p>
        </div>
      }
    >
      <div className="mb-1.5 flex items-center gap-2 px-1.5" title={p.recipientId}>
        <bdi className="text-[14.5px] font-semibold text-ink">{p.displayName}</bdi>
        <span className="text-[11.5px] font-medium uppercase text-muted">{p.language}</span>
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
    <div dir={l === "ar" ? "rtl" : "ltr"} lang={l} className="min-w-0 rounded-xl bg-surface-2/70 p-3">
      <div className="mb-1 text-[11px] font-semibold text-muted">{l === "ar" ? "العربية" : "English"}</div>
      <div className="text-[13px] font-semibold leading-snug text-ink">{s.headline}</div>
      <p className="mt-1 text-[12px] leading-[1.5] text-ink-2">{s.body}</p>
      <ol className="mt-1.5 space-y-1">
        {s.steps.map((st, i) => (
          <li key={i} className="flex gap-1.5 text-[12px] leading-[1.45] text-ink">
            <span className="tnum shrink-0 font-semibold text-muted">{i + 1}.</span>
            {st}
          </li>
        ))}
      </ol>
      {s.facts.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1" title={L(lang, "Locked facts — the AI cannot change these", "حقائق مقفلة — لا يمكن للذكاء الاصطناعي تغييرها")}>
          {s.facts.map((f, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-md bg-teal-soft px-1.5 py-[1px] text-[10.5px] text-teal-ink">
              <Lock size={9} />
              {f}
            </span>
          ))}
        </div>
      )}
    </div>
  );
  return (
    <Shell
      kind="guidance"
      label={label}
      aside={
        <span className="text-[11.5px] text-muted tnum" title={`${p.actionId} · ${p.variant} · ${p.mode}`}>
          {L(lang, `${p.recipients} people`, `${p.recipients} شخصًا`)}
        </span>
      }
      footer={
        <div className="flex justify-end">
          <ActionButton a={{ kind: "open_guidance", target: "", label: L(lang, "Open approval", "فتح الاعتماد"), allowed: true }} />
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-2 px-1.5 @[520px]:grid-cols-2">
        {side(p.en, "en")}
        {side(p.ar, "ar")}
      </div>
    </Shell>
  );
}

function ChecksCard({ items, checks, label, lang }: { items: CheckItem[]; checks: Record<string, { status: CheckStatus; detail?: string }>; label: string; lang: Lang }) {
  return (
    <Shell kind="checks" label={label} aside={<span className="text-[11.5px] text-muted">{L(lang, "Run now", "الآن")}</span>}>
      <ul className="space-y-1.5 px-1.5">
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
      <div className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-[12px] text-muted">
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
    case "signals":
      return <SignalsCard p={d.props} label={part.label} lang={lang} />;
  }
}

function SignalsCard({ p, label, lang }: { p: SignalsProps; label: string; lang: Lang }) {
  const f = p.funnel;
  return (
    <Shell
      kind="signals"
      label={label}
      aside={<span className={cn("rounded-full px-2 py-[2px] text-[11px] font-semibold", p.synthetic ? "bg-amber-soft text-amber-ink" : "bg-violet-soft text-violet-ink")}>{p.synthetic ? L(lang, "Synthetic", "اصطناعي") : L(lang, "Real posts", "منشورات حقيقية")}</span>}
      footer={
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 text-[11.5px] leading-snug text-muted">{L(lang, "Unverified — can only trigger a human verification request.", "غير متحقق منها — لا تؤدي إلا إلى طلب تحقق بشري.")}</p>
          <ActionButton a={{ kind: p.dataset === "replay" ? "open_replay" : "open_signals", target: "", label: L(lang, "Open signals", "فتح الرصد"), allowed: true }} />
        </div>
      }
    >
      <div className="px-1.5">
        <p className="text-[12.5px] leading-[1.5] text-ink">{p.headline}</p>
        <p className="tnum mt-1.5 text-[11.5px] text-muted">
          {L(lang, `${f.found} posts · ${f.relevant} relevant · ${f.hotspots} hotspots · ${f.corroborated} corroborated`, `${f.found} منشور · ${f.relevant} ذو صلة · ${f.hotspots} بؤر · ${f.corroborated} مؤكدة`)}
        </p>
        {p.rumours.length > 0 && (
          <div className="mt-2.5 space-y-1">
            {p.rumours.map((r) => (
              <div key={r.id} className="flex items-center gap-2 rounded-lg bg-amber-soft/70 px-2.5 py-1.5 text-[12px]">
                <span className="font-semibold text-amber-ink">{L(lang, "Rumour", "شائعة")}</span>
                <span className="min-w-0 flex-1 truncate text-ink">“{r.claim}”</span>
                <span className="tnum text-muted">{r.posts}</span>
              </div>
            ))}
          </div>
        )}
        <ul className="mt-2.5 space-y-1">
          {p.hotspots.map((h, i) => (
            <motion.li key={h.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, ease, delay: 0.05 + i * 0.07 }} className="flex items-center gap-2.5 rounded-lg px-1 py-1">
              {h.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={h.thumb} alt="" className="h-8 w-8 rounded-md object-cover" />
              ) : (
                <span className="grid h-8 w-8 place-items-center rounded-md bg-violet-soft text-violet">
                  <Radar size={14} />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-semibold text-ink">{h.label}</div>
                <div className="text-[11px] text-muted tnum">
                  {h.posts} {L(lang, "posts", "منشورات")} · {h.sources} {L(lang, "sources", "مصادر")}
                  {h.insideZone === false && <span className="text-amber-ink"> · {L(lang, "outside zone", "خارج المنطقة")}</span>}
                </div>
              </div>
              {h.corroborated && <span className="rounded-full bg-ink px-1.5 py-[1px] text-[10.5px] font-semibold text-white">{L(lang, "Corroborated", "مؤكدة")}</span>}
            </motion.li>
          ))}
        </ul>
      </div>
    </Shell>
  );
}
