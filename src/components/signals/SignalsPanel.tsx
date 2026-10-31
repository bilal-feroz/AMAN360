"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  BadgeCheck,
  Ban,
  Check,
  ChevronRight,
  Crosshair,
  Database,
  Eye,
  Film,
  Globe2,
  Megaphone,
  MessageCircleQuestion,
  Radar,
  ScanEye,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { AnimatedNumber, Button, Chip, cn, Segmented, useNow } from "@/components/ui";
import { useUi } from "@/lib/ui-store";
import { signalAction, useSignalsStore, type HotspotView, type SignalItemView, type SignalsView } from "@/lib/use-signals";
import { useOps } from "@/components/ops/context";
import { CATEGORY, CategoryChip, fmtPostTime, L, n, PLATFORM } from "./meta";
import { PostDetail } from "./PostDetail";

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
      <header className="sticky top-0 z-20 border-b border-line/70 bg-surface/95 px-5 pb-3 pt-4 backdrop-blur">
        <div className="flex items-start gap-3">
          <span className="relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-violet-soft text-violet">
            <Radar size={18} strokeWidth={2} />
            <span className="aman-breathe absolute inset-0 rounded-xl ring-1 ring-violet/30" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-semibold text-ink">{L(lang, "Social intelligence", "رصد وسائل التواصل")}</h2>
            <p className="mt-0.5 text-[12.5px] text-muted">{L(lang, "Claude reads public posts and videos. People verify. Nothing here can send an alert.", "يقرأ Claude المنشورات والمقاطع العامة. والبشر يتحققون. لا شيء هنا يمكنه إرسال تنبيه.")}</p>
          </div>
        </div>
        <div className="mt-3">
          <Segmented
            ariaLabel={L(lang, "Dataset", "مجموعة البيانات")}
            size="sm"
            value={sel.dataset}
            onChange={switchDataset}
            options={[
              { value: "scenario", label: L(lang, "Live scenario", "السيناريو المباشر") },
              { value: "replay", label: <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-violet" />{L(lang, "Real storm · Oct 2026", "عاصفة حقيقية · أكتوبر 2026")}</span> },
            ]}
          />
        </div>
      </header>

      {!view ? (
        <div className="space-y-3 p-5">
          <div className="aman-scan relative h-24 overflow-hidden rounded-2xl bg-surface-2" />
          <div className="h-40 rounded-2xl bg-surface-2" />
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
  return (
    <div className="pb-6">
      <SourceBanner view={view} />
      <Funnel view={view} />
      <Hotspots view={view} canAct={canAct} act={act} />
      {view.rumours.length > 0 && <Rumours view={view} canAct={canAct} act={act} />}
      {view.confusion.length > 0 && <Questions view={view} />}
      <Feed view={view} />
      <p className="mx-5 mt-4 flex items-start gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-[11.5px] leading-relaxed text-muted">
        <ShieldCheck size={14} className="mt-0.5 shrink-0 text-teal" />
        {L(
          lang,
          "Boundary: Claude only fills a fixed form per post. Places are matched to OpenStreetMap by code, never guessed by the model. Hotspots become verification requests for a human — alerts still come only from verified feeds and the approved policy.",
          "الحدود: يملأ Claude نموذجًا ثابتًا لكل منشور فقط. تُطابَق الأماكن مع OpenStreetMap برمجيًا ولا يخمّنها النموذج. تتحول البؤر إلى طلبات تحقق لإنسان — وتبقى التنبيهات صادرة فقط عن مصادر موثقة وسياسة معتمدة.",
        )}
      </p>
    </div>
  );
}

function SourceBanner({ view }: { view: SignalsView }) {
  const { lang } = useOps();
  const real = !view.meta.synthetic;
  return (
    <div
      className={cn(
        "relative mx-5 mt-4 overflow-hidden rounded-2xl px-4 py-3 text-[12px] ring-1",
        real ? "bg-[radial-gradient(120%_140%_at_0%_0%,#efebfe_0%,#ffffff_60%)] ring-violet/25" : "bg-amber-soft/50 ring-amber/30",
      )}
    >
      <div className="flex items-center gap-2">
        {real ? <Globe2 size={15} className="text-violet" /> : <Database size={15} className="text-amber-ink" />}
        <span className={cn("font-semibold", real ? "text-violet-ink" : "text-amber-ink")}>
          {real ? L(lang, "REAL public posts", "منشورات عامة حقيقية") : L(lang, "Synthetic posts · training scenario", "منشورات اصطناعية · سيناريو تدريبي")}
        </span>
        {real && <Chip tone="outline" className="ms-auto text-[10.5px]">10–25 Oct 2026</Chip>}
      </div>
      <p className="mt-1 leading-relaxed text-ink-2">
        {real
          ? L(
              lang,
              `Storms brought hail and heavy rain to Sharjah's central region and east coast. ${view.funnel.found} public Instagram, TikTok and YouTube posts were retrieved through Oriane video search; Claude read every one and watched the frames of ${view.funnel.viewedFrames} videos.`,
              `جلبت العواصف البرد والأمطار الغزيرة إلى المنطقة الوسطى والساحل الشرقي في الشارقة. جُلب ${view.funnel.found} منشورًا عامًا من إنستغرام وتيك توك ويوتيوب عبر بحث Oriane للفيديو؛ قرأها Claude جميعها وشاهد لقطات ${view.funnel.viewedFrames} مقطعًا.`,
            )
          : L(lang, "Written for the drill — no real people. Posts arrive on the scenario clock, so new reports and rumours appear while you work.", "كُتبت للتمرين — لا أشخاص حقيقيين. تصل المنشورات وفق ساعة السيناريو، فتظهر بلاغات وشائعات جديدة أثناء العمل.")}
      </p>
    </div>
  );
}

function Funnel({ view }: { view: SignalsView }) {
  const { lang } = useOps();
  const f = view.funnel;
  const steps = [
    { k: "found", v: f.found, en: "Found", ar: "عُثر عليها", icon: Globe2 },
    { k: "read", v: f.analysed, en: "Read by AI", ar: "قرأها Claude", icon: ScanEye },
    { k: "kept", v: f.relevant, en: "Relevant", ar: "ذات صلة", icon: Check },
    { k: "mapped", v: f.located, en: "On the map", ar: "على الخريطة", icon: Crosshair },
    { k: "hot", v: f.hotspots, en: "Hotspots", ar: "بؤر", icon: Radar },
  ];
  return (
    <div className="mx-5 mt-3 rounded-2xl bg-surface p-3 ring-1 ring-line">
      <div className="flex items-stretch">
        {steps.map((s, i) => (
          <div key={s.k} className="flex min-w-0 flex-1 items-center">
            <div className="min-w-0 flex-1 text-center">
              <div className={cn("text-[22px] font-semibold leading-none tracking-tight", i === steps.length - 1 ? "text-violet" : "text-ink")}>
                <AnimatedNumber value={s.v} />
              </div>
              <div className="mt-1 truncate text-[10.5px] font-medium text-muted">{L(lang, s.en, s.ar)}</div>
            </div>
            {i < steps.length - 1 && <ChevronRight size={14} className="shrink-0 text-line-strong rtl:rotate-180" />}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-2.5 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1"><Ban size={11} /> {f.noise} {L(lang, "noise removed", "ضوضاء مستبعدة")}</span>
        {f.reposts > 0 && <span className="inline-flex items-center gap-1">· <Film size={11} /> {f.reposts} {L(lang, "old reposts", "إعادة نشر قديمة")}</span>}
        <span className="inline-flex items-center gap-1">· <Users size={11} /> {f.corroborated} {L(lang, "corroborated", "مؤكدة بمصادر متعددة")}</span>
        {f.rumours > 0 && <span className="inline-flex items-center gap-1 text-amber-ink">· <Megaphone size={11} /> {f.rumours} {L(lang, "rumours", "شائعات")}</span>}
      </div>
    </div>
  );
}

const STATUS: Record<string, { en: string; ar: string; tone: string }> = {
  unverified: { en: "Unverified", ar: "غير متحقق", tone: "bg-violet-soft text-violet-ink" },
  requested: { en: "Verification requested", ar: "طُلب التحقق", tone: "bg-amber-soft text-amber-ink" },
  consistent: { en: "Consistent with verified feed", ar: "متسق مع المصدر الموثق", tone: "bg-teal-soft text-teal-ink" },
  confirmed: { en: "Confirmed by authority", ar: "أكدته الجهة المختصة", tone: "bg-teal-soft text-teal-ink" },
  not_confirmed: { en: "Not confirmed", ar: "غير مؤكد", tone: "bg-surface-2 text-ink-2" },
  dismissed: { en: "Dismissed", ar: "مستبعد", tone: "bg-surface-2 text-muted" },
};

function Hotspots({ view, canAct, act }: { view: SignalsView; canAct: boolean; act: (a: "request_verification" | "dismiss", id: string) => Promise<void> }) {
  const { lang, busy } = useOps();
  const sel = useUi((s) => s.signals);
  const setSignals = useUi((s) => s.setSignals);
  const flyTo = useUi((s) => s.flyTo);
  const [all, setAll] = useState(false);
  const list = all ? view.hotspots : view.hotspots.slice(0, 5);
  const replay = view.dataset === "replay";
  const focus = (h: HotspotView) => {
    setSignals({ hotspotId: h.id });
    flyTo({ kind: "point", lngLat: h.center, zoom: replay ? 11.6 : 16.2, pitch: replay ? 62 : 58 });
  };
  return (
    <section className="mt-5 px-5">
      <SectionTitle icon={<Radar size={13} />} title={L(lang, "Hotspots", "البؤر")} aside={<span className="text-[11px] text-muted">{L(lang, "ranked by independent sources", "مرتبة حسب المصادر المستقلة")}</span>} />
      {!view.hotspots.length && <Empty text={L(lang, "No located reports yet.", "لا توجد بلاغات محددة الموقع بعد.")} />}
      <ul className="space-y-2">
        {list.map((h, i) => {
          const st = STATUS[h.status];
          const active = sel.hotspotId === h.id;
          return (
            <motion.li key={h.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.04 } }}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => focus(h)}
                onKeyDown={(e) => e.key === "Enter" && focus(h)}
                className={cn(
                  "group cursor-pointer rounded-2xl bg-surface p-3 ring-1 transition-[box-shadow,ring-color]",
                  active ? "ring-2 ring-violet shadow-[0_10px_30px_-18px_rgb(109_76_240/0.7)]" : "ring-line hover:ring-violet/40",
                  h.status === "dismissed" && "opacity-55",
                )}
              >
                <div className="flex items-start gap-3">
                  <HeatDot severity={h.severity} corroborated={h.corroborated} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13.5px] font-semibold text-ink">{L(lang, h.label.en, h.label.ar)}</span>
                      {h.corroborated ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-ink px-1.5 py-[1px] text-[10px] font-semibold text-white"><BadgeCheck size={10} />{L(lang, "Corroborated", "مؤكدة")}</span>
                      ) : (
                        <span className="rounded-full bg-surface-2 px-1.5 py-[1px] text-[10px] font-medium text-muted">{L(lang, "Single source", "مصدر واحد")}</span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {h.categories.slice(0, 3).map((c) => (
                        <CategoryChip key={c} category={c} lang={lang} size="xs" />
                      ))}
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-[11.5px] text-ink-2">
                      <span className="tnum">{n(lang, h.postIds.length, ["post", "posts"], "منشورات")}</span>
                      <span className="tnum">{n(lang, h.sources, ["source", "sources"], "مصادر")}</span>
                      {h.observed.hail > 0 && <span>❄ {h.observed.hail} {L(lang, "show hail", "تُظهر بردًا")}</span>}
                      {h.observed.deepWater > 0 && <span className="text-coral-ink">≈ {h.observed.deepWater} {L(lang, "deep water", "مياه عميقة")}</span>}
                    </div>
                    {h.insideZone !== null && (
                      <div className={cn("mt-2 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium", h.insideZone ? "bg-teal-soft text-teal-ink" : "bg-amber-soft text-amber-ink")}>
                        {h.insideZone ? <Check size={11} /> : <Eye size={11} />}
                        {h.insideZone ? L(lang, "Inside the verified hazard zone", "داخل منطقة الخطر الموثقة") : L(lang, "Outside the verified zone — not covered by any alert", "خارج المنطقة الموثقة — لا يشمله أي تنبيه")}
                      </div>
                    )}
                    <div className="mt-2.5 flex items-center gap-2">
                      <span className={cn("rounded-full px-2 py-[2px] text-[10.5px] font-semibold", st.tone)}>{L(lang, st.en, st.ar)}</span>
                      {h.status === "unverified" && (
                        <div className="ms-auto flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            disabled={!canAct}
                            onClick={() => void act("dismiss", h.id)}
                            className="rounded-lg px-2 py-1 text-[11.5px] font-medium text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-40"
                          >
                            {L(lang, "Dismiss", "استبعاد")}
                          </button>
                          <button
                            disabled={!canAct || busy === `signal:request_verification:${h.id}`}
                            onClick={() => void act("request_verification", h.id)}
                            className="inline-flex items-center gap-1 rounded-lg bg-violet px-2.5 py-1 text-[11.5px] font-semibold text-white shadow-[0_6px_16px_-8px_rgb(109_76_240/0.9)] hover:bg-violet-ink disabled:opacity-50"
                          >
                            <ShieldCheck size={12} /> {L(lang, "Request verification", "طلب التحقق")}
                          </button>
                        </div>
                      )}
                    </div>
                    {h.verification?.note && <p className="mt-2 rounded-lg bg-surface-2 px-2.5 py-1.5 text-[11.5px] leading-relaxed text-ink-2">{h.verification.note}</p>}
                  </div>
                </div>
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

function HeatDot({ severity, corroborated }: { severity: "low" | "medium" | "high"; corroborated: boolean }) {
  const c = severity === "high" ? "#e2553d" : severity === "medium" ? "#6d4cf0" : "#9b8cf5";
  return (
    <span className="relative mt-1 grid h-8 w-8 shrink-0 place-items-center">
      {corroborated && <span className="aman-pulse absolute inset-1 rounded-full" style={{ background: c, opacity: 0.35 }} />}
      <span className="absolute inset-2 rounded-full" style={{ background: `radial-gradient(circle, ${c} 0%, ${c}99 55%, ${c}00 100%)` }} />
      <span className="relative h-2.5 w-2.5 rounded-full border-2 border-white" style={{ background: c }} />
    </span>
  );
}

function Rumours({ view, canAct, act }: { view: SignalsView; canAct: boolean; act: (a: "issue_clarification" | "dismiss", id: string) => Promise<void> }) {
  const { lang, busy } = useOps();
  const [preview, setPreview] = useState<string | null>(null);
  return (
    <section data-rumours className="mt-5 scroll-mt-28 px-5">
      <SectionTitle icon={<Megaphone size={13} />} title={L(lang, "Rumours spreading", "شائعات منتشرة")} aside={<span className="text-[11px] text-muted">{L(lang, "claims no verified source supports", "ادعاءات لا يدعمها مصدر موثق")}</span>} />
      <ul className="space-y-2">
        {view.rumours.map((r) => {
          const shown = r.status === "clarified" ? r.clarification?.text ?? r.preview : r.preview;
          return (
            <li key={r.id} className="overflow-hidden rounded-2xl bg-surface ring-1 ring-amber/40">
              <div className="flex items-start gap-3 bg-[linear-gradient(90deg,#fcf2df,transparent)] p-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-amber text-white"><Megaphone size={15} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold leading-snug text-ink">“{r.claim}”</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-ink-2">
                    <span className="tnum">{n(lang, r.postIds.length, ["post", "posts"], "منشورات")} · {n(lang, r.sources, ["account", "accounts"], "حسابات")}</span>
                    <span className="rounded-full bg-white px-1.5 py-[1px] text-[10.5px] font-semibold uppercase tracking-wide text-amber-ink ring-1 ring-amber/40">{L(lang, "No verified source", "لا مصدر موثق")}</span>
                    {r.status === "clarified" && <span className="inline-flex items-center gap-1 font-semibold text-teal-ink"><Check size={12} />{L(lang, "Clarification issued", "صدر التوضيح")}</span>}
                  </div>
                </div>
              </div>
              {(preview === r.id || r.status === "clarified") && (
                <div className="grid grid-cols-2 gap-2 border-t border-line px-3 py-3 text-[11.5px] leading-relaxed">
                  <p className="rounded-xl bg-surface-2 p-2.5 text-ink" dir="ltr">{shown.en}</p>
                  <p className="rounded-xl bg-surface-2 p-2.5 text-ink" dir="rtl" lang="ar">{shown.ar}</p>
                  <p className="col-span-2 text-[11px] text-muted">
                    {L(lang, `Approved template · only the place name “${r.topic.en}” is filled in, from the gazetteer — the model's wording is never published.`, `قالب معتمد · يُملأ اسم المكان «${r.topic.ar}» فقط من المعجم الجغرافي — ولا تُنشر صياغة النموذج أبدًا.`)}
                  </p>
                </div>
              )}
              {r.status === "flagged" && (
                <div className="flex items-center gap-2 border-t border-line px-3 py-2.5">
                  <button disabled={!canAct} onClick={() => void act("dismiss", r.id)} className="rounded-lg px-2 py-1 text-[11.5px] font-medium text-muted hover:bg-surface-2 disabled:opacity-40">
                    {L(lang, "Dismiss", "استبعاد")}
                  </button>
                  {preview !== r.id ? (
                    <Button size="sm" className="ms-auto" onClick={() => setPreview(r.id)} icon={<Eye size={13} />}>
                      {L(lang, "Preview clarification", "معاينة التوضيح")}
                    </Button>
                  ) : (
                    <Button size="sm" tone="primary" className="ms-auto" disabled={!canAct} busy={busy === `signal:issue_clarification:${r.id}`} onClick={() => void act("issue_clarification", r.id)} icon={<ShieldCheck size={13} />}>
                      {L(lang, "Approve & issue (simulated)", "اعتماد وإصدار (محاكاة)")}
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
      <SectionTitle icon={<MessageCircleQuestion size={13} />} title={L(lang, "What people are asking", "ما يسأل عنه الناس")} />
      <ul className="space-y-1.5">
        {view.confusion.map((q) => (
          <li key={q.id} className="flex items-start gap-3 rounded-xl bg-surface px-3 py-2.5 ring-1 ring-line">
            <span className="tnum mt-0.5 grid h-6 min-w-6 place-items-center rounded-lg bg-surface-2 px-1 text-[11px] font-semibold text-ink-2">{q.postIds.length}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] leading-snug text-ink">{q.question}</p>
              {q.answer ? (
                <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-teal-ink">
                  <Check size={11} /> {L(lang, `Covered by approved answer ${q.answer.id}`, `تغطيه الإجابة المعتمدة ${q.answer.id}`)}
                </p>
              ) : (
                <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-amber-ink">
                  <ArrowRight size={11} className="rtl:rotate-180" /> {L(lang, "No approved answer yet — candidate for the answer library", "لا توجد إجابة معتمدة بعد — مرشح لمكتبة الإجابات")}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Feed({ view }: { view: SignalsView }) {
  const { lang } = useOps();
  const [tab, setTab] = useState<"kept" | "noise" | "all">("kept");
  const now = useNow(30_000);
  const setSignals = useUi((s) => s.setSignals);
  const hotspotId = useUi((s) => s.signals.hotspotId);
  const hotspot = view.hotspots.find((h) => h.id === hotspotId) ?? null;
  const items = useMemo(() => {
    let list = view.items;
    if (hotspot) list = list.filter((i) => hotspot.postIds.includes(i.post.id));
    if (tab === "kept") list = list.filter((i) => i.analysis?.relevant);
    if (tab === "noise") list = list.filter((i) => i.analysis && !i.analysis.relevant);
    return list;
  }, [view.items, tab, hotspot]);
  const rel = view.dataset === "scenario" ? now : null;
  return (
    <section className="mt-5 px-5">
      <SectionTitle
        icon={<Sparkles size={13} />}
        title={L(lang, "Posts, as Claude read them", "المنشورات كما قرأها Claude")}
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
      {hotspot && (
        <button onClick={() => setSignals({ hotspotId: null })} className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-violet-soft px-2.5 py-1 text-[11.5px] font-medium text-violet-ink">
          {L(lang, `Showing ${hotspot.label.en}`, `عرض ${hotspot.label.ar}`)} <span aria-hidden>×</span>
        </button>
      )}
      <ul className="space-y-1.5">
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
  return (
    <li>
      <button onClick={onOpen} className={cn("group flex w-full items-start gap-3 rounded-xl px-2.5 py-2 text-start transition-colors hover:bg-surface-2", a && !a.relevant && "opacity-70")}>
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-surface-2 ring-1 ring-line">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" loading="lazy" className={cn("h-full w-full object-cover", a && !a.relevant && "grayscale")} />
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
            {it.post.synthetic && <span className="rounded bg-amber-soft px-1 text-[9.5px] font-semibold text-amber-ink">SYN</span>}
            {it.liveAt && <span className="rounded bg-violet-soft px-1 text-[9.5px] font-semibold text-violet-ink">LIVE</span>}
          </div>
          <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-ink" dir="auto">{it.post.text || "—"}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {a && <CategoryChip category={a.category} lang={lang} size="xs" />}
            {a?.possibleRepost && <span className="rounded-full bg-amber-soft px-1.5 py-[1px] text-[10.5px] font-medium text-amber-ink">{L(lang, "Old repost?", "إعادة نشر قديمة؟")}</span>}
            {place && (
              <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-1.5 py-[1px] text-[10.5px] text-ink-2">
                <Crosshair size={10} /> {L(lang, place.label.en, place.label.ar)}
              </span>
            )}
            {a && !a.relevant && a.noiseReason && <span className="line-clamp-1 text-[10.5px] italic text-muted">{a.noiseReason}</span>}
          </div>
        </div>
        <ChevronRight size={15} className="mt-4 shrink-0 text-line-strong group-hover:text-ink rtl:rotate-180" />
      </button>
    </li>
  );
}

export function SectionTitle({ icon, title, aside }: { icon: React.ReactNode; title: string; aside?: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-3">
      <h3 className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted rtl:tracking-normal">
        {icon}
        {title}
      </h3>
      {aside}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-xl bg-surface-2 px-3 py-4 text-center text-[12px] text-muted">{text}</p>;
}

export { CATEGORY };
