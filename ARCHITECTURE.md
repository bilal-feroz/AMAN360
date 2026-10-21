# Architecture

AMAN 360 is a single Next.js application (UI + API route handlers) backed by SQLite. It is
deliberately a modular monolith: every safety-relevant step is a plain, testable TypeScript
function, and there is no distributed infrastructure to fail during a live demo.

```
┌──────────────────────────── Browser ─────────────────────────────┐
│ Command center (operator)                Citizen app (mobile)     │
│  MapLibre GL + Three.js city layer        /c/<opaque token>       │
│  Panels · timeline · presentation         AR/EN · RTL · a11y · TTS │
│        │  fetch /api/ops/*   ▲ SSE           │ fetch  ▲ SSE        │
└────────┼─────────────────────┼───────────────┼────────┼────────────┘
         ▼                     │               ▼        │
┌──────────────────────── Next.js server (Node) ───────────────────┐
│ http.ts      auth (HMAC session, roles) · rate limits · errors     │
│ services/                                                          │
│   workflow   verify → assess → prepare guidance → approve → publish│
│   citizen    responses · transitions · cases · clarifications      │
│   sim        scheduled delivery/response simulator (DB-backed)     │
│   state      derived metrics, clusters, stages (time-travel)       │
│   explain    per-recipient decision chain                          │
│ domain/ (pure, no I/O)                                             │
│   geo.ts            Turf.js spatial checks                         │
│   safety-engine.ts  deterministic policy evaluation + gate         │
│   comms/            facts · validator · classifiers                │
│ comms/providers.ts  template provider | Anthropic (optional)      │
│ store.ts / db.ts    SQLite (better-sqlite3), audit log, change bus │
└───────────────────────────────────────────────────────────────────┘
```

## Data flow (one incident)

1. **Ingestion** — `resetScenario()` stores the simulated feed payload (`hazard_sources`, with a
   SHA-256 checksum), the incident (`draft`), hazard geometry and two confirmed closure segments.
2. **Verification** (`verifySource`) — schema validation (Zod), simulated signature check, geometry
   validity (closed rings, no self-intersection, finite coordinates), closure confirmation, severity
   agreement. Failure → `blocked` with reasons. Audit: `source.verified` / `source.rejected`.
3. **Assessment** (`assessImpact`) — the deterministic engine evaluates every recipient:
   - `checkIncidentGate` (fail-closed): verified source, no conflicts, incident not expired, policy
     active and in effect, valid geometry, every diversion carries an approval record.
   - `evaluateGeo`: point-in-polygon (boundary counts as inside), distance to boundary, precautionary
     inclusion within location uncertainty (25 m policy margin), route ∩ confirmed closure within the
     policy approach distance (1.5 km).
   - `decide`: one rule outcome per recipient with a full `DecisionTrace`.
   Unusable locations create `location_missing` review items. Audit: `impact.computed`,
   `policy.evaluated`.
4. **Guidance** (`prepareGuidance`) — for each matched action, all language × variant combinations
   are prepared. Standard wording is always the approved template; plain/audio variants may come from
   an LLM, but only if they pass `validateCandidate` (else the approved variant is used and the block
   is audited). Bilingual consistency is checked per pair. Messages are created as
   `awaiting_approval` (one per recipient, `UNIQUE(incident, recipient)`).
5. **Approval** (`approveGuidance`) — duty-officer role only; re-checks the gate; refuses if any
   variant failed validation. Audit: `operator.approved`.
6. **Publication** (`publish`) — only from `approved`; queues messages and schedules simulated
   delivery and the synthetic population's simulated responses in `sim_schedule` (persisted, so the
   simulation survives restarts). Audit: `messages.issued`.
7. **Responses** (`submitResponse`) — token-authenticated, rate-limited, idempotent
   (`idempotency_key`), explicit transition table. Help → `AssistanceCase` (P1/P2 by deterministic
   classification + recorded needs). Clarification → approved answer or `clarification` review item.
8. **Operator follow-up** (`updateCase`) — acknowledge → record follow-up (note required) → resolve.
   No dispatch integration exists and none is implied.

Every mutation writes an audit event and bumps a version; SSE streams notify clients, which
re-fetch derived state. If the stream drops, clients poll and reconnect automatically.

## Derived state & time travel

`state.ts` never stores counters. Metrics are computed from records (`messages`, `responses`,
`delivery_attempts`, `cases`, `audit_events`). `statusAt(message, responses, t)` replays the same
transition table as live handling, so the timeline scrubber shows the incident *as it was* at any
stage — metrics, cluster colours and zone visibility all derive from the stored timestamps.

## Geographic rendering — decision record

**Requirement:** a recognisable, real Sharjah scene that works without paid keys and offline.

| Option | Finding | Decision |
|---|---|---|
| Google Photorealistic 3D Tiles (3d-tiles-renderer) | Best realism; requires a Google Maps Platform key with billing; Sharjah coverage unverified without a key | Not enabled (no paid API without approval) — documented upgrade path |
| CesiumJS + Cesium OSM Buildings | Strong globe; OSM Buildings and default imagery need a Cesium ion token; heavy bundle | Not chosen |
| **MapLibre GL JS 5 + Three.js custom layer** | Keyless globe→mercator flights, licensed free tiles, official custom-layer API shares one WebGL context with Three.js | **Chosen** |
| MapLibre fill-extrusion only | Simple, but no shadows/facades; `within` cannot filter polygons to avoid duplicates | Rejected for buildings |

The city layer (`src/components/map/city-layer.ts`) renders in a local east/north/up frame (metres)
around Al Majaz, transformed by MapLibre's `mainMatrix`:

- **Buildings:** 34,331 OSM footprints for central Sharjah (`public/data/city/buildings.json`,
  decimetre-quantised), extruded and merged into one geometry in frame-sliced chunks; facade shader
  (anti-aliased floor/bay rhythm that resolves to an average tone with distance), contact
  darkening, distance haze, zone tint; real-time directional-light shadows following the view.
- **Water:** triangulated OpenMapTiles water polygons with a fresnel/glint shader.
- **Hazard volume:** translucent walls along the verified boundary that rise on activation.
- **Population:** instanced light-beam columns per ≈120 m cell (aggregated — no individual points),
  coloured by live response status, fading at close range.
- **Ripples:** a cell pulses when its messages are delivered.

Basemap: EOxCloudless Sentinel-2 imagery for the Earth/approach shots fading into a calm vector
city (OpenFreeMap). An allow-listed tile cache (`/api/tiles/...`) stores tiles on first use so the
demo survives a venue network outage; the bundled city pack keeps buildings and water available
offline. If WebGL is unavailable, a 2D SVG geographic fallback is shown instead of a blank screen.

Performance: render-on-demand (continuous frames only while animating), adaptive pixel ratio,
quality presets (Cinematic: 4096 shadow map; Balanced: no shadows, 1.5× DPR; Lite: no windows,
1× DPR, small buildings culled), tile request cancellation while zooming, GPU resource disposal.

## Persistence & PostGIS path

SQLite (WAL) in `.data/aman360.db`; geometry is stored as GeoJSON and processed with Turf.js. For
production: move to PostgreSQL + PostGIS — `geometry(Polygon,4326)` for zones, `geography(Point)`
for recipients with GiST indexes, `ST_Covers`/`ST_DWithin`/`ST_Intersects` replacing the Turf
calls in `geo.ts` (same semantics, boundary inclusive), and LISTEN/NOTIFY or a queue replacing the
in-process bus. The domain layer is I/O-free, so this swap does not touch the safety engine.

## Security boundaries

- Operator APIs require an HMAC-signed HttpOnly session with role claims; approval/publication
  require the `duty_officer` role. Citizens use opaque per-recipient tokens (HMAC of the id with a
  per-installation secret stored in `.data/secret`, never committed).
- Zod validation on every request body; rate limits on login, inbox and responses.
- LLM credentials are server-side only (`ANTHROPIC_API_KEY`); prompts contain only approved wording.
- Tile proxy is allow-listed by exact URL pattern (no open proxy / SSRF).
- Privacy: overview layers aggregate to ≈120 m cells; precise synthetic positions appear only in an
  individual case or "Why this action?" view.
