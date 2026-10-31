// Records Claude's triage of the scenario's scripted help requests (simulated population + Mariam),
// so the demo shows real model output without calling the API on every reset:
//
//   npx tsx --env-file=.env.local --conditions=react-server scripts/build-triage-cache.mts

import { writeFileSync } from "node:fs";
import path from "node:path";
import population from "@/scenario/population.json";

const { askModel, triageKey } = await import("@/server/services/triage");
const { PERSONA_TEXT } = await import("@/scenario/recipients");

type R = { id: string; vulnerability: string[]; sim: { kind: string; text?: string } | null };
const recips = (population as unknown as { recipients: R[] }).recipients;
const inputs = recips.filter((r) => r.sim?.kind === "help" && r.sim.text).map((r) => ({ text: r.sim!.text!, vulnerability: r.vulnerability }));
const mariam = recips.find((r) => r.id === "RES-014")!;
inputs.push({ text: PERSONA_TEXT.mariamHelp, vulnerability: mariam.vulnerability });
// What presenters most often type on the English phone during a live demo.
inputs.push({ text: "Water is coming into our flat and my grandmother cannot walk", vulnerability: [] });

const model = process.env.AMAN_LLM_MODEL?.trim() || "claude-opus-5-5";
const items: Record<string, unknown> = {};
for (const i of inputs) {
  const out = await askModel(i.text, i.vulnerability, model, 60_000);
  if (!out) throw new Error(`no result for: ${i.text}`);
  items[triageKey(i.text, i.vulnerability)] = { ...out.raw, model: out.model, text: i.text };
  console.log(`${out.raw.urgency} ${out.raw.needs.join(",").padEnd(30)} ${i.text.slice(0, 60)}`);
}
writeFileSync(path.resolve("src/scenario/triage-cache.json"), JSON.stringify({ version: "triage-v1", model, builtAt: new Date().toISOString(), items }, null, 1));
