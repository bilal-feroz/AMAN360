"use client";

import { useState } from "react";
import { ChevronDown, Flame, Printer, TreePine, Users } from "lucide-react";
import type { FireBoard, FireBoardStatus } from "@/server/services/state";
import { cn, Dot } from "@/components/ui";
import { useUi } from "@/lib/ui-store";
import { useOps } from "../context";
import { ActionBar, PanelHeader } from "./PanelHeader";
import { Empty } from "./ImpactPanel";
import { NEED_LABEL } from "./TriageCard";

type Lang = "en" | "ar";
const L = (lang: Lang, en: string, ar: string) => (lang === "ar" ? ar : en);

export const BOARD_STATUS: Record<FireBoardStatus, { color: string; ring: string; en: string; ar: string }> = {
  trapped: { color: "#c4412b", ring: "ring-coral-ink", en: "Trapped", ar: "عالق" },
  inside: { color: "#e8ac45", ring: "ring-amber", en: "Still inside", ar: "ما زال في الداخل" },
  unaccounted: { color: "#8fa3a8", ring: "ring-slate", en: "No reply", ar: "دون رد" },
  not_reached: { color: "#c3cfd1", ring: "ring-line-strong", en: "Not reached yet", ar: "لم يُبلَّغ بعد" },
  out: { color: "#0b8f88", ring: "ring-teal", en: "Out", ar: "خرج" },
};
const ORDER: FireBoardStatus[] = ["trapped", "inside", "unaccounted", "not_reached", "out"];

/**
 * Building fire: who is still inside Tower A, floor by floor. Every dot is one resident, coloured by
 * their latest reply (or by whether the alert reached them). This is what Civil Defence needs first.
 */
export function BuildingPanel() {
  const { state, lang } = useOps();
  const { selectCase, selectRecipient, flyTo } = useUi();
  const [showCleared, setShowCleared] = useState(false);
  const board = state?.fireBoard;
  if (!state || !board) return <Empty text={L(lang, "No building fire in this drill.", "لا يوجد حريق مبنى في هذا التمرين.")} />;
  const t = board.totals;
  const sent = state.metrics.alertsSent > 0;
  const accounted = t.out;
  // Floors where everyone is confirmed out fold into one line, so trapped people are never below the fold.
  const notClear = (row: FireBoard["rows"][number]) => row.fire || row.people.some((p) => p.status !== "out");
  const cleared = board.rows.filter((r) => !notClear(r));
  const rows = showCleared ? board.rows : board.rows.filter(notClear);

  const open = (p: FireBoard["rows"][number]["people"][number]) => {
    if (p.caseId) selectCase(p.caseId);
    else selectRecipient(p.id);
  };

  return (
    <div className="flex min-h-full flex-col">
      <PanelHeader
        eyebrow={L(lang, "Who is still inside", "من لا يزال في الداخل")}
        title={board.buildingName[lang]}
        aside={
          <button onClick={() => flyTo({ kind: "building" })} className="inline-flex items-center gap-1.5 rounded-full bg-coral-soft px-2.5 py-1 text-[11.5px] font-semibold text-coral-ink hover:ring-1 hover:ring-coral/40">
            <Flame size={13} /> {L(lang, `Fire · floor ${board.fireFloor}`, `حريق · الطابق ${board.fireFloor}`)}
          </button>
        }
      />

      <div className="px-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-[30px] font-semibold leading-none tracking-[-0.02em] text-ink">
              <span className="tnum">{accounted}</span>
              <span className="text-[18px] font-medium text-muted">/{t.residents}</span>
            </div>
            <div className="mt-1 text-[12px] font-medium text-ink-2">{L(lang, "residents confirmed out", "ساكنًا أكّدوا خروجهم")}</div>
          </div>
          {t.trapped > 0 && (
            <div className="rounded-xl bg-coral-ink px-3 py-2 text-end text-white">
              <div className="tnum text-[22px] font-semibold leading-none">{t.trapped}</div>
              <div className="mt-0.5 text-[11px] font-medium text-white/85">{L(lang, "trapped", "عالقون")}</div>
            </div>
          )}
        </div>
        <div className="mt-3 flex h-2 w-full gap-[2px] overflow-hidden rounded-full bg-surface-3">
          {ORDER.map((s) => {
            const n = s === "not_reached" ? t.notReached : t[s];
            return n ? <span key={s} style={{ width: `${(n / t.residents) * 100}%`, background: BOARD_STATUS[s].color }} className="h-full first:rounded-s-full last:rounded-e-full" /> : null;
          })}
        </div>
        <ul className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-ink-2">
          {ORDER.map((s) => {
            const n = s === "not_reached" ? t.notReached : t[s];
            return (
              <li key={s} className="flex items-center gap-1.5">
                <Dot color={BOARD_STATUS[s].color} />
                <span className="tnum font-semibold text-ink">{n}</span> {L(lang, BOARD_STATUS[s].en, BOARD_STATUS[s].ar).toLowerCase()}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-surface-2 px-3 py-2 text-[12px] leading-snug text-ink-2">
          <TreePine size={14} className="mt-px shrink-0 text-teal" />
          <span>
            {L(lang, "Civil Defence instruction: full evacuation. Assembly: ", "تعليمات الدفاع المدني: إخلاء كامل. التجمع: ")}
            <b className="font-semibold text-ink">{board.assembly[lang]}</b>
          </span>
        </p>
        {!sent && <p className="mt-2 text-[12px] text-amber-ink">{L(lang, "The alert has not been sent yet — nobody has been asked.", "لم يُرسل التنبيه بعد — لم يُسأل أحد.")}</p>}
      </div>

      <section className="mt-4 border-t border-line px-5 pb-4 pt-3" aria-label={L(lang, "Floors", "الطوابق")}>
        <div className="mb-2 flex items-center justify-between text-[12.5px] font-semibold text-muted">
          <span>{cleared.length && !showCleared ? L(lang, "Floors not yet clear", "طوابق لم تُخلَ بعد") : L(lang, "Floors (top to bottom)", "الطوابق (من الأعلى إلى الأسفل)")}</span>
          <span className="inline-flex items-center gap-1 font-medium">
            <Users size={13} /> {t.residents}
          </span>
        </div>
        <ol className="space-y-1">
          {rows.map((row) => {
            const urgent = row.trapped > 0;
            const people = [...row.people].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));
            return (
              <li
                key={row.floor}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl px-2 py-1.5",
                  row.fire ? "bg-coral-soft/70 ring-1 ring-coral/30" : urgent ? "ring-1 ring-coral/30" : "hover:bg-surface-2",
                )}
              >
                <span
                  className={cn("tnum inline-flex h-7 w-9 shrink-0 items-center justify-center gap-0.5 rounded-lg text-[12px] font-semibold", row.fire ? "bg-coral-ink text-white" : "bg-surface-2 text-ink-2")}
                  title={row.fire ? L(lang, "Fire floor", "طابق الحريق") : undefined}
                >
                  {row.fire && <Flame size={11} className="shrink-0" />}
                  {row.floor || L(lang, "G", "أ")}
                </span>
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                  {row.fire && !people.length && <span className="text-[12px] font-medium text-coral-ink">{L(lang, `Fire floor ${row.floor} — no registered residents`, `طابق الحريق ${row.floor} — لا سكان مسجّلين`)}</span>}
                  {people.map((p) => {
                    const st = BOARD_STATUS[p.status];
                    const named = p.status === "trapped" || p.status === "inside";
                    return named ? (
                      <button
                        key={p.id}
                        onClick={() => open(p)}
                        title={`${p.name} · ${L(lang, st.en, st.ar)}`}
                        className={cn("inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[11.5px] font-semibold text-white", p.status === "trapped" ? "bg-coral-ink" : "bg-amber text-ink")}
                      >
                        <bdi>{p.name}</bdi>
                        {p.vulnerability.length > 0 && <span className="rounded-full bg-white/25 px-1 text-[10px]">{L(lang, NEED_LABEL[p.vulnerability[0]].en, NEED_LABEL[p.vulnerability[0]].ar)}</span>}
                      </button>
                    ) : (
                      <button key={p.id} onClick={() => open(p)} title={`${p.name} · ${L(lang, st.en, st.ar)}`} aria-label={`${p.name} · ${L(lang, st.en, st.ar)}`} className="h-3.5 w-3.5 rounded-full ring-2 ring-surface transition-transform hover:scale-125" style={{ background: st.color }} />
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ol>
        {cleared.length > 0 && (
          <button
            onClick={() => setShowCleared((v) => !v)}
            aria-expanded={showCleared}
            className="mt-2 flex w-full items-center gap-2 rounded-xl px-2 py-2 text-start text-[12px] text-ink-2 hover:bg-surface-2"
          >
            <Dot color={BOARD_STATUS.out.color} />
            <span className="flex-1">
              {showCleared
                ? L(lang, "Hide floors where everyone is out", "إخفاء الطوابق التي خرج منها الجميع")
                : L(lang, `${cleared.length} more floors — everyone out`, `${cleared.length} طوابق أخرى — خرج الجميع`)}
            </span>
            <ChevronDown size={14} className={cn("shrink-0 text-muted transition-transform", showCleared && "rotate-180")} />
          </button>
        )}
      </section>

      <ActionBar>
        <button
          onClick={() => openHandover(board, lang)}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-ink text-[14.5px] font-semibold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.1)] hover:bg-ink-2"
        >
          <Printer size={17} /> {L(lang, "Civil Defence handover sheet", "ورقة التسليم للدفاع المدني")}
        </button>
      </ActionBar>
    </div>
  );
}

/** A one-page, printable list of everyone not yet confirmed out, by floor — for the incident commander. */
function openHandover(board: FireBoard, lang: Lang) {
  const w = window.open("", "_blank", "width=820,height=960");
  if (!w) return;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const at = new Intl.DateTimeFormat(lang === "ar" ? "ar-AE-u-nu-latn" : "en-GB", { timeZone: "Asia/Dubai", dateStyle: "medium", timeStyle: "short" }).format(new Date());
  const rows = board.rows
    .flatMap((r) => r.people.filter((p) => p.status !== "out").map((p) => ({ ...p, floor: r.floor })))
    .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || b.floor - a.floor);
  const st = (s: FireBoardStatus) => (lang === "ar" ? BOARD_STATUS[s].ar : BOARD_STATUS[s].en);
  const t = board.totals;
  const head = lang === "ar" ? ["الحالة", "الطابق", "الاسم", "احتياجات", "الحالة/الأولوية"] : ["Status", "Floor", "Name", "Needs", "Case"];
  w.document.write(`<!doctype html><html lang="${lang}" dir="${lang === "ar" ? "rtl" : "ltr"}"><head><meta charset="utf-8"><title>${esc(board.buildingName[lang])}</title>
<style>body{font:13px/1.45 system-ui,"Segoe UI",sans-serif;color:#102c33;margin:28px}h1{font-size:20px;margin:0}p{margin:4px 0;color:#2b4a52}
.k{display:flex;gap:18px;margin:14px 0}.k b{display:block;font-size:22px}table{width:100%;border-collapse:collapse;margin-top:10px}
th,td{text-align:start;padding:7px 8px;border-bottom:1px solid #dce5e2}th{font-size:11.5px;color:#667c83;text-transform:uppercase;letter-spacing:.04em}
.trapped td{background:#feebe7;font-weight:600}.note{margin-top:18px;font-size:11.5px;color:#667c83}@media print{button{display:none}}</style></head><body>
<button onclick="print()" style="float:inline-end;padding:8px 14px;font:600 13px system-ui">${lang === "ar" ? "طباعة" : "Print"}</button>
<h1>${esc(board.buildingName[lang])} — ${lang === "ar" ? `حريق في الطابق ${board.fireFloor}` : `fire on floor ${board.fireFloor}`}</h1>
<p>${lang === "ar" ? "ورقة تسليم للدفاع المدني · تمرين تدريبي ببيانات اصطناعية" : "Civil Defence handover · training drill, synthetic data"} · ${esc(at)}</p>
<div class="k"><div><b>${t.trapped}</b>${st("trapped")}</div><div><b>${t.inside}</b>${st("inside")}</div><div><b>${t.unaccounted}</b>${st("unaccounted")}</div><div><b>${t.notReached}</b>${st("not_reached")}</div><div><b>${t.out}/${t.residents}</b>${st("out")}</div></div>
<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>
${rows.map((p) => `<tr class="${p.status}"><td>${st(p.status)}</td><td>${p.floor}</td><td>${esc(p.name)}</td><td>${esc(p.vulnerability.map((v) => NEED_LABEL[v][lang]).join(lang === "ar" ? "، " : ", ") || "—")}</td><td>${p.caseId ? `${esc(p.caseId)} · ${p.priority}` : "—"}</td></tr>`).join("")}
</tbody></table>
<p class="note">${lang === "ar" ? "مأخوذة من آخر رد لكل ساكن في أمان. لم يُرسل أي فريق؛ هذه قائمة للمسؤول عن الحادثة." : "From each resident's latest reply in AMAN. No unit has been dispatched by AMAN; this is a list for the incident commander."}</p>
</body></html>`);
  w.document.close();
}
