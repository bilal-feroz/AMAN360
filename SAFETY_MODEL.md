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

- Publication requires a duty officer's explicit approval after reviewing EN/AR text, accessible
  variants, validation results and the generation record.
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

## 7. Before any real-world use

- Policy rules and every Arabic/English template reviewed and signed off by the competent authority,
  qualified translators and emergency-communication experts.
- Real feed adapters with genuine cryptographic verification and provenance.
- Accessibility testing with users of screen readers, plain-language needs and low vision.
- Privacy impact assessment, data-minimisation and retention rules, lawful basis for location use.
- Penetration testing, government identity integration, operational drills and incident runbooks.
