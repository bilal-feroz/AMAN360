"use client";

import { useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Check, ChevronRight, Crosshair, Info, ShieldCheck } from "lucide-react";
import { AnimatedNumber, Button, cn, Segmented, useNow } from "@/components/ui";
import { useUi } from "@/lib/ui-store";
import { signalAction, useSignalsStore, type HotspotView, type SignalItemView, type SignalsView } from "@/lib/use-signals";
import { useOps } from "@/components/ops/context";
import { CATEGORY, CategoryChip, fmtPostTime, L, n, PLATFORM, VIOLET_BTN } from "./meta";
import { PostDetail } from "./PostDetail";
import { LANGUAGE_NAMES } from "@/domain/language";

const EASE = [0.22, 1, 0.36, 1] as const;

export function SignalsPanel() {
  const { lang, canAct, run } = useOps();
  const sel = useUi((s) => s.signals);
  const setSignals = useUi((s) => s.setSignals);
  const flyTo = useUi((s) => s.flyTo);
  const view = useSignalsStore((s) => s.views[sel.dataset]);
  const load = useSignalsStore((s) => s.load);
  const post = view?.items.find((i) => i.post.id === sel.postId) ?? null;

  const switchDataset = (d: "scenario" | "replay") => {
    setSignals({ dataset: d, postId: null, hotspotId: null });
    flyTo(d === "replay" ? { kind: "replay" } : { kind: "zone" });
  };

  const act = async (action: "request_verification" | "issue_clarification" | "dismiss", targetId: string) => {
    await run(`signal:${action}:${targetId}`, () => signalAction(action, sel.dataset, targetId));
    await load(sel.dataset);
  };

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-surface/95 px-5 py-3.5 backdrop-blur">
        <h2 className="text-[16px] font-semibold text-ink">{L(lang, "Social signals", "رصد التواصل")}</h2>
        <Segmented
          className="ms-auto"
          ariaLabel={L(lang, "Dataset", "مجموعة البيانات")}
          size="sm"
          value={sel.dataset}
          onChange={switchDataset}
          options={[
            { value: "scenario", label: L(lang, "Live drill", "التمرين المباشر") },
            { value: "replay", label: L(lang, "Real storm · Oct 2026", "عاصفة حقيقية · أكتوبر 2026") },
          ]}
        />
      </header>

      {!view ? (
        <div className="space-y-3 p-5">
          <div className="h-20 animate-pulse rounded-2xl bg-surface-2" />
          <div className="h-40 animate-pulse rounded-2xl bg-surface-2" />
        </div>
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          {post ? (
            <motion.div key={`post-${post.post.id}`} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0, transition: { duration: 0.3, ease: EASE } }} exit={{ opacity: 0, x: -12, transition: { duration: 0.14 } }}>
              <PostDetail item={post} view={view} onBack={() => setSignals({ postId: null })} />
            </motion.div>
          ) : (
            <motion.div key={`overview-${sel.dataset}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE } }} exit={{ opacity: 0, transition: { duration: 0.12 } }}>
              <Overview view={view} canAct={canAct} act={act} />
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}

function Overview({ view, canAct, act }: { view: SignalsView; canAct: boolean; act: (a: "request_verification" | "issue_clarification" | "dismiss", id: string) => Promise<void> }) {
  const { lang } = useOps();
  const [langFilter, setLangFilter] = useState<string | null>(null);
  return (
    <div className="pb-6">
      <SourceLine view={view} />
      <Funnel view={view} />
      <Languages view={view} value={langFilter} onChange={setLangFilter} />
      {view.rumours.length > 0 && <Rumours view={view} canAct={canAct} act={act} />}
      <Hotspots view={view} canAct={canAct} act={act} />
      {view.confusion.length > 0 && <Questions view={view} />}
      <Feed view={view} langFilter={langFilter} onClearLang={() => setLangFilter(null)} />
      <p className="mx-5 mt-5 flex items-center gap-1.5 text-[11.5px] text-muted">
        <ShieldCheck size={13} className="shrink-0 text-teal" />
        {L(lang, "A hotspot can only trigger a human verification request.", "لا يمكن للبؤرة إلا أن تطلب تحققًا بشريًا.")}
      </p>
    </div>
  );
}

function SourceLine({ view }: { view: SignalsView }) {
  const { lang } = useOps();
  const [more, setMore] = useState(false);
  const real = !view.meta.synthetic;
  return (
    <div className="mx-5 mt-4 text-[12px]">
      <div className="flex items-center gap-2">
        <span className={cn("h-2 w-2 shrink-0 rounded-full", real ? "bg-violet" : "bg-amber")} />
        <span className={cn("font-semibold", real ? "text-violet-ink" : "text-amber-ink")}>
          {real ? L(lang, "Real public posts", "منشورات عامة حقيقية") : L(lang, "Synthetic posts", "منشورات اصطناعية")}
        </span>
        <span className="text-muted">· {real ? "10–25 Oct 2026" : L(lang, "training drill", "تمرين تدريبي")}</span>
        <button
          onClick={() => setMore((m) => !m)}
          aria-expanded={more}
          aria-label={L(lang, "About this data", "عن هذه البيانات")}
          className={cn("ms-auto grid h-6 w-6 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink", more && "bg-surface-2 text-ink")}
        >
          <Info size={13} />
        </button>
      </div>
      {more && (
        <p className="mt-2 rounded-xl bg-surface-2 px-3 py-2.5 leading-relaxed text-ink-2">
          {real
            ? L(
                lang,
                `Storms brought hail and heavy rain to Sharjah's central region and east coast. ${view.funnel.found} public Instagram, TikTok and YouTube posts were retrieved through Oriane video search; Claude read every one and watched the frames of ${view.funnel.viewedFrames} videos.`,
                `جلبت العواصف البرد والأمطار الغزيرة إلى المنطقة الوسطى والساحل الشرقي في الشارقة. جُلب ${view.funnel.found} منشورًا عامًا من إنستغرام وتيك توك ويوتيوب عبر بحث Oriane للفيديو؛ قرأها Claude جميعها وشاهد لقطات ${view.funnel.viewedFrames} مقطعًا.`,
              )
            : L(lang, "Written for the drill — no real people. Posts arrive on the scenario clock, so new reports and rumours appear while you work.", "كُتبت للتمرين — لا أشخاص حقيقيين. تصل المنشورات وفق ساعة السيناريو، فتظهر بلاغات وشائعات جديدة أثناء العمل.")}
        </p>
      )}
    </div>
  );
}

function Funnel({ view }: { view: SignalsView }) {
  const { lang } = useOps();
  const f = view.funnel;
  const steps = [
    { k: "found", v: f.found, en: "found", ar: "عُثر عليها" },
    { k: "kept", v: f.relevant, en: "relevant", ar: "ذات صلة" },
    { k: "mapped", v: f.located, en: "on map", ar: "على الخريطة" },
    { k: "hot", v: f.hotspots, en: "hotspots", ar: "بؤر" },
  ];
  const extra = [
    L(lang, `${f.noise} noise removed`, `${f.noise} ضوضاء مستبعدة`),
    f.reposts > 0 ? L(lang, `${f.reposts} old reposts`, `${f.reposts} إعادة نشر قديمة`) : null,
    L(lang, `${f.corroborated} corroborated`, `${f.corroborated} مؤكدة بمصادر متعددة`),
    f.rumours > 0 ? L(lang, `${f.rumours} rumours`, `${f.rumours} شائعات`) : null,
  ].filter(Boolean);
  return (
    <div className="mx-5 mt-3 rounded-2xl px-4 py-3 ring-1 ring-line">
      <div className="flex items-center">
        {steps.map((s, i) => (
          <div key={s.k} className="flex min-w-0 flex-1 items-center">
            <div className="min-w-0 flex-1">
              <div className={cn("text-[19px] font-semibold leading-none tracking-[-0.02em]", i === steps.length - 1 ? "text-violet" : "text-ink")}>
                <AnimatedNumber value={s.v} />
              </div>
              <div className="mt-1 truncate text-[11px] font-medium text-muted">{L(lang, s.en, s.ar)}</div>
            </div>
            {i < steps.length - 1 && <ChevronRight size={13} className="mx-1 shrink-0 text-line-strong rtl:rotate-180" />}
          </div>
        ))}
      </div>
      <p className="mt-2.5 border-t border-line pt-2 text-[11px] text-muted">{extra.join(" · ")}</p>
    </div>
  );
}

/** The languages people posted in — tap one to read only those posts. */
function Languages({ view, value, onChange }: { view: SignalsView; value: string | null; onChange: (code: string | null) => void }) {
  const { lang } = useOps();
  const rows = view.languages.filter((l) => l.relevant > 0);
  if (rows.length < 2) return null;
  return (
    <div className="mx-5 mt-3">
      <div className="mb-1.5 text-[11.5px] font-medium text-muted">
        {L(lang, `Relevant posts came in ${rows.length} languages`, `جاءت المنشورات ذات الصلة بـ ${rows.length} لغات`)}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {rows.map((l) => {
          const name = LANGUAGE_NAMES[l.code];
          const on = value === l.code;
          return (
            <button
              key={l.code}
              onClick={() => onChange(on ? null : l.code)}
              aria-pressed={on}
              title={name ? L(lang, name.en, name.native) : l.code}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] ring-1 transition-colors",
                on ? "bg-violet text-white ring-violet" : "bg-surface text-ink ring-line hover:ring-violet/40",
              )}
            >
              <span lang={l.code}>{name?.native ?? l.code}</span>
              <span className={cn("tnum text-[11px]", on ? "text-white/80" : "text-muted")}>{l.relevant}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const STATUS: Record<string, { en: string; ar: string; tone: string }> = {
  unverified: { en: "Unverified", ar: "غير متحقق", tone: "text-violet-ink" },
  requested: { en: "Verification requested", ar: "طُلب التحقق", tone: "text-amber-ink" },
  consistent: { en: "Consistent with verified feed", ar: "متسق مع المصدر الموثق", tone: "text-teal-ink" },
  confirmed: { en: "Confirmed by authority", ar: "أكدته الجهة المختصة", tone: "text-teal-ink" },
  not_confirmed: { en: "Not confirmed", ar: "غير مؤكد", tone: "text-ink-2" },
  dismissed: { en: "Dismissed", ar: "مستبعد", tone: "text-muted" },
};

/** Unverified corroborated hotspots need a decision first, then other unverified ones, then the rest. */
const urgency = (h: HotspotView) => (h.status === "unverified" ? (h.corroborated ? 0 : 1) : 2);

function Hotspots({ view, canAct, act }: { view: SignalsView; canAct: boolean; act: (a: "request_verification" | "dismiss", id: string) => Promise<void> }) {
  const { lang, busy } = useOps();
  const sel = useUi((s) => s.signals);
  const setSignals = useUi((s) => s.setSignals);
  const flyTo = useUi((s) => s.flyTo);
  const [all, setAll] = useState(false);
  const sorted = useMemo(() => view.hotspots.map((h, i) => ({ h, i })).sort((a, b) => urgency(a.h) - urgency(b.h) || a.i - b.i).map((x) => x.h), [view.hotspots]);
  const list = all ? sorted : sorted.slice(0, 5);
  const pending = view.hotspots.filter((h) => urgency(h) === 0).length;
  const replay = view.dataset === "replay";
  const focus = (h: HotspotView) => {
    setSignals({ hotspotId: h.id });
    flyTo({ kind: "point", lngLat: h.center, zoom: replay ? 11.6 : 16.2, pitch: replay ? 62 : 58 });
  };
  return (
    <section className="mt-5 px-5">
      <SectionTitle
        title={L(lang, "Hotspots", "البؤر")}
        aside={pending > 0 ? <span className="text-[11.5px] font-semibold text-violet-ink">{L(lang, `${pending} to verify`, `${pending} بانتظار التحقق`)}</span> : null}
      />
      {!view.hotspots.length && <Empty text={L(lang, "No located reports yet.", "لا توجد بلاغات محددة الموقع بعد.")} />}
      <ul className="space-y-2">
        {list.map((h, i) => {
          const st = STATUS[h.status];
          const active = sel.hotspotId === h.id;
          const meta = [
            n(lang, h.postIds.length, ["post", "posts"], "منشورات"),
            n(lang, h.sources, ["source", "sources"], "مصادر"),
            h.observed.deepWater > 0 ? L(lang, `${h.observed.deepWater} deep water`, `${h.observed.deepWater} مياه عميقة`) : null,
            h.observed.hail > 0 ? L(lang, `${h.observed.hail} hail`, `${h.observed.hail} برد`) : null,
          ].filter(Boolean);
          return (
            <motion.li key={h.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.03 } }}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => focus(h)}
                onKeyDown={(e) => e.key === "Enter" && focus(h)}
                className={cn(
                  "cursor-pointer rounded-2xl bg-surface px-3.5 py-3 ring-1 transition-[box-shadow]",
                  active ? "ring-2 ring-violet" : "ring-line hover:ring-violet/40",
                  h.status === "dismissed" && "opacity-55",
                )}
              >
                <div className="flex items-center gap-2.5">
                  <SeverityDot severity={h.severity} />
                  <span className="min-w-0 truncate text-[13.5px] font-semibold text-ink">{L(lang, h.label.en, h.label.ar)}</span>
                  <span className={cn("shrink-0 rounded-full px-1.5 py-[1px] text-[10.5px] font-semibold", h.corroborated ? "bg-ink text-white" : "bg-surface-2 text-muted")}>
                    {h.corroborated ? L(lang, "Corroborated", "مؤكدة") : L(lang, "Single source", "مصدر واحد")}
                  </span>
                  {h.status !== "unverified" && <span className={cn("ms-auto shrink-0 text-[11px] font-semibold", st.tone)}>{L(lang, st.en, st.ar)}</span>}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 ps-5">
                  <span className="tnum text-[11.5px] text-muted">{meta.join(" · ")}</span>
                  {h.categories.slice(0, 2).map((c) => (
                    <CategoryChip key={c} category={c} lang={lang} size="xs" />
                  ))}
                </div>
                {h.insideZone === false && (
                  <p className="mt-1.5 ps-5 text-[11.5px] font-medium text-amber-ink">{L(lang, "Outside the verified zone — no alert covers it", "خارج المنطقة الموثقة — لا يشمله أي تنبيه")}</p>
                )}
                {h.verification?.note && <p className="ms-5 mt-2 rounded-lg bg-surface-2 px-2.5 py-1.5 text-[11.5px] leading-relaxed text-ink-2">{h.verification.note}</p>}
                {h.status === "unverified" && (
                  <div className="mt-2.5 flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <Button tone="ghost" size="sm" disabled={!canAct} onClick={() => void act("dismiss", h.id)}>
                      {L(lang, "Dismiss", "استبعاد")}
                    </Button>
                    <button disabled={!canAct || busy === `signal:request_verification:${h.id}`} onClick={() => void act("request_verification", h.id)} className={VIOLET_BTN}>
                      <ShieldCheck size={13} /> {L(lang, "Request verification", "طلب التحقق")}
                    </button>
                  </div>
                )}
              </div>
            </motion.li>
          );
        })}
      </ul>
      {view.hotspots.length > 5 && (
        <button onClick={() => setAll((a) => !a)} className="mt-2 text-[12px] font-medium text-violet hover:underline">
          {all ? L(lang, "Show fewer", "عرض أقل") : L(lang, `Show all ${view.hotspots.length}`, `عرض الكل (${view.hotspots.length})`)}
        </button>
      )}
    </section>
  );
}

function SeverityDot({ severity }: { severity: "low" | "medium" | "high" }) {
  const c = severity === "high" ? "#e2553d" : severity === "medium" ? "#6d4cf0" : "#a99cf5";
  return <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c, boxShadow: `0 0 0 3px ${c}33` }} />;
}

function Rumours({ view, canAct, act }: { view: SignalsView; canAct: boolean; act: (a: "issue_clarification" | "dismiss", id: string) => Promise<void> }) {
  const { lang, busy } = useOps();
  const [preview, setPreview] = useState<string | null>(null);
  const flagged = view.rumours.filter((r) => r.status === "flagged").length;
  return (
    <section data-rumours className="mt-5 scroll-mt-28 px-5">
      <SectionTitle
        title={L(lang, "Rumours", "الشائعات")}
        aside={flagged > 0 ? <span className="text-[11.5px] font-semibold text-amber-ink">{L(lang, `${flagged} spreading`, `${flagged} منتشرة`)}</span> : null}
      />
      <ul className="space-y-2">
        {view.rumours.map((r) => {
          const shown = r.status === "clarified" ? r.clarification?.text ?? r.preview : r.preview;
          return (
            <li key={r.id} className={cn("overflow-hidden rounded-2xl bg-surface ring-1", r.status === "flagged" ? "ring-amber/50" : "ring-line", r.status === "dismissed" && "opacity-55")}>
              <div className="px-3.5 py-3">
                <p className="text-[13.5px] font-semibold leading-snug text-ink" dir="auto">“{r.claim}”</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px]">
                  <span className="tnum text-muted">
                    {n(lang, r.postIds.length, ["post", "posts"], "منشورات")} · {n(lang, r.sources, ["account", "accounts"], "حسابات")}
                  </span>
                  {r.status === "clarified" ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-teal-ink">
                      <Check size={12} />
                      {L(lang, "Clarification issued", "صدر التوضيح")}
                    </span>
                  ) : (
                    <span className="font-semibold text-amber-ink">{L(lang, "No verified source", "لا مصدر موثق")}</span>
                  )}
                </div>
              </div>
              {(preview === r.id || r.status === "clarified") && (
                <div className="border-t border-line px-3.5 py-3">
                  <div className="grid grid-cols-2 gap-2 text-[11.5px] leading-relaxed">
                    <p className="rounded-xl bg-surface-2 p-2.5 text-ink" dir="ltr" lang="en">{shown.en}</p>
                    <p className="rounded-xl bg-surface-2 p-2.5 text-ink" dir="rtl" lang="ar">{shown.ar}</p>
                  </div>
                  <p className="mt-2 text-[11px] text-muted">{L(lang, "Approved template — only the place name is filled in.", "قالب معتمد — يُملأ اسم المكان فقط.")}</p>
                </div>
              )}
              {r.status === "flagged" && (
                <div className="flex items-center gap-1.5 border-t border-line px-3.5 py-2.5">
                  <Button tone="ghost" size="sm" disabled={!canAct} onClick={() => void act("dismiss", r.id)}>
                    {L(lang, "Dismiss", "استبعاد")}
                  </Button>
                  {preview !== r.id ? (
                    <Button size="sm" className="ms-auto" onClick={() => setPreview(r.id)}>
                      {L(lang, "Preview clarification", "معاينة التوضيح")}
                    </Button>
                  ) : (
                    <Button size="sm" tone="primary" className="ms-auto" disabled={!canAct} busy={busy === `signal:issue_clarification:${r.id}`} onClick={() => void act("issue_clarification", r.id)} icon={<ShieldCheck size={13} />}>
                      {L(lang, "Approve & issue", "اعتماد وإصدار")}
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Questions({ view }: { view: SignalsView }) {
  const { lang } = useOps();
  return (
    <section className="mt-5 px-5">
      <SectionTitle title={L(lang, "What people are asking", "ما يسأل عنه الناس")} />
      <ul className="divide-y divide-line rounded-2xl ring-1 ring-line">
        {view.confusion.map((q) => (
          <li key={q.id} className="flex items-start gap-3 px-3.5 py-2.5">
            <span className="tnum mt-0.5 min-w-5 text-[12px] font-semibold text-muted">{q.postIds.length}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] leading-snug text-ink" dir="auto">{q.question}</p>
              {q.answer ? (
                <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-teal-ink" title={q.answer.id}>
                  <Check size={11} /> {L(lang, "Covered by an approved answer", "تغطيه إجابة معتمدة")}
                </p>
              ) : (
                <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-amber-ink">
                  <ArrowRight size={11} className="rtl:rotate-180" /> {L(lang, "No approved answer yet", "لا توجد إجابة معتمدة بعد")}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Feed({ view, langFilter, onClearLang }: { view: SignalsView; langFilter: string | null; onClearLang: () => void }) {
  const { lang } = useOps();
  const [tab, setTab] = useState<"kept" | "noise" | "all">("kept");
  const now = useNow(30_000);
  const setSignals = useUi((s) => s.setSignals);
  const hotspotId = useUi((s) => s.signals.hotspotId);
  const hotspot = view.hotspots.find((h) => h.id === hotspotId) ?? null;
  const items = useMemo(() => {
    let list = view.items;
    if (hotspot) list = list.filter((i) => hotspot.postIds.includes(i.post.id));
    if (langFilter) list = list.filter((i) => i.post.language === langFilter);
    if (tab === "kept") list = list.filter((i) => i.analysis?.relevant);
    if (tab === "noise") list = list.filter((i) => i.analysis && !i.analysis.relevant);
    return list;
  }, [view.items, tab, hotspot, langFilter]);
  const rel = view.dataset === "scenario" ? now : null;
  return (
    <section className="mt-5 px-5">
      <SectionTitle
        title={L(lang, "Posts", "المنشورات")}
        aside={
          <Segmented
            ariaLabel="Filter"
            size="sm"
            value={tab}
            onChange={setTab}
            options={[
              { value: "kept", label: L(lang, "Kept", "مقبولة") },
              { value: "noise", label: L(lang, "Noise", "ضوضاء") },
              { value: "all", label: L(lang, "All", "الكل") },
            ]}
          />
        }
      />
      {(hotspot || langFilter) && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {hotspot && (
            <button onClick={() => setSignals({ hotspotId: null })} className="inline-flex items-center gap-1.5 rounded-full bg-violet-soft px-2.5 py-1 text-[11.5px] font-medium text-violet-ink">
              {L(lang, `Showing ${hotspot.label.en}`, `عرض ${hotspot.label.ar}`)} <span aria-hidden>×</span>
            </button>
          )}
          {langFilter && (
            <button onClick={onClearLang} className="inline-flex items-center gap-1.5 rounded-full bg-violet-soft px-2.5 py-1 text-[11.5px] font-medium text-violet-ink">
              {LANGUAGE_NAMES[langFilter] ? L(lang, LANGUAGE_NAMES[langFilter].en, LANGUAGE_NAMES[langFilter].native) : langFilter} <span aria-hidden>×</span>
            </button>
          )}
        </div>
      )}
      <ul className="-mx-2.5 space-y-0.5">
        {items.slice(0, 60).map((it) => (
          <PostRow key={it.post.id} it={it} rel={rel} onOpen={() => setSignals({ postId: it.post.id })} />
        ))}
        {!items.length && <Empty text={L(lang, "Nothing in this filter.", "لا شيء في هذا التصنيف.")} />}
      </ul>
    </section>
  );
}

function PostRow({ it, rel, onOpen }: { it: SignalItemView; rel: number | null; onOpen: () => void }) {
  const { lang } = useOps();
  const a = it.analysis;
  const thumb = it.post.frames[0]?.src;
  const place = it.places[0];
  const noise = a && !a.relevant;
  return (
    <li>
      <button onClick={onOpen} className={cn("group flex w-full items-start gap-3 rounded-xl px-2.5 py-2 text-start transition-colors hover:bg-surface-2", noise && "opacity-70")}>
        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-surface-2 ring-1 ring-line">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" loading="lazy" className={cn("h-full w-full object-cover", noise && "grayscale")} />
          ) : (
            <div className="grid h-full w-full place-items-center text-[18px]" style={{ color: PLATFORM[it.post.platform]?.dot }}>“</div>
          )}
          {it.post.media === "video" && thumb && <span className="absolute bottom-0.5 end-0.5 rounded bg-black/60 px-1 text-[8.5px] font-semibold text-white">▶</span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[10.5px] text-muted">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: PLATFORM[it.post.platform]?.dot }} />
            <span>{PLATFORM[it.post.platform]?.en ?? it.post.platform}</span>
            <span>·</span>
            <span className="tnum">{fmtPostTime(it.post.publishedAt, lang, rel)}</span>
            {it.post.language && it.post.language !== "en" && it.post.language !== "ar" && LANGUAGE_NAMES[it.post.language] && (
              <span className="rounded bg-surface-2 px-1 text-[9.5px] font-semibold text-ink-2">{L(lang, LANGUAGE_NAMES[it.post.language].en, LANGUAGE_NAMES[it.post.language].native)}</span>
            )}
            {it.liveAt && <span className="rounded bg-violet-soft px-1 text-[9.5px] font-semibold text-violet-ink">{L(lang, "NEW", "جديد")}</span>}
          </div>
          <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-ink" dir="auto">{it.post.text || "—"}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {a && <CategoryChip category={a.category} lang={lang} size="xs" />}
            {a?.possibleRepost && <span className="rounded-full bg-amber-soft px-1.5 py-[1px] text-[10.5px] font-medium text-amber-ink">{L(lang, "Old repost?", "إعادة نشر قديمة؟")}</span>}
            {place && (
              <span className="inline-flex items-center gap-1 text-[10.5px] text-ink-2">
                <Crosshair size={10} /> {L(lang, place.label.en, place.label.ar)}
              </span>
            )}
            {noise && a.noiseReason && <span className="line-clamp-1 text-[10.5px] text-muted">{a.noiseReason}</span>}
          </div>
        </div>
        <ChevronRight size={15} className="mt-3.5 shrink-0 text-line-strong group-hover:text-ink rtl:rotate-180" />
      </button>
    </li>
  );
}

export function SectionTitle({ title, aside }: { icon?: ReactNode; title: string; aside?: ReactNode }) {
  return (
    <div className="mb-2.5 flex min-h-6 items-center justify-between gap-3">
      <h3 className="text-[12.5px] font-semibold text-muted">{title}</h3>
      {aside}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-xl bg-surface-2 px-3 py-4 text-center text-[12px] text-muted">{text}</p>;
}

export { CATEGORY };
