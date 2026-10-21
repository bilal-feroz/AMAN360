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

## Verified (executed, not assumed)

| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm test` | 83 / 83 passed |
| `npm run build` | succeeds |
| `npm run test:e2e` against production build | 2 / 2 passed (demo loop 1.8 min, presentation 3.3 min) |
| `npm run evaluate` | results recorded in EVALUATION.md |
| Console errors during e2e | none |
| Cross-session real-time update | operator view updates without reload when a phone responds |
| Scenario presets via API | conflict drill → gate blocked; checkpoint → 120/84/7/29; baseline → draft |
| Security spot checks | invalid citizen token rejected; unauthenticated ops API 401; non-allow-listed tile path 404 |

## Not verified / known limitations

- The LLM provider was not called against the live Anthropic API (no key available); its
  integration is covered by tests with a fake provider and the validator.
- Weak/older GPUs were not tested on hardware; quality presets exist for them.
- Translations are self-authored and need expert review.
