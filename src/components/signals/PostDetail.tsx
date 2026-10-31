"use client";

import { useEffect, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { ArrowLeft, Check, Crosshair, ExternalLink, Play, RefreshCw, Sparkles, TriangleAlert } from "lucide-react";
import type { SignalAnalysis } from "@/domain/signals";
import { Button, cn, Disclosure } from "@/components/ui";
import { useUi } from "@/lib/ui-store";
import { signalAction, useSignalsStore, type SignalItemView, type SignalsView } from "@/lib/use-signals";
import { useOps } from "@/components/ops/context";
import { ApiError } from "@/lib/api";
import { CategoryChip, DEPTH, embedUrl, fmtPostTime, L, PLATFORM } from "./meta";
import { SectionTitle } from "./SignalsPanel";
import { LANGUAGE_NAMES } from "@/domain/language";

const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, "0")}`;

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

      <div className="mx-5 mt-3">
        <LanguageLine written={p.language} spoken={p.speechLanguage ?? null} />
        <p className="whitespace-pre-line text-[13px] leading-relaxed text-ink" dir="auto">{p.text}</p>
        {p.transcript && (
          <p className="mt-2 text-[12px] leading-relaxed text-ink-2" dir="auto">
            <span className="me-1 font-semibold text-muted">{L(lang, "Speech:", "الكلام:")}</span>
            {p.transcript.slice(0, 280)}
            {p.transcript.length > 280 ? "…" : ""}
          </p>
        )}
      </div>

      {a ? <Reading item={item} a={a} view={view} /> : <p className="mx-5 mt-4 text-[12px] text-muted">{L(lang, "Not analysed yet.", "لم يُحلَّل بعد.")}</p>}
      <Where item={item} view={view} />
      <Details item={item} />
    </div>
  );
}

/** Which language the post was written and spoken in, so operators see who is posting. */
function LanguageLine({ written, spoken }: { written: string | null; spoken: string | null }) {
  const { lang } = useOps();
  const name = (c: string | null) => (c && LANGUAGE_NAMES[c] ? L(lang, LANGUAGE_NAMES[c].en, LANGUAGE_NAMES[c].native) : null);
  const w = name(written);
  const sp = name(spoken);
  if (!w && !sp) return null;
  return (
    <p className="mb-1.5 text-[11px] text-muted">
      {w && L(lang, `Written in ${w}`, `لغة الكتابة: ${w}`)}
      {w && sp && " · "}
      {sp && L(lang, `spoken in ${sp}`, `لغة الكلام: ${sp}`)}
    </p>
  );
}

function Media({ item }: { item: SignalItemView }) {
  const { lang } = useOps();
  const p = item.post;
  const [idx, setIdx] = useState(0);
  const [play, setPlay] = useState(false);
  const embed = embedUrl(p.platform, p.platformId);
  const platform = PLATFORM[p.platform]?.en ?? p.platform;
  if (play && embed) {
    return (
      <div className="mx-5 mt-3 overflow-hidden rounded-2xl bg-black ring-1 ring-line">
        <iframe src={embed.src} title={L(lang, "Original post", "المنشور الأصلي")} className={cn("w-full", embed.aspect, "max-h-[620px]")} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
        <div className="flex items-center gap-2 bg-ink px-3 py-2 text-[11px] text-white/75">
          {L(lang, `Official ${platform} embed, with the creator's credit`, `المشغّل الرسمي لـ ${platform} مع نسبة المحتوى لصاحبه`)}
          <button onClick={() => setPlay(false)} className="ms-auto rounded px-1.5 py-0.5 font-medium text-white hover:bg-white/10">{L(lang, "Frames", "اللقطات")}</button>
        </div>
      </div>
    );
  }
  if (!p.frames.length) return null;
  const f = p.frames[Math.min(idx, p.frames.length - 1)];
  return (
    <div className="mx-5 mt-3">
      <div className="relative overflow-hidden rounded-2xl bg-black ring-1 ring-line">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <motion.img key={f.src} src={f.src} alt={L(lang, "Video frame", "لقطة من الفيديو")} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="max-h-[340px] w-full object-contain" />
        {item.analysis?.stage === "vision" && (
          <span className="pointer-events-none absolute start-2.5 top-2.5 rounded-md bg-black/55 px-2 py-1 text-[10.5px] font-medium text-white">
            {L(lang, "Frame Claude looked at", "لقطة شاهدها Claude")}
            {f.t > 0 && <span className="tnum ms-1.5 text-white/70">{mmss(f.t)}</span>}
          </span>
        )}
        {embed && (
          <button
            onClick={() => setPlay(true)}
            className="absolute bottom-3 start-1/2 inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-white px-4 py-2 text-[12.5px] font-semibold text-ink shadow-[0_8px_24px_-10px_rgb(0_0_0/0.6)] hover:bg-surface-2 rtl:translate-x-1/2"
          >
            <Play size={13} className="fill-current" /> {L(lang, `Play original on ${platform}`, `تشغيل الأصل على ${platform}`)}
          </button>
        )}
      </div>
      {p.frames.length > 1 && (
        <div className="mt-2 flex gap-2">
          {p.frames.map((fr, i) => (
            <button key={fr.src} onClick={() => setIdx(i)} aria-label={mmss(fr.t)} className={cn("relative h-12 flex-1 overflow-hidden rounded-lg ring-2 transition", i === idx ? "ring-violet" : "ring-transparent opacity-65 hover:opacity-100")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fr.src} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
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
  // Only what was actually seen — absent observations are not listed.
  const seen = [
    a.relevant && depth.level > 0 ? { en: depth.en, ar: depth.ar, tone: depth.level >= 3 ? "bg-coral-soft text-coral-ink" : "bg-violet-soft text-violet-ink" } : null,
    a.observed.hail && a.category !== "hail" ? { en: "Hail", ar: "برد", tone: "bg-violet-soft text-violet-ink" } : null,
    a.observed.flowingWater ? { en: "Flowing water", ar: "مياه جارية", tone: "bg-coral-soft text-coral-ink" } : null,
    a.observed.peopleAtRisk ? { en: "People at risk", ar: "أشخاص في خطر", tone: "bg-coral-soft text-coral-ink" } : null,
    a.observed.roadAffected ? { en: "Road affected", ar: "طريق متأثر", tone: "bg-amber-soft text-amber-ink" } : null,
    a.observed.poorVisibility ? { en: "Poor visibility", ar: "رؤية ضعيفة", tone: "bg-amber-soft text-amber-ink" } : null,
  ].filter((x): x is { en: string; ar: string; tone: string } => !!x);
  const sev = a.severity === "high" ? L(lang, "High severity", "خطورة عالية") : a.severity === "medium" ? L(lang, "Medium severity", "خطورة متوسطة") : null;
  return (
    <section className="mx-5 mt-4 rounded-2xl px-3.5 py-3 ring-1 ring-violet/25">
      <div className="flex items-center gap-2">
        <Sparkles size={14} className="text-violet" />
        <h3 className="text-[13px] font-semibold text-ink">{L(lang, "Claude's reading", "قراءة Claude")}</h3>
        <span className="ms-auto text-[11px] text-muted">
          {a.stage === "vision" ? L(lang, `${item.post.frames.length} frames + text`, `${item.post.frames.length} لقطات + النص`) : L(lang, "text only", "النص فقط")}
          {" · "}
          {item.liveAt ? L(lang, "live", "مباشر") : L(lang, "recorded", "مسجّل")}
        </span>
      </div>

      <p className="mt-2 text-[13.5px] leading-relaxed text-ink" dir={lang === "ar" ? "rtl" : "ltr"}>{L(lang, a.summary.en, a.summary.ar)}</p>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <CategoryChip category={a.category} lang={lang} />
        {!a.relevant && <span className="rounded-full bg-surface-2 px-2 py-[2px] text-[11px] font-semibold text-muted">{L(lang, "Filtered out", "مستبعد")}</span>}
        {a.relevant && sev && <span className={cn("rounded-full px-2 py-[2px] text-[11px] font-medium", a.severity === "high" ? "bg-coral-soft text-coral-ink" : "bg-amber-soft text-amber-ink")}>{sev}</span>}
        {a.possibleRepost && <span className="rounded-full bg-amber-soft px-2 py-[2px] text-[11px] font-semibold text-amber-ink">{L(lang, "Possible old repost", "إعادة نشر قديمة محتملة")}</span>}
        {seen.map((f) => (
          <span key={f.en} className={cn("rounded-full px-2 py-[2px] text-[11px] font-medium", f.tone)}>
            {L(lang, f.en, f.ar)}
          </span>
        ))}
      </div>

      {!a.relevant && a.noiseReason && <p className="mt-2.5 text-[12px] leading-relaxed text-ink-2">{a.noiseReason}</p>}
      {a.repostReason && <p className="mt-2.5 text-[12px] leading-relaxed text-amber-ink">{a.repostReason}</p>}
      {(a.claim || a.question) && (
        <p className="mt-2.5 rounded-xl bg-amber-soft/60 px-3 py-2 text-[12px] text-ink">
          <b className="me-1">{a.claim ? L(lang, "Claim:", "الادعاء:") : L(lang, "Question:", "السؤال:")}</b>
          {a.claim ?? a.question}
        </p>
      )}

      {a.evidence.length > 0 && (
        <ul className="mt-2.5 space-y-1 border-t border-line pt-2.5">
          {a.evidence.slice(0, 3).map((e) => (
            <li key={e} className="text-[12px] leading-snug text-ink-2" dir="auto">
              · {e}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-center gap-3">
        <span className="tnum text-[11.5px] text-muted">{L(lang, `Confidence ${Math.round(a.confidence * 100)}%`, `الثقة ${Math.round(a.confidence * 100)}%`)}</span>
        <Button
          tone="soft"
          size="sm"
          className="ms-auto"
          onClick={rerun}
          disabled={busy || !view.llmAvailable}
          title={view.llmAvailable ? undefined : L(lang, "No AI key configured", "لم يُضبط مفتاح الذكاء الاصطناعي")}
          icon={<RefreshCw size={13} className={busy ? "animate-spin" : ""} />}
        >
          {busy ? L(lang, "Claude is reading…", "Claude يقرأ…") : L(lang, "Re-run live with Claude", "إعادة التشغيل مباشرة مع Claude")}
        </Button>
      </div>
      {result && (
        <p className="mt-2 flex items-center gap-1.5 text-[12px] font-medium text-teal-ink">
          <Check size={13} /> {L(lang, `Live reading in ${(result.ms / 1000).toFixed(1)} s — ${result.same ? "same verdict as recorded" : "verdict updated"}`, `قراءة مباشرة خلال ${(result.ms / 1000).toFixed(1)} ث — ${result.same ? "الحكم نفسه المسجّل" : "تم تحديث الحكم"}`)}
        </p>
      )}
      {err && (
        <p className="mt-2 flex items-center gap-1.5 text-[12px] text-amber-ink">
          <TriangleAlert size={13} /> {err}
        </p>
      )}
    </section>
  );
}

function Where({ item, view }: { item: SignalItemView; view: SignalsView }) {
  const { lang } = useOps();
  const flyTo = useUi((s) => s.flyTo);
  const replay = view.dataset === "replay";
  const mentions = item.analysis?.places ?? [];
  const radius = (m: number) => (m >= 1000 ? `± ${(m / 1000).toFixed(1)} km` : `± ${m} m`);
  return (
    <section className="mx-5 mt-5">
      <SectionTitle title={L(lang, "Where — matched by code, never by AI", "المكان — مطابقة برمجية لا بالذكاء الاصطناعي")} />
      {item.places.length ? (
        <ul className="divide-y divide-line rounded-2xl ring-1 ring-line">
          {item.places.map((pl) => (
            <li key={pl.entryId + pl.mention} className="flex items-center gap-2 px-3.5 py-2.5">
              <span className="min-w-0 truncate text-[12.5px] font-semibold text-ink">{L(lang, pl.label.en, pl.label.ar)}</span>
              <span className="tnum shrink-0 text-[11.5px] text-muted">{radius(pl.radiusM)}</span>
              <button
                onClick={() => flyTo({ kind: "point", lngLat: pl.lngLat, zoom: replay ? 12.6 : 16.8, pitch: 62 })}
                className="ms-auto inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] font-medium text-violet hover:bg-violet-soft"
              >
                <Crosshair size={12} /> {L(lang, "Fly to", "انتقال")}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl bg-surface-2 px-3 py-3 text-[12px] text-muted">
          {mentions.length
            ? L(lang, `Mentions (${mentions.map((m) => m.text).join(", ")}) are too broad to place — an emirate or country is never pinned.`, `الإشارات (${mentions.map((m) => m.text).join("، ")}) أوسع من أن تُحدَّد — لا تُثبَّت إمارة أو دولة على الخريطة.`)
            : L(lang, "No place named, so it is not on the map. Locations are never guessed.", "لم يُذكر مكان، فلم يُوضع على الخريطة. لا يُخمَّن الموقع أبدًا.")}
        </p>
      )}
    </section>
  );
}

/** Provenance and matching internals — for audit, not for the first look. */
function Details({ item }: { item: SignalItemView }) {
  const { lang } = useOps();
  const p = item.post;
  const a = item.analysis;
  const row = (k: string, v: ReactNode) => (
    <div className="flex justify-between gap-3 py-0.5">
      <dt className="text-muted">{k}</dt>
      <dd className="min-w-0 text-end text-ink">{v}</dd>
    </div>
  );
  return (
    <Disclosure className="mx-5 mt-4" summary={L(lang, "Details & provenance", "التفاصيل والمصدر")}>
      <dl className="text-[11.5px]">
        {row(L(lang, "Post", "المنشور"), <span className="font-id">{p.id}</span>)}
        {row(L(lang, "Source", "المصدر"), p.synthetic ? L(lang, "Synthetic (training)", "اصطناعي (تدريب)") : L(lang, "Real public post", "منشور عام حقيقي"))}
        {a && row(L(lang, "Model", "النموذج"), <span className="font-id">{a.model}</span>)}
        {a && row(L(lang, "Read", "القراءة"), a.stage === "vision" ? L(lang, "Frames + text", "لقطات + نص") : L(lang, "Text only", "النص فقط"))}
        {p.onScreenText.length > 0 && row(L(lang, "On screen", "على الشاشة"), <span dir="auto">{p.onScreenText.slice(0, 5).join(" · ")}</span>)}
      </dl>
      {item.places.length > 0 && (
        <ul className="mt-2.5 space-y-1.5 border-t border-line pt-2.5 text-[11.5px]">
          {item.places.map((pl) => (
            <li key={pl.entryId + pl.mention} className="text-ink-2">
              <span dir="auto">“{pl.mention}”</span> → <b className="font-semibold text-ink">{L(lang, pl.label.en, pl.label.ar)}</b>
              <span className="block text-muted">
                {pl.precision === "geotag" ? L(lang, "Post geotag", "الموقع المرفق بالمنشور") : pl.precision === "road" ? L(lang, "Road (OSM)", "طريق (OSM)") : `OSM ${pl.kind}`} · {L(lang, `match: ${pl.match}`, `المطابقة: ${pl.match}`)} ·{" "}
                <span className="tnum font-id">
                  {pl.lngLat[1].toFixed(4)}, {pl.lngLat[0].toFixed(4)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {!p.synthetic && <p className="mt-2.5 border-t border-line pt-2.5 text-[11px] text-muted">{L(lang, "Account details are not stored or shown.", "لا تُخزَّن بيانات الحساب ولا تُعرض.")}</p>}
      {p.url && (
        <a href={p.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-medium text-teal hover:underline">
          <ExternalLink size={12} /> {L(lang, "Open original", "فتح الأصل")}
        </a>
      )}
    </Disclosure>
  );
}
