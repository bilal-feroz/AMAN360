"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, Check, Crosshair, ExternalLink, Eye, Film, MapPin, Play, RefreshCw, ScanEye, ShieldCheck, Sparkles, TriangleAlert, X } from "lucide-react";
import type { SignalAnalysis } from "@/domain/signals";
import { cn } from "@/components/ui";
import { useUi } from "@/lib/ui-store";
import { signalAction, useSignalsStore, type SignalItemView, type SignalsView } from "@/lib/use-signals";
import { useOps } from "@/components/ops/context";
import { ApiError } from "@/lib/api";
import { CategoryChip, DEPTH, embedUrl, fmtPostTime, L, PLATFORM } from "./meta";
import { SectionTitle } from "./SignalsPanel";

export function PostDetail({ item, view, onBack }: { item: SignalItemView; view: SignalsView; onBack: () => void }) {
  const { lang } = useOps();
  const flyTo = useUi((s) => s.flyTo);
  const replay = view.dataset === "replay";
  const a = item.analysis;
  const p = item.post;

  useEffect(() => {
    const first = item.places[0];
    if (first) flyTo({ kind: "point", lngLat: first.lngLat, zoom: replay ? (first.precision === "road" ? 11.4 : 12.4) : 16.6, pitch: replay ? 64 : 60 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.id]);

  return (
    <div className="pb-6">
      <div className="flex items-center gap-2 px-5 pt-3">
        <button onClick={onBack} aria-label="Back" className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink">
          <ArrowLeft size={16} className="rtl:rotate-180" />
        </button>
        <span className="h-2 w-2 rounded-full" style={{ background: PLATFORM[p.platform]?.dot }} />
        <span className="text-[12.5px] font-medium text-ink">{PLATFORM[p.platform]?.en ?? p.platform}</span>
        <span className="text-[12px] text-muted">· {fmtPostTime(p.publishedAt, lang, replay ? null : Date.now())}</span>
        {p.views ? <span className="tnum ms-auto text-[11.5px] text-muted">{Intl.NumberFormat("en", { notation: "compact" }).format(p.views)} {L(lang, "views", "مشاهدة")}</span> : null}
      </div>

      <Media item={item} />

      <div className="mx-5 mt-3 rounded-2xl bg-surface-2/70 px-3.5 py-3">
        <p className="whitespace-pre-line text-[13px] leading-relaxed text-ink" dir="auto">{p.text}</p>
        {p.transcript && (
          <p className="mt-2 border-t border-line pt-2 text-[12px] leading-relaxed text-ink-2" dir="auto">
            <span className="me-1 font-semibold text-muted">{L(lang, "Speech:", "الكلام:")}</span>
            {p.transcript.slice(0, 280)}
            {p.transcript.length > 280 ? "…" : ""}
          </p>
        )}
        {p.onScreenText.length > 0 && (
          <p className="mt-1.5 text-[11.5px] text-muted" dir="auto">
            <span className="me-1 font-semibold">{L(lang, "On screen:", "على الشاشة:")}</span>
            {p.onScreenText.slice(0, 5).join(" · ")}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
          {p.synthetic ? <span className="rounded bg-amber-soft px-1.5 py-[1px] font-semibold text-amber-ink">{L(lang, "Synthetic post", "منشور اصطناعي")}</span> : <span className="rounded bg-violet-soft px-1.5 py-[1px] font-semibold text-violet-ink">{L(lang, "Real public post", "منشور عام حقيقي")}</span>}
          {!p.synthetic && <span>{L(lang, "Account details are not stored or shown.", "لا تُخزَّن بيانات الحساب ولا تُعرض.")}</span>}
        </div>
      </div>

      {a ? <Reading item={item} a={a} view={view} /> : <p className="mx-5 mt-4 text-[12px] text-muted">{L(lang, "Not analysed yet.", "لم يُحلَّل بعد.")}</p>}
      <Where item={item} view={view} />
    </div>
  );
}

function Media({ item }: { item: SignalItemView }) {
  const { lang } = useOps();
  const p = item.post;
  const [idx, setIdx] = useState(0);
  const [play, setPlay] = useState(false);
  const embed = embedUrl(p.platform, p.platformId);
  if (play && embed) {
    return (
      <div className="mx-5 mt-3 overflow-hidden rounded-2xl bg-black ring-1 ring-line">
        <iframe src={embed.src} title={L(lang, "Original post", "المنشور الأصلي")} className={cn("w-full", embed.aspect, "max-h-[620px]")} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
        <div className="flex items-center gap-2 bg-ink px-3 py-2 text-[11px] text-white/80">
          <ShieldCheck size={12} />
          {L(lang, `Playing through ${PLATFORM[p.platform]?.en}'s official embed, with the creator's credit.`, `يُعرض عبر المشغّل الرسمي لـ ${PLATFORM[p.platform]?.en} مع نسبة المحتوى لصاحبه.`)}
          <button onClick={() => setPlay(false)} className="ms-auto rounded px-1.5 py-0.5 hover:bg-white/10">{L(lang, "Frames", "اللقطات")}</button>
        </div>
      </div>
    );
  }
  if (!p.frames.length) {
    return p.synthetic ? null : (
      <div className="mx-5 mt-3 rounded-2xl bg-surface-2 px-4 py-6 text-center text-[12px] text-muted">{L(lang, "No frames were sampled for this post.", "لم تُلتقط لقطات لهذا المنشور.")}</div>
    );
  }
  const f = p.frames[Math.min(idx, p.frames.length - 1)];
  return (
    <div className="mx-5 mt-3">
      <div className="group relative overflow-hidden rounded-2xl bg-black ring-1 ring-line">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <motion.img key={f.src} src={f.src} alt={L(lang, "Video frame", "لقطة من الفيديو")} initial={{ opacity: 0.4, scale: 1.02 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.35 }} className="max-h-[360px] w-full object-contain" />
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-2 bg-gradient-to-b from-black/60 to-transparent px-3 py-2 text-[11px] font-medium text-white">
          <ScanEye size={13} />
          {item.analysis?.stage === "vision" ? L(lang, "Frame Claude looked at", "لقطة شاهدها Claude") : L(lang, "Thumbnail", "صورة مصغرة")}
          {f.t > 0 && <span className="tnum ms-auto rounded bg-black/40 px-1.5">{Math.floor(f.t / 60)}:{String(Math.round(f.t % 60)).padStart(2, "0")}</span>}
        </div>
        {embed && (
          <button
            onClick={() => setPlay(true)}
            className="absolute bottom-3 start-1/2 inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-[12.5px] font-semibold text-ink shadow-[0_10px_30px_-10px_rgb(0_0_0/0.6)] transition hover:scale-[1.03] rtl:translate-x-1/2"
          >
            <Play size={14} className="fill-current" /> {L(lang, `Play original on ${PLATFORM[p.platform]?.en}`, `تشغيل الأصل على ${PLATFORM[p.platform]?.en}`)}
          </button>
        )}
      </div>
      {p.frames.length > 1 && (
        <div className="mt-2 flex gap-2">
          {p.frames.map((fr, i) => (
            <button key={fr.src} onClick={() => setIdx(i)} className={cn("relative h-14 flex-1 overflow-hidden rounded-lg ring-2 transition", i === idx ? "ring-violet" : "ring-transparent opacity-70 hover:opacity-100")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fr.src} alt="" className="h-full w-full object-cover" />
              <span className="tnum absolute bottom-0.5 end-0.5 rounded bg-black/60 px-1 text-[9px] text-white">{Math.floor(fr.t / 60)}:{String(Math.round(fr.t % 60)).padStart(2, "0")}</span>
            </button>
          ))}
        </div>
      )}
      {p.url && (
        <a href={p.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-medium text-muted hover:text-ink">
          <ExternalLink size={12} /> {L(lang, "Open original", "فتح الأصل")}
        </a>
      )}
    </div>
  );
}

function Reading({ item, a, view }: { item: SignalItemView; a: SignalAnalysis; view: SignalsView }) {
  const { lang } = useOps();
  const load = useSignalsStore((s) => s.load);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ms: number; same: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const depth = DEPTH[a.observed.waterDepth];
  const rerun = async () => {
    setBusy(true);
    setErr(null);
    setResult(null);
    const before = a;
    try {
      const r = (await signalAction("reanalyse", view.dataset, item.post.id)) as { analysis: SignalAnalysis; ms: number };
      setResult({ ms: r.ms, same: r.analysis.category === before.category && r.analysis.relevant === before.relevant });
      await load(view.dataset);
    } catch (e) {
      setErr((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };
  const flags: { on: boolean; en: string; ar: string; tone: string }[] = [
    { on: a.observed.hail, en: "Hail", ar: "برد", tone: "bg-violet-soft text-violet-ink" },
    { on: a.observed.flowingWater, en: "Flowing water", ar: "مياه جارية", tone: "bg-coral-soft text-coral-ink" },
    { on: a.observed.peopleAtRisk, en: "People at risk", ar: "أشخاص في خطر", tone: "bg-coral-soft text-coral-ink" },
    { on: a.observed.roadAffected, en: "Road affected", ar: "طريق متأثر", tone: "bg-amber-soft text-amber-ink" },
    { on: a.observed.poorVisibility, en: "Poor visibility", ar: "رؤية ضعيفة", tone: "bg-amber-soft text-amber-ink" },
  ];
  return (
    <section className="mx-5 mt-4 overflow-hidden rounded-2xl ring-1 ring-violet/25">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 bg-[linear-gradient(110deg,#efebfe,#ffffff_70%)] px-3.5 py-2.5">
        <Sparkles size={14} className="text-violet" />
        <span className="whitespace-nowrap text-[12.5px] font-semibold text-ink">{L(lang, "Claude's reading", "قراءة Claude")}</span>
        <span className="min-w-0 text-[11px] text-muted">
          · {a.stage === "vision" ? L(lang, `watched ${item.post.frames.length} frame${item.post.frames.length === 1 ? "" : "s"} + text`, `شاهد ${item.post.frames.length} لقطات + النص`) : L(lang, "text only", "النص فقط")} · {a.model}
          {item.liveAt ? L(lang, " · live", " · مباشر") : L(lang, " · recorded", " · مسجّل")}
        </span>
      </div>
      <div className="space-y-3 px-3.5 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <CategoryChip category={a.category} lang={lang} />
          <span className={cn("rounded-full px-2 py-[2px] text-[11px] font-semibold", a.relevant ? "bg-teal-soft text-teal-ink" : "bg-surface-2 text-muted")}>
            {a.relevant ? L(lang, "Kept", "مقبول") : L(lang, "Filtered out", "مستبعد")}
          </span>
          <span className={cn("rounded-full px-2 py-[2px] text-[11px] font-medium", a.severity === "high" ? "bg-coral-soft text-coral-ink" : a.severity === "medium" ? "bg-amber-soft text-amber-ink" : "bg-surface-2 text-ink-2")}>
            {L(lang, `Severity: ${a.severity}`, `الخطورة: ${a.severity === "high" ? "عالية" : a.severity === "medium" ? "متوسطة" : "منخفضة"}`)}
          </span>
          {a.possibleRepost && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-soft px-2 py-[2px] text-[11px] font-semibold text-amber-ink">
              <Film size={11} /> {L(lang, "Possible old repost", "إعادة نشر قديمة محتملة")}
            </span>
          )}
        </div>
        <p className="text-[13px] leading-relaxed text-ink" dir={lang === "ar" ? "rtl" : "ltr"}>{L(lang, a.summary.en, a.summary.ar)}</p>
        {!a.relevant && a.noiseReason && (
          <p className="flex items-start gap-1.5 rounded-xl bg-surface-2 px-3 py-2 text-[12px] text-ink-2">
            <X size={13} className="mt-0.5 shrink-0 text-muted" /> {a.noiseReason}
          </p>
        )}
        {a.repostReason && <p className="rounded-xl bg-amber-soft/60 px-3 py-2 text-[12px] text-amber-ink">{a.repostReason}</p>}
        {(a.claim || a.question) && (
          <p className="rounded-xl bg-amber-soft/60 px-3 py-2 text-[12px] text-ink">
            <b className="me-1">{a.claim ? L(lang, "Claim:", "الادعاء:") : L(lang, "Question:", "السؤال:")}</b>
            {a.claim ?? a.question}
          </p>
        )}

        {a.relevant && (
          <div className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl bg-surface-2 px-3 py-2.5">
            <div>
              <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">{L(lang, "Water depth seen", "عمق المياه المرئي")}</div>
              <div className="mt-0.5 text-[12.5px] font-medium text-ink">{L(lang, depth.en, depth.ar)}</div>
            </div>
            <DepthGauge level={depth.level} />
            <div className="col-span-2 flex flex-wrap gap-1">
              {flags.map((f) => (
                <span key={f.en} className={cn("rounded-full px-2 py-[2px] text-[10.5px] font-medium", f.on ? f.tone : "bg-white text-line-strong line-through")}>
                  {L(lang, f.en, f.ar)}
                </span>
              ))}
            </div>
          </div>
        )}

        {a.evidence.length > 0 && (
          <ul className="space-y-1">
            {a.evidence.map((e) => (
              <li key={e} className="flex items-start gap-2 text-[12px] leading-snug text-ink-2" dir="auto">
                <Eye size={12} className="mt-0.5 shrink-0 text-violet" />
                {e}
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="flex justify-between text-[10.5px] text-muted">
              <span>{L(lang, "Confidence", "الثقة")}</span>
              <span className="tnum">{Math.round(a.confidence * 100)}%</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <motion.div className="h-full rounded-full bg-violet" initial={{ width: 0 }} animate={{ width: `${a.confidence * 100}%` }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
            </div>
          </div>
          <button
            onClick={rerun}
            disabled={busy || !view.llmAvailable}
            title={view.llmAvailable ? undefined : L(lang, "No AI key configured", "لم يُضبط مفتاح الذكاء الاصطناعي")}
            className="relative inline-flex items-center gap-1.5 overflow-hidden rounded-xl bg-ink px-3 py-2 text-[12px] font-semibold text-white hover:bg-ink-2 disabled:opacity-50"
          >
            <RefreshCw size={13} className={busy ? "animate-spin" : ""} />
            {busy ? L(lang, "Claude is reading…", "Claude يقرأ…") : L(lang, "Re-run live with Claude", "إعادة التشغيل مباشرة مع Claude")}
            {busy && <span className="aman-scan absolute inset-0" />}
          </button>
        </div>
        {result && (
          <p className="flex items-center gap-1.5 rounded-xl bg-teal-soft px-3 py-2 text-[12px] text-teal-ink">
            <Check size={13} /> {L(lang, `Live reading in ${(result.ms / 1000).toFixed(1)} s — ${result.same ? "same verdict as recorded" : "verdict updated"}`, `قراءة مباشرة خلال ${(result.ms / 1000).toFixed(1)} ث — ${result.same ? "الحكم نفسه المسجّل" : "تم تحديث الحكم"}`)}
          </p>
        )}
        {err && (
          <p className="flex items-center gap-1.5 rounded-xl bg-amber-soft px-3 py-2 text-[12px] text-amber-ink">
            <TriangleAlert size={13} /> {err}
          </p>
        )}
      </div>
    </section>
  );
}

function DepthGauge({ level }: { level: number }) {
  return (
    <div className="flex h-9 items-end gap-[3px]" aria-hidden>
      {[1, 2, 3, 4, 5].map((l) => (
        <span key={l} className={cn("w-2 rounded-sm transition-colors", level >= l ? (l >= 4 ? "bg-coral" : l >= 3 ? "bg-amber" : "bg-violet") : "bg-line")} style={{ height: 6 + l * 5 }} />
      ))}
    </div>
  );
}

function Where({ item, view }: { item: SignalItemView; view: SignalsView }) {
  const { lang } = useOps();
  const flyTo = useUi((s) => s.flyTo);
  const replay = view.dataset === "replay";
  const mentions = item.analysis?.places ?? [];
  return (
    <section className="mx-5 mt-4">
      <SectionTitle icon={<MapPin size={13} />} title={L(lang, "Where — matched by code, not by AI", "المكان — مطابقة برمجية لا بالذكاء الاصطناعي")} />
      {item.places.length ? (
        <ul className="space-y-1.5">
          {item.places.map((pl) => (
            <li key={pl.entryId + pl.mention} className="rounded-xl bg-surface px-3 py-2.5 ring-1 ring-line">
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-muted" dir="auto">“{pl.mention}”</span>
                <span className="text-line-strong">→</span>
                <span className="text-[12.5px] font-semibold text-ink">{L(lang, pl.label.en, pl.label.ar)}</span>
                <button
                  onClick={() => flyTo({ kind: "point", lngLat: pl.lngLat, zoom: replay ? 12.6 : 16.8, pitch: 62 })}
                  className="ms-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-violet hover:bg-violet-soft"
                >
                  <Crosshair size={12} /> {L(lang, "Fly to", "انتقال")}
                </button>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted">
                <span>{pl.precision === "geotag" ? L(lang, "Post geotag", "الموقع المرفق بالمنشور") : pl.precision === "road" ? L(lang, "Road (OSM)", "طريق (OSM)") : L(lang, `OSM ${pl.kind}`, `OSM ${pl.kind}`)}</span>
                <span>{L(lang, `match: ${pl.match}`, `المطابقة: ${pl.match}`)}</span>
                <span className="tnum">± {pl.radiusM >= 1000 ? `${(pl.radiusM / 1000).toFixed(1)} km` : `${pl.radiusM} m`}</span>
                <span className="tnum font-id">{pl.lngLat[1].toFixed(4)}, {pl.lngLat[0].toFixed(4)}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl bg-surface-2 px-3 py-3 text-[12px] text-muted">
          {mentions.length
            ? L(lang, `Mentions (${mentions.map((m) => m.text).join(", ")}) are too broad to place — an emirate or country is never pinned.`, `الإشارات (${mentions.map((m) => m.text).join("، ")}) أوسع من أن تُحدَّد — لا تُثبَّت إمارة أو دولة على الخريطة.`)
            : L(lang, "No place named — not placed on the map. Locations are never guessed.", "لم يُذكر مكان — لم يُوضع على الخريطة. لا يُخمَّن الموقع أبدًا.")}
        </p>
      )}
    </section>
  );
}
