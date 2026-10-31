// Records Claude's reading of the synthetic scenario posts (src/scenario/signals/scenario-posts.json):
//
//   npx tsx --env-file=.env.local --conditions=react-server scripts/build-scenario-signals.mts
//
// Cached per post (by text hash); only new or edited posts are sent to the model.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { SignalAnalysis } from "@/domain/signals";

const { createAnalyzer } = await import("@/server/signals/analyze");
const { scenarioPosts } = await import("@/scenario/signals/index");

const key = process.env.ANTHROPIC_API_KEY?.trim();
if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
const model = process.env.AMAN_LLM_MODEL?.trim() || "claude-opus-5-5";
const usage = { input: 0, output: 0 };
const analyzer = createAnalyzer(key, model, { onUsage: (u) => ((usage.input += u.input_tokens), (usage.output += u.output_tokens)) });

const file = path.resolve("src/scenario/signals/scenario-analysis.json");
const cached: { items: Record<string, SignalAnalysis & { inputHash?: string }> } = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { items: {} };
// Times relative to a fixed reference so the prompt reads naturally ("published 14:35 GST").
const posts = scenarioPosts(new Date("2026-10-31T10:30:00Z"));
const h = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);
const results: Record<string, SignalAnalysis & { inputHash: string }> = {};
const todo = posts.filter((p) => cached.items[p.id]?.inputHash !== h(p.text + p.hashtags.join()));
for (const p of posts) if (!todo.includes(p)) results[p.id] = cached.items[p.id] as SignalAnalysis & { inputHash: string };
for (let i = 0; i < todo.length; i += 20) {
  const batch = todo.slice(i, i + 20);
  for (const a of await analyzer.textBatch(batch)) {
    const p = batch.find((x) => x.id === a.postId)!;
    results[a.postId] = { ...a, inputHash: h(p.text + p.hashtags.join()) };
  }
  console.log(`analysed ${Math.min(i + 20, todo.length)}/${todo.length}`);
}
const missing = posts.filter((p) => !results[p.id]).map((p) => p.id);
if (missing.length) console.warn(`no result for: ${missing.join(", ")} — run again`);
writeFileSync(file, JSON.stringify({ version: "signals-v1", model, builtAt: new Date().toISOString(), items: results }, null, 1));
console.log(`done · in ${usage.input} · out ${usage.output} tokens · ≈ $${((usage.input / 1e6) * 4 + (usage.output / 1e6) * 20).toFixed(2)}`);
