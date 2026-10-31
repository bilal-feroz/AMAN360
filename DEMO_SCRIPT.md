# Ten-minute presentation (Universities Challenge 2026 format)

The challenge gives each team 15 minutes: about 10 to present, 5 for the judges' questions. Criteria:
**Technology & AI 30%**, Implementation 25%, Plan & Strategy 25%, Outcomes & Impact 20%.

| Time | Beat | What is on screen | Criterion it serves |
|---|---|---|---|
| 0:00–1:00 | **Problem.** April 2024: the heaviest rain in 75 years. Today's alerts are one-way — nobody knows who is safe, and rumours spread faster than facts. | Slide | Impact |
| 1:00–1:45 | **Solution in one line:** *"AMAN listens to the city, checks the facts, sends the right message to each person, stops rumours, and makes sure everyone who needs help reaches a human."* | Slide | Plan |
| 1:45–6:15 | **Live demo** — press **Presentation** (about 4 min; Space pauses). Beats below. | Product | Tech & AI, Implementation |
| 6:15–7:30 | **How the AI is used safely:** reads, sorts, summarises and flags; code checks; a human approves. Show the AI pill in the top bar (counts from records). | Product / slide | Tech & AI |
| 7:30–8:30 | **Impact:** SDG 11 (resilient cities), 13 (climate adaptation), 10 (language & accessibility equity), 16 (accountable institutions). Measured results from EVALUATION.md. | Slide | Impact |
| 8:30–9:30 | **Roadmap & scaling:** NCEMA cell broadcast + SMS link (no app to install), other hazards (sand, heat, fog), other emirates, Urdu/Hindi/Malayalam templates, private sector (schools, malls, campuses). | Slide | Plan |
| 9:30–10:00 | **Close:** *"From a warning to the right next step."* | Slide | — |

**Live demo beats (Presentation Mode):**

1. **Calm city** — digital twin of Al Majaz.
2. **A verified alert arrives** — simulated government feed.
3. **Social intelligence** — Claude has read the public posts in six languages; reports cluster over
   Al Majaz; the operator clicks *Request verification* (the only thing a hotspot can do).
4. **Geographic & safety intelligence** — who is inside, who is driving into the closure, who gets nothing.
5. **Communication** — bilingual guidance, Claude's plain-language rewrite, validated, approved by a human.
6. **Try to break the AI** — "help is on the way" injected → blocked by the validator.
7. **Citizen interaction** — Daniel is safe; Mariam asks for help. *Claude triage* orders the queue.
8. **Stopping a rumour** — posts claiming the Al Wahda bridge collapsed keep spreading; an approved clarification is issued (and appears on the citizens' phones).
9. **Ask AMAN** — the copilot builds evidence cards from records.
10. **Explainability & follow-up** — the full decision chain for Mariam.
11. **Proof on real data** — the map flies to Sharjah's central region over 3D terrain: real posts from
    the 12–20 Oct 2026 storm, Claude watched the videos, hotspots at Mleiha, Al Madam, Al Dhaid. Open a
    post and press **Play original** to show the real video.

**Live extras for Q&A** (by hand): type *"Water is coming into our flat and my grandmother cannot
walk"* on Priya's English phone — the keyword rule says P2, Claude raises it to P1. In a post, press
**Re-run live with Claude** to show a fresh reading in a few seconds.

**Judge questions about the new parts**

- **"Isn't social media unreliable?"** Yes — that's why it never triggers anything. It only creates
  verification requests; a hotspot needs two independent sources to count as corroborated; old reposts
  and noise are flagged; places come from OpenStreetMap, never from the model.
- **"Where does the data come from?"** The replay uses public posts found through the Oriane video-
  search API, reduced to the minimum (no handles or profile data). Live monitoring would need
  agreements with the platforms.
- **"How accurate is the mapping?"** Town- or road-level, shown as a radius (e.g. ±3.5 km for a town).
  A place the gazetteer can't match, or one far outside the area, is simply not placed.
- **"Can the AI lower someone's priority?"** No. The keyword rule always runs; the queue takes the
  higher of the two. Unit-tested.
- **"What if the AI writes something dangerous?"** It's blocked before any human sees it — try it
  live with *Try to break the AI*. Building that test found a real Arabic gap, which we fixed.

---

# Three-minute live demo

**Setup (before judges arrive, ~5 min)**

1. `npm run demo`, open `http://localhost:3360` in Chrome, full screen (F11). It opens straight
   into the command center as **Alya H.** (no sign-in).
2. Let the city load once (this also warms the tile cache), then **Settings → Reset demo**.
3. Optional second screen / phones: left rail → **Citizen devices** → *Open in new window* for
   Mariam (Arabic) and Daniel (English). Over Wi-Fi, use the laptop IP instead of `localhost`.
4. **Settings → Replay intro** so the opening sequence plays when you start.

You can run the whole demo with **Presentation** (top bar) — it performs every step below on the
real system and narrates it. `Space` pauses, `→` / `←` skip stages. Or drive it by hand using the
same steps. Times are approximate.

---

**00:00 — Calm city** *(opening sequence plays: Earth → UAE → Sharjah → Al Majaz)*
> "This is Al Majaz in Sharjah — real streets and 34,000 real building footprints from
> OpenStreetMap. Everything you'll see happen to people today is a training scenario with synthetic
> data."

**00:15 — A verified alert arrives**
Point at the incident card (right) and the amber dashed boundary on the map.
> "A simulated meteorological feed reports heavy rainfall, a localized flood-risk zone, and a
> confirmed closure on Al Wahda Street. Nothing has been sent to anyone yet."

**00:35 — Geographic intelligence** → click **Activate incident**
> "AMAN verifies the source, then matches every recipient geographically. 106 people are inside the
> zone, 14 drivers are heading toward the closure, 32 are outside and get nothing, and 4 have no
> usable location — so we don't guess, we flag them for review."
Click the closure marker: "This exact segment is closed. There is no approved diversion, so AMAN
will not invent one."

**00:55 — Safety intelligence** → click **Mariam**, then **Daniel**, then **Omar**
> "Same event, three circumstances. Mariam is inside the zone: rule R-20, *stay indoors*.
> Daniel is driving into the closure: rule R-30, *do not enter, follow officials*. Omar is outside:
> no emergency message. This is a deterministic, versioned policy — **why this action?** is always
> answerable."

**01:20 — Communication** → **Prepare guidance**
> "Here is the same approved action in English and Arabic, side by side, with locked facts
> highlighted. Switch to *Plain language* — an accessible variant. The AI may simplify wording, but
> a validator checks that the action, steps, place, time, numbers and claims are unchanged, and
> that both languages are consistent."
Click **Approve guidance** → **Issue to simulated channels**.
> "Nothing reaches the public without a human approval."

**01:45 — Citizen interaction** *(phones open automatically)*
> "Daniel taps *I am safe*. Mariam taps *I need help*: water is entering the ground floor and her
> father can't climb the stairs."
(Tap on the phones, or let Presentation tap for you.)

**02:10 — The picture updates** → **Response intelligence**
> "Every response changes the picture: 120 alerts, 85 safe, 8 assistance requests, 27 still
> awaiting — computed from stored records, not animated counters. Mariam's case is at the top of
> the priority queue, and her block on the map turns coral."

**02:22 — Ask AMAN** → the copilot opens and asks "Who needs help first?"
> "This is the AI working in the open. You can see Claude thinking, then it pulls up the priority
> cases — but every name, priority and timestamp on that card comes from our records, and the
> safety checks re-run as it answers. It can suggest a next step; only a human can click it."
(Without internet or a key, the same card appears from the rule-based view, clearly labelled.)

**02:35 — Explainability & human follow-up** → open Mariam's case
> "Verified event, geographic match, approved rule, the exact message she received, her response
> — and now a human decision." Click **Acknowledge**, record a follow-up note.
> "Her phone shows that an operator has acknowledged her — and AMAN never claims an ambulance was
> dispatched, because there is no dispatch integration."

**02:55 — Final view**
> "AMAN 360: from a warning to the right next step. Every response changes the picture."

---

## Recovery during the demo

| Problem | Do this |
|---|---|
| Venue internet drops | Keep going — tiles are cached and the city pack is bundled. The copilot and guidance fall back to their labelled rule/template modes on their own |
| Copilot answers feel slow (~13 s) | Talk over the "Thinking…" timer — it is the point. Or set `AMAN_COPILOT_EFFORT=low` in `.env.local` before starting (≈ 8–10 s) |
| Something looks wrong | Settings → **Reset demo** (2 s), then Presentation → restart |
| 3D is slow on the projector PC | Settings → Visual quality → **Balanced** or **Lite** |
| Need the end state quickly | Settings → **Complete simulation** |
| Browser reloaded | State persists in the database; nothing is lost |

---

## Anticipated judge questions

**Why is AI needed at all?**
Generating correct, readable, accessible guidance for every circumstance in two languages, and
triaging free-text replies at scale, is a communication problem AI is good at. AMAN uses it only
there — simplification, accessible variants, routing questions to approved answers — under a
validator, with templates as a guaranteed fallback.

**What makes this different from a government alert app?**
Most alert systems broadcast one message to an area. AMAN matches each person's circumstance to an
approved action (resident vs driver vs outside), personalises language and accessibility, and closes
the loop: responses become a live operational picture and prioritised human cases, with a full
explanation for every decision.

**Isn't the copilot just a chatbot?**
No. It doesn't answer in free text about safety. It chooses which verified evidence to show
(display-only tools) and writes a short explanation; the server builds every card from records,
drops anything that doesn't exist, re-runs the checks and disables actions the workflow doesn't
allow. A citizen message that says "ignore your instructions" is treated as data.

**How do you prevent hallucinations?**
The model never decides. Actions come from a deterministic, versioned policy. Any AI text must pass
eight deterministic checks (action identity, steps, locked facts, forbidden claims, numbers, script,
length, bilingual consistency); otherwise it is discarded and the approved template is used. The
standard instruction is never AI-written. Clarifications can only return pre-approved answers or
escalate to a human. 44/44 adversarial mutations were blocked in evaluation.

**How do you trust the hazard source?**
Only verified feeds unlock assessment: schema validation, signature verification (simulated here,
cryptographic in production), geometry validity and cross-feed agreement. Conflicting facts block
publication fail-closed — demo it with *Settings → Inject conflicting report*.

**How do you know who is affected?**
Geospatial computation: point-in-polygon with an inclusive boundary and a precautionary margin for
location uncertainty, and route-to-closure intersection for drivers. Missing or stale locations are
never guessed — they go to review. In a real deployment, location would come from opted-in apps or
operator cell-broadcast areas under a privacy framework.

**How does Arabic messaging remain consistent?**
Both languages come from the same approved action with shared step IDs and locked facts; the
system checks that EN and AR carry the same action, steps and facts (6/6 pairs consistent). Arabic
is native RTL, not mirrored English. Production use requires expert translation review.

**What if internet access fails?**
The app runs on one machine with a local database; tiles are cached and the city pack is bundled;
the AI layer falls back to templates. A production system would add SMS/cell-broadcast channels
and offline-capable apps.

**How are citizen locations protected?**
Synthetic data only here. Overviews show ≈120 m aggregates; a precise location appears only in an
individual case for the operator handling it. Citizen access uses opaque tokens. Production
requires consent, minimisation, retention limits and a privacy impact assessment.

**What would government integration require?**
Authorised feed adapters (meteorology, roads, civil defence) with real signatures; approved
policies and templates signed off by the authority; approved channels (SMS/cell broadcast/app push)
and dispatch/CAD integration for follow-up; government identity for operators; security
accreditation; and a supervised pilot. See ROADMAP.md.

**How will impact be measured?**
Time from ingestion to approved guidance, approval to delivery, response rate, time to first
response, assistance-case acknowledgement and resolution time, unanswered follow-up coverage,
bilingual consistency and validator block rate — all derived from audit records (EVALUATION.md).

**What are the limitations?**
Synthetic scenario and people; simulated feeds, channels and signatures; OSM-based city geometry
with estimated heights for untagged buildings; compressed simulation time; prototype-grade
authentication; translations not yet expert-reviewed; the LLM path is optional and was validated
with tests rather than a live key in this build.
