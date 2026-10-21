# Evaluation

AMAN 360 is evaluated on whether it gets the **right guidance to the right people**, **safely**,
and whether it **closes the loop** fast enough to help operators act. Everything below is measured
on the synthetic training scenario; none of it is a claim about real-world performance.

## Outcomes and how they are measured

| Outcome | Metric | Source of truth |
|---|---|---|
| Correct targeting | Recipients matched / excluded / flagged vs. ground truth of the synthetic placement | `decisions` table, `assess()` |
| Safe decisions | Gate blocks on unverified, conflicting, expired or invalid inputs | Unit tests (`safety.test.ts`) |
| Safe language | Share of unsafe candidate outputs blocked by the validator | `npm run evaluate`, `messaging.test.ts`, `llm-pipeline.test.ts` |
| Bilingual fidelity | EN↔AR pairs with identical action, steps and locked facts | Guidance checks |
| Speed to guidance | Ingestion → approved guidance | `source.ingested` → `operator.approved` audit events |
| Speed to people | Approval → first / all simulated deliveries | `delivered_at` timestamps |
| Engagement | Response rate, median time to first response | `responses` vs `messages` |
| Help reaches humans | Assistance cases opened, P1 share, time to acknowledgement and resolution | `cases` table |
| No one forgotten | Unanswered alerts flagged after the acknowledgement window | `no_response.flagged` |
| Reliability | No duplicate deliveries; idempotent responses; state survives restart | DB constraints, tests |

## Test methods

- **Unit & integration (Vitest, 83 tests):** spatial logic (inside/outside/boundary/uncertainty,
  closure intersection, invalid/missing data), safety rules and gate, every approved template in
  both languages and all variants, adversarial validator cases in EN and AR, deterministic
  classifiers, full workflow on an in-memory database, citizen responses (persistence, cases,
  review items, invalid tokens, idempotency), state transitions, LLM pipeline with a fake provider
  (well-behaved, unsafe, unavailable).
- **End-to-end (Playwright, real browser + GPU):**
  - `demo-flow.spec.ts` — the non-negotiable loop across *separate* browser contexts (operator,
    Arabic citizen, English citizen): activation → matching → approval → delivery → responses →
    live command-center update without reload → case acknowledgement visible on the citizen's
    phone → Arabic RTL → timeline replay → reset; asserts zero console errors.
  - `presentation.spec.ts` — Presentation Mode end to end in real time, asserting the final
    records (120 / 85 / 8 / 27) and the acknowledged case.
- **Headless evaluation run:** `npm run evaluate` (reproduces the table below).

## Measured results (synthetic simulation run)

Communication mode: approved templates (no LLM key configured in this build environment).

| Metric | Result |
|---|---|
| Synthetic recipients evaluated | 156 |
| Matched to an approved action | 120 (inside zone 106, approaching closure 14) |
| No emergency instruction (outside zone) | 32 |
| Routed to operator review (unusable location) | 4 |
| Geographic assessment time (156 recipients, incl. warm-up) | ≈ 0.9 s |
| Guidance variants prepared / passing validation | 12 / 12 |
| Bilingual consistency (EN↔AR pairs) | 6 / 6 |
| Alerts delivered (simulated channels) | 120 / 120 (4 simulated SMS retries) |
| Duplicate deliveries | 0 |
| Checkpoint before live responses | safe 84 · assistance 7 · awaiting 29 |
| After the two live citizen responses | **safe 85 · assistance 8 · awaiting 27** |
| Response rate | 80.0 % |
| Assistance cases opened / prioritised P1 | 8 / 7 |
| Unsafe candidate outputs blocked by the validator | **44 / 44 (100 %)** |
| Clarification routing accuracy (labelled set) | 14 / 14 |
| Unverifiable questions answered automatically | **0** |
| End-to-end headless run | ≈ 1.5 s |

The presentation-deck baseline (120 sent · 85 safe · 8 assistance · 27 pending) is reproduced from
actual records: the synthetic population's scheduled behaviours produce 84 / 7 / 29, and the two
live demo taps (Daniel safe, Mariam help) move it to 85 / 8 / 27.

**Operational timings** (ingestion → approval, approval → delivery, median response, case
acknowledgement) are shown live in the Response Intelligence panel from audit timestamps. In the
demo they reflect the presenter's pace and compressed simulation time (seconds instead of minutes),
so they demonstrate the measurement method rather than real performance.

## Caveats

- The labelled clarification set (14 questions) and adversarial mutations (11 patterns × 2 actions
  × 2 languages) were written by the development team; they test the guard-rails, not general
  language understanding. An independent red-team set is part of the validation phase (ROADMAP.md).
- Synthetic behaviour (who responds, when) is scripted and deterministic; it demonstrates that the
  pipeline measures outcomes correctly, not how real populations behave.
- The LLM path is exercised with a fake provider in tests; a live-model evaluation (quality of
  simplifications, refusal and latency rates) requires an authorised key and expert raters.
