import type { Metadata } from "next";
import Link from "next/link";
import { readFileSync } from "node:fs";
import path from "node:path";
import { providerStatus } from "@/server/comms/providers";
import { SAFETY_POLICY, APPROVED_ACTIONS } from "@/scenario/policy";
import { currentLang } from "@/server/session";
import { AmanMark } from "@/components/ui";

export const metadata: Metadata = { title: "AMAN 360 — Methodology & data sources" };
export const dynamic = "force-dynamic";

function cityStats() {
  try {
    const raw = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/city/buildings.json"), "utf8")) as { buildings: [number, number, number][]; extracted: string };
    const est = raw.buildings.filter((b) => b[2] === 1).length;
    return { total: raw.buildings.length, tagged: raw.buildings.length - est, extracted: raw.extracted };
  } catch {
    return null;
  }
}

export default async function Methodology() {
  const lang = await currentLang();
  const p = providerStatus();
  const city = cityStats();
  const ar = lang === "ar";
  const H = ({ children }: { children: React.ReactNode }) => <h2 className="mt-10 text-[20px] font-semibold text-ink">{children}</h2>;
  return (
    <main className="mx-auto max-w-[860px] px-6 py-10 text-[15px] leading-relaxed text-ink-2">
      <div className="flex items-center gap-3 text-teal">
        <AmanMark size={34} />
        <span className="text-[18px] font-semibold tracking-[0.05em] text-ink">AMAN 360</span>
        <Link href="/" className="ms-auto text-[13px] font-medium text-teal hover:underline">
          {ar ? "العودة إلى مركز العمليات" : "Back to command center"}
        </Link>
      </div>
      <h1 className="mt-6 text-[30px] font-semibold leading-tight text-ink">{ar ? "المنهجية ومصادر البيانات" : "Methodology & data sources"}</h1>
      <p className="mt-2">
        {ar
          ? "هذا نموذج أولي لأغراض التدريب ببيانات اصطناعية. لا يتصل بأي نظام حكومي، ولا يرسل رسائل إلى أشخاص حقيقيين، ولا يدّعي أنه مُعتمد أو مُشغّل رسميًا."
          : "This is a training prototype running on synthetic data. It is not connected to any government system, sends no messages to real people, and does not claim to be authorised or deployed."}
      </p>

      <H>{ar ? "وضع التواصل الحالي" : "Current communication mode"}</H>
      <div className="mt-3 rounded-2xl bg-surface p-5 ring-1 ring-line">
        <div className="text-[16px] font-semibold text-ink">{p.label}</div>
        <p className="mt-1 text-[14px]">
          {p.llmConfigured
            ? ar
              ? `نموذج لغوي مُعدّ على الخادم (${p.model}). يُستخدم فقط لتبسيط الصياغة المعتمدة واختيار الإجابات المعتمدة، ويخضع كل ناتج لتحقق حتمي مع الرجوع إلى القالب المعتمد عند الفشل.`
              : `Server-side LLM configured (${p.model}). Used only to simplify approved wording and to route questions to approved answers; every output is deterministically validated and falls back to the approved template on failure.`
            : ar
              ? "لم يتم إعداد مزود نموذج لغوي. تعمل جميع الرسائل من مكتبة القوالب المعتمدة ثنائية اللغة ومن مصنّفات حتمية — ولا يُعرض أي منها على أنه توليد مباشر بالذكاء الاصطناعي."
              : "No LLM provider is configured. All messages come from the approved bilingual template library and deterministic classifiers — none of it is presented as live AI generation."}
        </p>
      </div>

      <H>{ar ? "مصادر البيانات الجغرافية" : "Geographic data sources"}</H>
      <ul className="mt-3 list-disc space-y-2 ps-6">
        <li>
          <b className="text-ink">OpenStreetMap</b> — {ar ? "بصمات المباني والطرق (رخصة ODbL)." : "building footprints and roads (ODbL)."}{" "}
          {city &&
            (ar
              ? `${city.total.toLocaleString()} مبنى في وسط الشارقة؛ ${city.tagged.toLocaleString()} منها بارتفاع موسوم في OSM، والباقي تقدير متحفظ حسب نوع المبنى.`
              : `${city.total.toLocaleString()} buildings in central Sharjah; ${city.tagged.toLocaleString()} carry an OSM height/levels tag, the rest use a conservative class-based estimate.`)}
        </li>
        <li>
          <b className="text-ink">OpenFreeMap / OpenMapTiles</b> — {ar ? "الخريطة الأساسية المتجهة (مجانية، دون مفتاح)." : "vector basemap tiles (free, no key)."}
        </li>
        <li>
          <b className="text-ink">EOxCloudless 2024 (Sentinel-2)</b> — {ar ? "صور الأرض للقطات الافتتاحية (CC BY-NC-SA 4.0 للاستخدام غير التجاري والتعليمي)." : "Earth imagery for the opening shots (CC BY-NC-SA 4.0 for non-commercial / education use)."}
        </li>
        <li>
          {ar
            ? "نموذج المدينة ثلاثي الأبعاد هو تمثيل هندسي (بصمات مرفوعة)، وليس تصويرًا مساحيًا واقعيًا. تم تقييم Google Photorealistic 3D Tiles وCesium ion لكنهما يتطلبان مفاتيح وحسابات فوترة ولم يُفعّلا."
            : "The 3D city is a geometric model (extruded footprints), not photogrammetry. Google Photorealistic 3D Tiles and Cesium ion were evaluated but require keys/billing accounts and are not enabled."}
        </li>
      </ul>

      <H>{ar ? "السياسة والإجراءات المعتمدة" : "Policy & approved actions"}</H>
      <p className="mt-2">
        <span className="font-id">{SAFETY_POLICY.version}</span> — {SAFETY_POLICY.name}
      </p>
      <ul className="mt-3 space-y-2">
        {SAFETY_POLICY.rules.map((r) => (
          <li key={r.id} className="rounded-xl bg-surface px-4 py-3 ring-1 ring-line">
            <span className="font-id me-2 text-[13px] text-ink">{r.id}</span>
            <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[12px]">{r.outcome}</span>
            {r.actionId && <span className="font-id ms-2 text-[12.5px] text-coral-ink">{r.actionId}</span>}
            <p className="mt-1 text-[14px]">{r.description[lang]}</p>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[14px]">
        {ar ? "الإجراءات المعتمدة:" : "Approved actions:"} {APPROVED_ACTIONS.map((a) => a.id).join(", ")}.{" "}
        {ar
          ? "الصياغة العربية والإنجليزية كُتبت لهذا النموذج وتتطلب مراجعة خبراء الترجمة ومصطلحات الطوارئ قبل أي استخدام حقيقي."
          : "Arabic and English wording was written for this prototype and requires review by qualified translators and emergency-terminology experts before any real use."}
      </p>

      <H>{ar ? "الخصوصية" : "Privacy"}</H>
      <p className="mt-2">
        {ar
          ? "جميع المستلمين اصطناعيون. تعرض المناظر العامة تجميعات تقريبية (خلايا ≈120 م) فقط؛ يظهر الموقع الدقيق داخل سجل الحالة للمشغّل المعني فقط. روابط المواطنين رموز مبهمة."
          : "All recipients are synthetic. Overview displays show only coarse aggregates (≈120 m cells); a precise position appears only inside an individual case record for the operator handling it. Citizen links are opaque tokens."}
      </p>

      <H>{ar ? "الوثائق" : "Documentation"}</H>
      <p className="mt-2">
        README.md · ARCHITECTURE.md · SAFETY_MODEL.md · EVALUATION.md · DEMO_SCRIPT.md · ROADMAP.md · DEPLOYMENT.md · BUILD_LOG.md
      </p>
    </main>
  );
}
