# Build log

A concise record of what was built, tested and verified — kept so work can resume at any point.

## Environment audit (2026-10-21)

- Repository `bilal-feroz/AMAN360` was empty; local machine: Windows 11, Node 22.16, npm 11,
  RTX 3050 Laptop GPU (WebGL2 via ANGLE/D3D11 confirmed in headless Chromium).
- No AMAN slide deck or challenge PDF found locally → requirements taken from the build brief.
- No map or AI API keys configured → keyless renderer and data sources chosen; LLM layer optional.
- Provider checks: OpenFreeMap (free, no key, offline caching ≤3,000 tiles allowed), EOxCloudless
  (CC BY-NC-SA for non-commercial/education), Esri imagery (terms unclear for non-Esri use → not
  used), Google 3D Tiles / Cesium ion (keys + billing → not enabled without approval).

## Milestones

1. **Scaffold + data** — Next.js 16 / TS project; Overpass extraction of the Al Majaz focus area
   (6,015 buildings, 2,619 roads) with height provenance.
2. **Domain & backend** — types, versioned policy `POLICY-2026-01`, approved EN/AR actions
   (standard / plain / audio), Turf.js geo engine, deterministic safety engine + fail-closed gate,
   validator, classifiers, optional Anthropic provider (structured outputs, server-side fallback,
   template fallback), SQLite schema, audit/change bus, workflow, simulator, citizen loop, cases,
   derived metrics with time travel, explain chain, auth (HMAC sessions, roles), rate limits, SSE.
   Scenario geometry derived from real carriageway centrelines; synthetic population (156) placed on
   real footprints and verified by the engine to give exactly 120 alerts (106 + 14), 32 outside,
   4 review.
3. **Unit tests** — 78 → 83 passing (spatial, safety, messaging, workflow, citizen responses, LLM
   pipeline with fake provider).
4. **3D city & UI** — MapLibre 5 globe→mercator intro with keyframed camera; Three.js custom layer
   (34,331 central-Sharjah buildings, facade shader, sun shadows, water, hazard volume, population
   columns, ripples); allow-listed tile cache; command center (queue, impact, three cases, guidance
   approval, response intelligence, cases, explainability, audit, timeline); citizen app; methodology
   page; presentation mode.
5. **Visual review pass 1** — fixed collapsed map canvas (MapLibre CSS overriding positioning),
   grey/noisy buildings (palette, anti-aliased distance-resolved facades), invisible shadows
   (lighting), bollard-like columns (light-beam shader), clipped attribution (always-visible
   attribution), cluttered calm state (personas hidden until assessment).
6. **E2E test** — full demo loop across separate browser contexts; found and fixed: marker clicks
   bubbling to the zone layer and overriding camera flights; skip-intro race in the test.
7. **Visual review pass 2** — camera reframing on navigation, close-range column fade, closure card
   lifecycle, RTL bidi isolation of Latin names, intro caption contrast, driver alerts naming the
   closure, mini-map framing, language-consistent synthetic names, time-aware case badge.
8. **Presentation Mode e2e** — runs the guided demo in real time; fixed lost device taps (queued
   until the alert loads, acknowledged back to the presenter), presenter bar overlapping phones,
   city-scale marker clutter; fixed a dev reload loop caused by an explicit `turbopack.root`.
9. **Production verification** — `npm run build` clean (tracing hints added); e2e against the
   production server found a rate-limit/refresh storm on citizen devices during bulk responses →
   debounced reloads, per-token limits, immediate confirmation from the submit result.
10. **Evaluation & docs** — `npm run evaluate` measured results; README, ARCHITECTURE, SAFETY_MODEL,
    DEMO_SCRIPT (with judge Q&A), EVALUATION, ROADMAP, DEPLOYMENT.

11. **Visual review pass 3** — production Earth shot; globe-scale annotation declutter (MapLibre
    inline opacity), ocean-toned polar background, 1366×768 layout, scenario presets (baseline,
    fail-closed drill, responses-complete checkpoint), before/after response comparison, cluster
    click-to-focus; curated screenshots in `docs/screenshots/`.

12. **Ask AMAN — generative-UI copilot** — streamed Claude with adaptive thinking and six strict,
    display-only tools; server-side resolver builds record-backed cards, re-runs safety checks and
    gates suggested actions; labelled rule-based fallback; Presentation Mode stage; prompt-injection
    fencing of citizen text. Found and fixed during review: auto-scroll stopping short while cards
    grow, timeline labels colliding when the panel narrows the map, and a map projection call
    throwing during hot reload ("Style is not done loading").

13. **Live Claude run** — key verified (models endpoint), then guidance rewrites and the copilot
    exercised against Claude Opus 5.5. Found and fixed: sequential rewrites took 43 s (now
    concurrent, 9.8 s); plain variants blocked for over-long steps (limits now stated in the prompt,
    8/8 pass; validator message names the step); copilot quoted UTC times (snapshot now in GST),
    answers ran long, gender inferred from a name; bidi glitches for Latin names and ids inside
    Arabic. Prompt-injection probe passed (see EVALUATION.md).

14. **AI signal intelligence (2026-10-31)** — social intelligence (synthetic scenario posts in seven
    languages + a real-world replay), AI triage of help requests, a live red-team stress test, an
    always-visible AI status, copilot signals card, four new Presentation stages.
    - Real data: 9 Oriane video-search queries (cached; 88 unique public posts, 10–25 Oct 2026,
      Emirate of Sharjah). Claude Opus 5.5 read all posts (text stage) and looked at up to three
      frames of each of the 49 kept videos (vision stage); ≈ $2.74 to build, recorded so the demo
      costs nothing. Frames stored at ≤ 3 per post; no handles or profile data stored.
    - OSM gazetteer (Overpass + one Nominatim lookup): 1,636 places, 234 named roads.
    - 3D replay: EOxCloudless imagery over Terrarium raster-DEM terrain with hillshade; city layer
      hidden during the replay; imagery/terrain tiles go through the allow-listed cache and are
      prefetched.
    - Found and fixed during the build: an Arabic diacritics range that stripped Arabic letters from
      place names; a road anchored on a same-named street 60 km away (Al Wahda Street, Kalba); a
      mountain peak preferred over the town of Mleiha; a replay camera that applied padding twice;
      `scrollIntoView` scrolling the full-screen shell during Presentation Mode; and — via the new
      red-team suite — Arabic first-aid advice not caught by the validator.

15. **Reaching everyone (2026-10-31)** — multilingual real data, two-way SMS, mesh relay drill and a
    citizen-flow audit, on top of the operator-first UI.
    - Real data: 3 more Oriane searches in community languages (12 in total); 116 unique posts; the
      language of each post is now taken from its script (platform tags called English captions
      "su" or "af" and Malayalam speech "ta").
    - Two-way SMS: approved short templates in 7 languages, deterministic reply parser, a basic-phone
      screen (`/sms/<token>`), SMS persona Ramesh K. (only his name changed in the generated
      population), SMS preview in the Message step, *by SMS* on cases.
    - Mesh relay drill: six proposed relays and one gateway cover all 107 in-zone residents within
      260 m; outage switch in Responses; amber relay layer on the map; mesh banner on phones.
    - Found and fixed: silent failure of *I need help*; no way to add details after asking for help;
      triage never re-reading late details; escalation-topic questions still sent to the model; the
      no-AI keyword fallback only knowing English and Arabic; triage log showing code words.

## Verified (executed, not assumed)

| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm test` | 264 / 264 passed (incl. 132 red-team cases, gazetteer/hotspot/rumour logic, triage rule, SMS parser and mesh routing) |
| `npm run build` | succeeds |
| `npm run test:e2e` against production build | 2 / 2 passed, also with live Claude enabled (demo loop 1.5 min, presentation 3.5 min) |
| `npm run evaluate` | results recorded in EVALUATION.md |
| Console errors during e2e | none |
| Cross-session real-time update | operator view updates without reload when a phone responds |
| Scenario presets via API | conflict drill → gate blocked; checkpoint → 120/84/7/29; baseline → draft |
| Security spot checks | invalid citizen token rejected; unauthenticated ops API 401; non-allow-listed tile path 404 |

## Not verified / known limitations

- The live model was exercised on a handful of runs only (see EVALUATION.md); quality across many
  runs and expert rating of the Arabic simplifications are not done.
- Weak/older GPUs were not tested on hardware; quality presets exist for them.
- Translations are self-authored and need expert review.
