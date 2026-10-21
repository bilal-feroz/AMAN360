# Roadmap

AMAN 360 is a **prototype**. Nothing below beyond Stage 1 has been carried out; the later stages
describe what a responsible path to real use would require.

## Stage 1 — Prototype *(this repository)*

- Synthetic hazard scenario (heavy rainfall, flood-risk zone, road closure) in one real geographic
  area (Al Majaz, Sharjah) with simulated, clearly labelled feeds.
- Deterministic, versioned safety policy; fail-closed publication gate; full decision traces.
- Real geospatial matching over 156 synthetic recipients on real OSM geometry.
- Bilingual (Arabic/English) approved guidance with plain-language and audio variants; bounded,
  validated, optional LLM layer with template fallback.
- Operator approval, simulated delivery channels, functioning two-way response loop, assistance
  cases, review items, audit trail, explainability, live operational metrics.
- 3D digital-twin command center, mobile citizen app, Presentation Mode, automated tests.

**Exit criteria:** demo loop works offline and across devices; tests pass; limitations documented.

## Stage 2 — Validation *(3–6 months, with academic and authority partners)*

- **Safety rules:** emergency-management experts review and rewrite policy rules and action
  templates; scenario library expanded (sandstorm, extreme heat, fog, coastal flooding, chemical
  release) with rule coverage tests.
- **Language fidelity:** qualified translators and emergency-terminology experts review all Arabic
  and English wording; add priority community languages (e.g. Urdu, Hindi, Tagalog, Bengali)
  through the same approved-template process.
- **Accessibility:** testing with screen-reader users, people with low vision, cognitive
  disabilities and limited literacy; WCAG 2.2 AA audit; sign-language video variants considered.
- **Spatial accuracy:** compare against authoritative municipal GIS (parcels, building heights,
  drainage/low-lying areas); measure boundary and route-intersection error.
- **Response handling:** independent red-team of the validator and classifiers; live-LLM
  evaluation with expert raters; usability studies with operators (tabletop exercises).

**Exit criteria:** signed-off policies and templates; measured accuracy targets met; usability
issues resolved; ethics and privacy review complete.

## Stage 3 — Authorised pilot *(only with an authority's mandate)*

- **Permissioned data adapters** to official meteorological, roads/traffic and civil-defence feeds
  with real cryptographic verification and provenance.
- **Approved channels:** SMS / cell broadcast / official app push via authorised gateways; no
  channel used without the authority's permission.
- **Oversight:** duty-officer roles from the authority's identity provider, two-person approval for
  high-severity messages, immutable audit storage, incident review boards.
- **Privacy:** privacy impact assessment, lawful basis and consent for location, data minimisation
  and retention limits, data residency in a government-approved environment.
- **Operational testing:** shadow mode alongside existing processes, drills, load testing,
  disaster-recovery and failover, accessibility and language monitoring.
- **Integration** with dispatch/CAD systems so that follow-up becomes real tasks for responders —
  until then, AMAN never implies dispatch.

**Exit criteria:** pilot evaluation against the metrics in EVALUATION.md, authority decision on
wider deployment.
