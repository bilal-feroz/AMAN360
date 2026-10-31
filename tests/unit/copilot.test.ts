import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CopilotEvent } from "@/domain/copilot";

process.env.AMAN_DATA_DIR = mkdtempSync(path.join(tmpdir(), "aman-test-"));
delete process.env.ANTHROPIC_API_KEY;

const { useMemoryDb } = await import("@/server/db");
const { resetScenario } = await import("@/server/services/reset");
const wf = await import("@/server/services/workflow");
const { fastForward } = await import("@/server/services/sim");
const { getOpsState } = await import("@/server/services/state");
const { runCopilot, setCopilotFactoryForTests } = await import("@/server/copilot/run");
const { buildSnapshot } = await import("@/server/copilot/context");
const { TOOLS } = await import("@/server/copilot/tools");
const { applyEvent } = await import("@/lib/copilot-client");

const ID = "EVT-RAIN-001";
const OP = "OP-ALYA";
const ctrl = () => new AbortController().signal;

async function published() {
  wf.verifySource(ID, OP);
  wf.assessImpact(ID, OP);
  await wf.prepareGuidance(ID, OP);
  wf.approveGuidance(ID, OP);
  wf.publish(ID, OP);
  await fastForward();
}

async function collect(question: string, lang: "en" | "ar" = "en") {
  const events: CopilotEvent[] = [];
  await runCopilot({ question, lang, history: [] }, (e) => events.push(e), ctrl());
  return events;
}

const components = (events: CopilotEvent[]) => events.filter((e): e is Extract<CopilotEvent, { t: "component" }> => e.t === "component");

/** Scripted stand-in for the streamed Messages API (no network). */
function scripted(turns: { events: unknown[]; final: { content: unknown[]; stop_reason: string } }[]) {
  const calls: Record<string, any>[] = [];
  let i = 0;
  const factory = (params: Record<string, unknown>) => {
    calls.push(JSON.parse(JSON.stringify(params)));
    const t = turns[i++];
    return {
      events: (async function* () {
        for (const e of t.events) yield e;
      })(),
      final: async () => ({ ...t.final, model: "claude-opus-5-5", usage: { input_tokens: 1, output_tokens: 1 } }),
    };
  };
  return { factory, calls };
}

function toolUseEvents(index: number, id: string, name: string, input: unknown) {
  const json = JSON.stringify(input);
  const mid = Math.floor(json.length / 2);
  return [
    { type: "content_block_start", index, content_block: { type: "tool_use", id, name, input: {} } },
    { type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: json.slice(0, mid) } },
    { type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: json.slice(mid) } },
    { type: "content_block_stop", index },
  ];
}

function textEvents(index: number, text: string) {
  return [
    { type: "content_block_start", index, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index, delta: { type: "text_delta", text } },
    { type: "content_block_stop", index },
  ];
}

beforeAll(() => useMemoryDb());
beforeEach(() => {
  resetScenario("test");
  setCopilotFactoryForTests(null);
});

describe("copilot — rule-based mode (no model configured)", () => {
  it("labels itself as rule-based and never emits model thinking", async () => {
    const events = await collect("Brief me on Al Majaz");
    expect(events[0]).toMatchObject({ t: "meta", mode: "rules", model: null });
    expect(events.some((e) => e.t === "thinking")).toBe(false);
    const overview = components(events).find((c) => c.kind === "overview");
    expect(overview?.kind === "overview" && overview.props.state).toBe("draft");
    expect(events.at(-1)).toMatchObject({ t: "done", mode: "rules" });
  });

  it("orders open help requests P1 first from stored cases", async () => {
    await published();
    const cards = components(await collect("Who needs help first?"));
    const cases = cards.find((c) => c.kind === "cases");
    expect(cases?.kind).toBe("cases");
    if (cases?.kind !== "cases") return;
    const stored = new Set(getOpsState().cases.map((c) => c.id));
    expect(cases.props.items.length).toBeGreaterThan(0);
    expect(cases.props.items.every((c) => stored.has(c.caseId))).toBe(true);
    const pri = cases.props.items.map((c) => c.priority);
    expect(pri.indexOf("P2") === -1 || pri.lastIndexOf("P1") < pri.indexOf("P2")).toBe(true);
  });

  it("traces a named person's decision chain with the applied rule", async () => {
    await published();
    const trace = components(await collect("Why did Mariam get this message?")).find((c) => c.kind === "trace");
    expect(trace?.kind === "trace" && trace.props.recipientId).toBe("RES-014");
    if (trace?.kind !== "trace") return;
    expect(trace.props.rows.find((r) => r.id === "rule")?.tags.map((t) => t.text)).toContain("R-20-ZONE");
  });

  it("re-runs the real safety checks", async () => {
    await published();
    const events = await collect("Run the safety checks");
    const checks = events.filter((e) => e.t === "check");
    expect(checks.length).toBeGreaterThanOrEqual(4);
    expect(checks.every((c) => c.t === "check" && c.status === "pass")).toBe(true);
  });
});

describe("copilot — model mode (scripted stream)", () => {
  it("streams thinking, renders validated cards and drops invented case ids", async () => {
    await published();
    const real = getOpsState().cases[0].id;
    const input = { cases: [{ case_id: real, need: "elderly", summary: "Elderly father needs help moving upstairs." }, { case_id: "CASE-999", need: "medical", summary: "Invented." }] };
    const { factory, calls } = scripted([
      {
        events: [
          { type: "message_start", message: { model: "claude-opus-5-5" } },
          { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } },
          { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "Ranking open cases." } },
          { type: "content_block_stop", index: 0 },
          ...toolUseEvents(1, "tu_1", "show_priority_cases", input),
        ],
        final: { content: [{ type: "thinking", thinking: "Ranking open cases.", signature: "sig" }, { type: "tool_use", id: "tu_1", name: "show_priority_cases", input }], stop_reason: "tool_use" },
      },
      { events: textEvents(0, "Start with the P1 case."), final: { content: [{ type: "text", text: "Start with the P1 case." }], stop_reason: "end_turn" } },
    ]);
    setCopilotFactoryForTests(factory);
    const events = await collect("Who needs help first?");

    expect(events[0]).toMatchObject({ t: "meta", mode: "llm" });
    expect(events.some((e) => e.t === "thinking")).toBe(true);
    const start = events.findIndex((e) => e.t === "component_start");
    const done = events.findIndex((e) => e.t === "component");
    expect(start).toBeGreaterThan(-1);
    expect(done).toBeGreaterThan(start);
    const cases = components(events).find((c) => c.kind === "cases");
    expect(cases?.kind === "cases" && cases.props.items.map((c) => c.caseId)).toEqual([real]);
    expect(cases?.kind === "cases" && cases.props.items[0].summaryBy).toBe("llm");

    // The second turn receives a factual tool result that names the ignored id.
    const results = calls[1].messages.at(-1).content;
    expect(results[0]).toMatchObject({ type: "tool_result", tool_use_id: "tu_1" });
    expect(results[0].content).toContain("CASE-999");
    expect(events.filter((e) => e.t === "text").map((e) => (e.t === "text" ? e.delta : "")).join("")).toBe("Start with the P1 case.");
  });

  it("rejects tool input that does not match the schema", async () => {
    const bad = { action_id: "ACT-EVACUATE-99", variant: "standard" };
    const { factory, calls } = scripted([
      { events: toolUseEvents(0, "tu_x", "show_guidance", bad), final: { content: [{ type: "tool_use", id: "tu_x", name: "show_guidance", input: bad }], stop_reason: "tool_use" } },
      { events: textEvents(0, "Sorry."), final: { content: [{ type: "text", text: "Sorry." }], stop_reason: "end_turn" } },
    ]);
    setCopilotFactoryForTests(factory);
    const events = await collect("Show the guidance");
    expect(events.some((e) => e.t === "component_dropped" && e.id === "tu_x")).toBe(true);
    expect(components(events)).toHaveLength(0);
    expect(calls[1].messages.at(-1).content[0].is_error).toBe(true);
  });

  it("gates suggested workflow actions against the live state", async () => {
    const input = { actions: [{ kind: "issue_alerts", target: "", label: "Issue now" }, { kind: "activate_incident", target: "", label: "Activate" }] };
    const { factory } = scripted([
      { events: toolUseEvents(0, "tu_a", "suggest_actions", input), final: { content: [{ type: "tool_use", id: "tu_a", name: "suggest_actions", input }], stop_reason: "tool_use" } },
      { events: [], final: { content: [{ type: "text", text: "." }], stop_reason: "end_turn" } },
    ]);
    setCopilotFactoryForTests(factory);
    const actions = components(await collect("What next?")).find((c) => c.kind === "actions");
    expect(actions?.kind === "actions" && actions.props.items.map((a) => a.allowed)).toEqual([false, true]);
  });

  it("falls back to the labelled rule-based view when the model is unreachable", async () => {
    setCopilotFactoryForTests(() => ({
      events: (async function* () {
        throw new Error("offline");
      })(),
      final: async () => {
        throw new Error("offline");
      },
    }));
    const events = await collect("Brief me");
    expect(events.some((e) => e.t === "step" && e.state === "failed")).toBe(true);
    expect(events.find((e) => e.t === "meta" && e.mode === "rules")).toBeTruthy();
    expect(events.at(-1)).toMatchObject({ t: "done", mode: "rules" });
  });

  it("switches to the rule-based view when the model sends nothing in time", async () => {
    const { copilotTiming } = await import("@/server/copilot/run");
    const before = copilotTiming.firstEventMs;
    copilotTiming.firstEventMs = 50;
    setCopilotFactoryForTests((_params, signal) => ({
      events: (async function* () {
        await new Promise((_, reject) => signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
      })(),
      final: async () => {
        throw new Error("unreachable");
      },
    }));
    try {
      const events = await collect("Brief me");
      expect(events.find((e) => e.t === "step" && e.state === "failed")).toMatchObject({ text: expect.stringContaining("no response within") });
      expect(events.at(-1)).toMatchObject({ t: "done", mode: "rules" });
    } finally {
      copilotTiming.firstEventMs = before;
    }
  });

  it("sends the model a snapshot with citizen text fenced as data and no tokens", async () => {
    await published();
    const snap = buildSnapshot(getOpsState());
    const json = JSON.stringify(snap);
    expect(snap.cases.every((c) => c.citizen_text.startsWith("<citizen_text>") && c.citizen_text.endsWith("</citizen_text>"))).toBe(true);
    expect(json).not.toMatch(/"token"/);
    expect(TOOLS.every((t) => t.strict && t.eager_input_streaming)).toBe(true);
  });
});

describe("copilot client reducer", () => {
  it("interleaves text and cards in arrival order and applies check results", () => {
    let x = { id: 1, question: "q", status: "streaming" as const, startedAt: 0, ms: null, meta: null, steps: [], thinking: { text: "", ms: null, active: false }, parts: [], error: null };
    const seq: CopilotEvent[] = [
      { t: "text", delta: "Pulling " },
      { t: "text", delta: "it up." },
      { t: "component_start", id: "c1", kind: "checks", label: "Safety checks" },
      { t: "component", id: "c1", kind: "checks", props: { title: "x", items: [{ id: "gate", label: "Gate", status: "pending" }] } },
      { t: "check", id: "c1", checkId: "gate", status: "pass" },
      { t: "text", delta: "All clear." },
      { t: "done", ms: 5, mode: "llm" },
    ];
    let out: any = x;
    for (const e of seq) out = applyEvent(out, e);
    expect(out.parts.map((p: any) => p.type)).toEqual(["text", "component", "text"]);
    expect(out.parts[0].text).toBe("Pulling it up.");
    expect(out.parts[1].checks.gate.status).toBe("pass");
    expect(out.status).toBe("done");
  });
});
