# Three-minute live demo

**Setup (before judges arrive, ~5 min)**

1. `npm run demo`, open `http://localhost:3360` in Chrome, full screen (F11), sign in as **Alya H.**
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
| Venue internet drops | Keep going — tiles are cached and the city pack is bundled |
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
