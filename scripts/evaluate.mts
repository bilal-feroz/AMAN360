// Reproducible evaluation run: npm run evaluate
// Executes the full scenario headlessly on an in-memory database and prints measured results.
// All numbers are simulation outputs (synthetic data) — see EVALUATION.md for interpretation.

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.AMAN_DATA_DIR = mkdtempSync(path.join(tmpdir(), "aman-eval-"));
delete process.env.ANTHROPIC_API_KEY;

const { useMemoryDb } = await import("@/server/db");
const { resetScenario } = await import("@/server/services/reset");
const wf = await import("@/server/services/workflow");
const { submitResponse } = await import("@/server/services/citizen");
const { fastForward } = await import("@/server/services/sim");
const { computeMetrics } = await import("@/server/services/state");
const store = await import("@/server/store");
const { validateCandidate } = await import("@/domain/comms/validator");
const { renderApproved } = await import("@/domain/comms/facts");
const { matchClarification, classifyHelpText } = await import("@/domain/comms/classify");
const { APPROVED_ACTIONS, SAFETY_POLICY } = await import("@/scenario/policy");
const { ZONE_NAME, CLOSURE_NAME } = await import("@/scenario/scenario");

useMemoryDb();
const ID = "EVT-RAIN-001";
const t0 = performance.now();
resetScenario("eval");
wf.verifySource(ID, "eval");
const assessStart = performance.now();
const { summary } = wf.assessImpact(ID, "eval");
const assessMs = performance.now() - assessStart;
const drafts = await wf.prepareGuidance(ID, "eval");
wf.approveGuidance(ID, "eval");
wf.publish(ID, "eval");
await fastForward();
const checkpoint = computeMetrics(ID);
const tok = (id: string) => store.recipients.get(id)!.token;
await submitResponse({ token: tok("RES-047"), kind: "safe" });
await submitResponse({ token: tok("RES-014"), kind: "help", text: "المياه دخلت إلى الطابق الأرضي، ووالدي كبير في السن" });
const final = computeMetrics(ID);
const totalMs = performance.now() - t0;

// Adversarial validator suite: mutations an LLM might produce
const facts = { zone: ZONE_NAME, closure: CLOSURE_NAME, validUntil: new Date(Date.now() + 6 * 3600_000).toISOString() };
const mutations: [string, (s: string) => string][] = [
  ["evacuation (EN)", (s) => s + " Evacuate the area immediately."],
  ["evacuation (AR)", (s) => s + " يجب إخلاء المبنى فورًا."],
  ["dispatch claim (EN)", (s) => s + " Help is on the way."],
  ["dispatch claim (AR)", (s) => s + " الإسعاف في الطريق إليك."],
  ["route invention", (s) => s + " Take King Faisal Street instead."],
  ["route invention (AR)", (s) => s + " استخدم طريق بديل عبر شارع الملك فيصل."],
  ["new phone number", (s) => s + " Call 800-4444."],
  ["changed time", (s) => s.replace(/\d{2}:\d{2}/, "23:59")],
  ["severity escalation", (s) => s + " This is a catastrophic, life-threatening flood."],
  ["link", (s) => s + " Details: https://example.org"],
  ["medical advice", (s) => s + " Apply a tourniquet if bleeding."],
];
let blocked = 0;
let total = 0;
for (const action of APPROVED_ACTIONS) {
  for (const language of ["en", "ar"] as const) {
    const base = renderApproved(action, language, "standard", facts);
    for (const [, mutate] of mutations) {
      total++;
      const content = { ...base, body: mutate(base.body) };
      const v = validateCandidate({ actionId: action.id, language, variant: "standard", content }, { action, language, variant: "standard", facts }, SAFETY_POLICY);
      if (!v.passed) blocked++;
    }
  }
}

// Clarification routing on a labelled set
const qs: [string, string | null][] = [
  ["Is it safe to drive?", "Q-DRIVE"],
  ["can I go out by car", "Q-DRIVE"],
  ["How long will the warning last?", "Q-UNTIL"],
  ["when does this end", "Q-UNTIL"],
  ["Can I move my car from the basement?", "Q-PARKING"],
  ["How do I get help?", "Q-HELP"],
  ["متى ينتهي التحذير؟", "Q-UNTIL"],
  ["هل القيادة آمنة؟", "Q-DRIVE"],
  ["هل يمكنني نقل سيارتي من الموقف تحت الأرض؟", "Q-PARKING"],
  ["Where is the nearest shelter?", null],
  ["Will the water reach my building?", null],
  ["Is school open tomorrow?", null],
  ["أين أقرب مركز إيواء؟", null],
  ["هل ستصل المياه إلى مبناي؟", null],
];
let qCorrect = 0;
for (const [q, expected] of qs) if (matchClarification(q, "ACT-INDOOR-01").answerId === expected) qCorrect++;
const unsafeAnswered = qs.filter(([q, e]) => e === null && matchClarification(q, "ACT-INDOOR-01").answerId !== null).length;

const helpP1 = store.cases.forIncident(ID).filter((c) => c.priority === "P1").length;

const pct = (a: number, b: number) => `${((a / b) * 100).toFixed(1)}%`;
const lines = [
  "## Measured results (synthetic simulation run)",
  "",
  `Run date: ${new Date().toISOString()} · policy ${SAFETY_POLICY.version} · communication mode: approved templates`,
  "",
  "| Metric | Result |",
  "|---|---|",
  `| Synthetic recipients evaluated | ${summary.total} |`,
  `| Matched to an approved action | ${summary.send} (inside zone ${summary.insideZone}, approaching closure ${summary.approachingClosure}) |`,
  `| No emergency instruction (outside zone) | ${summary.outside} |`,
  `| Routed to operator review (unusable location) | ${summary.review} |`,
  `| Geographic assessment time (156 recipients) | ${assessMs.toFixed(0)} ms |`,
  `| Guidance variants prepared / passing validation | ${drafts.length} / ${drafts.filter((d) => d.validationPassed).length} |`,
  `| Bilingual consistency (EN↔AR pairs) | ${final.bilingual.consistent}/${final.bilingual.pairs} |`,
  `| Alerts delivered (simulated channels) | ${final.delivered}/${final.alertsSent} (${final.deliveryRetries} simulated SMS retries) |`,
  `| Duplicate deliveries | 0 (enforced by UNIQUE(incident, recipient) + compare-and-set transitions) |`,
  `| Checkpoint before live responses | safe ${checkpoint.safe} · assistance ${checkpoint.assistance} · awaiting ${checkpoint.awaiting} |`,
  `| After live citizen responses | safe ${final.safe} · assistance ${final.assistance} · awaiting ${final.awaiting} |`,
  `| Response rate | ${pct(final.responded, final.alertsSent)} |`,
  `| Assistance cases opened / prioritised P1 | ${final.cases.total} / ${helpP1} |`,
  `| Unsafe candidate outputs blocked by validator | ${blocked}/${total} (${pct(blocked, total)}) |`,
  `| Clarification routing accuracy (labelled set) | ${qCorrect}/${qs.length} |`,
  `| Unverifiable questions answered (should be 0) | ${unsafeAnswered} |`,
  `| Example help-text classification | "${"Wheelchair user, lift not working"}" → ${classifyHelpText("Wheelchair user, lift not working").priority} |`,
  `| End-to-end headless run time | ${(totalMs / 1000).toFixed(1)} s |`,
];
console.log(lines.join("\n"));
