# Safety model

> **AI communicates safety decisions. AI does not invent safety decisions.**

Emergency guidance fails dangerously when a generative model is allowed to decide *what* people
should do. AMAN 360 therefore splits the problem into a deterministic decision layer and a bounded
communication layer, with a validator and a human between them and the public.

```
verified facts ──► deterministic safety engine ──► approved action (ID + steps + locked facts)
                                                         │
                         approved wording (EN/AR) ◄──────┘
                                  │
             (optional) LLM simplification ──► deterministic validator ──► fallback to template on failure
                                  │
                           operator approval ──► simulated channels ──► citizen responses ──► human review
```

## 1. What is decided deterministically

| Decision | Where | How |
|---|---|---|
| Is the source trustworthy? | `verifySource` | Schema, simulated signature, geometry validity, closure confirmation, severity agreement |
| May anything be published? | `checkIncidentGate` | Fail-closed: verification, conflicts, incident expiry, policy status/expiry/effective date, policy version match, valid geometry, approved diversions only |
| Who is affected? | `evaluateGeo` | Point-in-polygon (boundary inclusive), 25 m precautionary margin, route ∩ confirmed closure within 1.5 km |
| Which action applies? | `decide` | Versioned rules `R-00` … `R-90` in `POLICY-2026-01`, one outcome per recipient |
| How urgent is a help request? | `classifyHelpText` | Keyword signals + recorded needs → P1/P2 (for human ordering only) |

No language model is called in any of these steps.

## 2. Policy rules (POLICY-2026-01)

| Rule | Outcome | Meaning |
|---|---|---|
| R-00-VERIFY | BLOCK | Unverified source → nothing prepared or published |
| R-01-CONFLICT | BLOCK | Conflicting critical facts / invalid geometry / unapproved diversion → operator review |
| R-02-EXPIRED | BLOCK | Expired incident or policy cannot be silently reused |
| R-10-NOLOC | REVIEW | Missing, stale or invalid location → no inference, operator review item |
| R-20-ZONE | SEND `ACT-INDOOR-01` | Inside the verified zone (boundary/uncertainty count as inside) |
| R-30-CLOSURE | SEND `ACT-ROAD-02` | Driver whose shared route crosses a confirmed closure ahead |
| R-90-OUTSIDE | NO_ACTION | Outside the zone and not approaching a closure — no unnecessary alert |

`ACT-ROAD-02` never contains a route. Diversions can exist only in the closure record's
`approvedDiversions` list with an approver; none exists in the scenario, and a diversion without an
approval record blocks publication.

## 3. What the AI may and may not do

| May | May not |
|---|---|
| Simplify approved wording (plain-language variant) | Change the action or its steps |
| Restructure for text-to-speech / screen readers | Change severity |
| Route a citizen question to one of the *approved* answers | Invent evacuation instructions or routes |
| | Change the zone, closure, times or place names |
| | Add contacts, numbers or links |
| | Claim police, ambulance, civil defence or "help" is on the way |
| | Give medical or rescue instructions |
| | Write the standard instruction (always the approved template) |
| | Write a free-form answer to a citizen |

### The Ask AMAN copilot

The copilot explains; it does not decide or act.

- **Display-only tools.** Its six tools render cards. None writes to the database. Suggested
  actions become buttons that a human must click. The server disables any that the workflow state
  does not allow (e.g. "Issue alerts" before approval), and the operator APIs still enforce roles.
- **Record-backed cards.** The model supplies ids and short wording only. Names, counts, rules,
  messages and timestamps on every card come from stored records; invented ids are dropped and
  reported back to the model as errors. Safety checks are recomputed on the server at answer time.
- **Prompt-injection boundary.** Citizen messages reach the model only inside `<citizen_text>`
  fences, declared as data in the system prompt; angle brackets are stripped. The model's case
  summaries are labelled "AI summary" with one click to the citizen's own words.
- **Honest labelling.** The panel always shows which mode answered (Claude vs rule-based). The
  rule-based fallback never shows "thinking", and a failed API call is shown as a failed step.
- **No paid calls without a key.** The key stays server-side in `.env.local`, which git ignores.

### Social intelligence (`src/domain/signals.ts`, `src/server/signals/`)

Public posts are the least trustworthy input in the system, so they get the tightest boundary.

| Step | Who does it | Guard |
|---|---|---|
| Read a post or video and fill a fixed form (category, places *named*, what is visible, rumour/question) | Claude | Structured output validated with Zod; post text passed inside `<post>` as untrusted data |
| Turn a place name into coordinates | Code | OpenStreetMap gazetteer lookup (exact → alias → bounded fuzzy match, kind-aware, distance-checked). The model never outputs a coordinate; emirate/country mentions are never pinned |
| Group reports into hotspots | Code | Only impact categories; reposts, rumours and context excluded; *corroborated* requires ≥ 2 independent sources |
| Act on a hotspot | A human | The only action is **Request verification**. Social signals cannot create, widen or change an alert |
| Answer a rumour | A human | Approved clarification template; only the gazetteer place name is filled in — the model's wording is never published |
| Live re-run | Analyst / officer | Rate-limited, audited, labelled *live*; the recorded reading stays available |

Unverified intelligence is drawn in **violet** everywhere (map, panel, copilot), never in the coral or
teal used for verified hazards and decisions.

### AI triage of help requests (`src/server/services/triage.ts`)

The keyword rule always runs; Claude's reading runs next to it. **Queue priority = the higher of the
two**: the model can raise a case to P1 and can never lower one (unit-tested). Triage orders the human
queue only — it never decides a response and is never shown to the citizen. Without a model, the rule
result stands and the UI says "Keyword triage".

### SMS and outage fallback (`src/domain/comms/sms.ts`, `src/domain/mesh.ts`)

| Step | Who does it | Guard |
|---|---|---|
| Write the SMS | Code | Short approved templates per action; facts (place, closure, time) filled by code. English and Arabic follow the approved wording; Hindi, Urdu, Malayalam, Bengali and Tagalog are marked *draft — native-speaker sign-off needed* in the UI |
| Read a reply | Code | Deterministic: 1 / 2 / 3 in any digit script, then keywords per language. *"Not safe"* counts as help. Unclear short replies get the menu again; longer ones go to a person — never dropped |
| Answer a question | Code | Approved answers only. Rescue, shelter, boat, ambulance, hospital and medical questions are never auto-answered — not by keywords, not by the model |
| Read a help text | Claude + rule | Same triage as the app: the model can raise a case, never lower one. Without a model, the keyword rule now covers urgent words in all SMS languages |
| Tower outage | Simulation | Operator switch, off by default, labelled as a drill. Relay sites are proposed positions; ranges are planning assumptions |

Every reply says this is not an emergency call and gives 999. No reply ever says help is coming.

### Red-team stress test (`src/domain/comms/redteam.ts`)

Eleven typical unsafe model edits — invented evacuation, "help is on the way", a detour, a new phone
number, a changed time, escalated severity, a link, medical advice, a dropped step, a blurred locked
place name, the wrong language — are applied to every approved message (2 actions × 2 languages ×
3 variants) and must all be blocked: **132 / 132** in the unit suite. Writing this suite exposed a real
gap: Arabic first-aid advice (*"ضع رباطًا ضاغطًا إذا كان هناك نزيف"*) was not caught. The medical
pattern now covers bandaging, bleeding, splints and first-aid wording in both languages. Operators can
run the same attacks live from the guidance panel.

## 4. The validator (`src/domain/comms/validator.ts`)

Every candidate — template-selected or LLM-generated — passes:

1. **Action identity** — same action ID, language and variant as requested.
2. **Step coverage** — exactly the approved step IDs, in order, none empty.
3. **Locked facts** — zone/closure names and validity time appear verbatim.
4. **Forbidden claims** — EN/AR patterns for evacuation, dispatch, routes/detours, severity
   escalation, medical procedures, links.
5. **Action-specific terms** — e.g. no driving wording in the stay-indoors action.
6. **Numbers** — every number must come from approved facts or approved contacts.
7. **Script** — Arabic output is Arabic script, English output is Latin.
8. **Length** — bounded growth; plain-language sentence limits.

Plus **bilingual consistency**: EN and AR for the same circumstances carry the same action, step IDs
and locked facts. A failing candidate is discarded, the approved variant is used, and
`guidance.blocked` is written to the audit log. Approval is refused if any variant fails.

Measured: 44/44 adversarial mutations blocked (see EVALUATION.md); the LLM pipeline is tested with
a fake provider that misbehaves (`tests/unit/llm-pipeline.test.ts`).

## 5. Humans in the loop

- The AMAN agent may *prepare* without being asked: it runs the same audited, deterministic steps
  an operator would (verify the source, match recipients, prepare and validate guidance) and then
  stops. It cannot approve or send. If the feed conflicts or fails verification it stops and says so.
- Publication requires a duty officer's explicit approval after reviewing EN/AR text, accessible
  variants, validation results and the generation record — one decision, **Approve & send**.
- The single exception is the **pre-authorised auto-send** policy, modelled on systems such as
  earthquake early warning where seconds matter. An authorised officer switches it on in advance
  (it is off by default and after every reset). It fires only when all six conditions hold —
  policy on, official verified feed, severity warning or higher, approved template wording only
  (model rewrites are discarded and the message is re-prepared from templates), every validation
  check passed, no conflicting reports — and only after a 15-second hold window in which any
  operator can stop it. Every condition is re-checked at send time; any change cancels the send.
  Social-media signals cannot start it. Unit-tested in `tests/unit/automation.test.ts`.
- Assistance requests become cases that an operator must acknowledge, follow up and resolve.
- Unverifiable questions and unusable locations become review items, never automated answers.
- The citizen is told the truth: "An operator will review it. This prototype does not dispatch
  emergency services. If life is in danger, call 999 now."

## 6. Fail-safe behaviour

| Failure | Behaviour |
|---|---|
| LLM unavailable / refuses / times out | Approved templates; demo unaffected |
| Validator fails a candidate | Candidate blocked, template used, audited |
| Conflicting facts arrive | Incident `blocked`; approval refused; review item created |
| Incident or policy expired | Gate blocks preparation, approval and publication |
| Missing location | Review item; no message |
| Duplicate tap / retry | Idempotency key; duplicate "safe" recorded once |
| Server restart / reload | State, schedule and audit persist in SQLite |
| Basemap offline | Cached tiles + bundled city pack; 2D fallback without WebGL |
| Social post names an unknown or far-away place | Not placed on the map; never guessed |
| Model unavailable for triage / post reading | Keyword rules / recorded readings, labelled as such |
| A real post is deleted by its author | Embed stops playing; the recorded frames and reading remain |

## 7. Before any real-world use

- Policy rules and every Arabic/English template reviewed and signed off by the competent authority,
  qualified translators and emergency-communication experts.
- Real feed adapters with genuine cryptographic verification and provenance.
- Accessibility testing with users of screen readers, plain-language needs and low vision.
- Privacy impact assessment, data-minimisation and retention rules, lawful basis for location use.
- Penetration testing, government identity integration, operational drills and incident runbooks.
