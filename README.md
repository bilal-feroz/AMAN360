# AMAN 360

**From a warning to the right next step.**
*Verified inputs. Safe decisions. Human feedback.*

AMAN 360 is an AI-assisted emergency communication and response platform. It turns verified
hazard information into clear, personalised safety guidance in Arabic and English, delivers it,
collects citizen responses, and gives operators an explainable, live picture of who is safe and
who needs help.

> **Training prototype — synthetic data.** AMAN 360 is not connected to any government system,
> sends no messages to real people and is not authorised or deployed. All hazards, closures, agencies
> ("SIM-MET", "SIM-ROADS") and people in the demo are simulated and labelled as such.

Built for the **Universities Challenge 2026, Sharjah**.

---

## What it does

1. **Receives** a verified hazard feed (simulated) — heavy rainfall, a localised flood-risk zone and
   a confirmed closure on Al Wahda Street, Al Majaz, Sharjah.
2. **Determines who is affected** with real geospatial computation (Turf.js point-in-polygon,
   boundary/uncertainty handling, route-to-closure intersection) over 156 synthetic people placed on
   real OpenStreetMap building footprints and carriageways.
3. **Decides the action deterministically** with a versioned, authority-style policy
   (`POLICY-2026-01`). No language model is involved in the decision.
4. **Communicates** the approved action in Arabic and English, including plain-language and
   audio/screen-reader variants. AI may only simplify approved wording; a deterministic validator
   blocks anything that changes the action, facts, severity, routes or contacts.
5. **Requires operator approval**, then issues to simulated channels (in-app inbox, SMS simulator).
6. **Closes the loop:** citizens tap *I am safe*, *I need help* or *I need clarification* on a
   mobile-first app. Help requests become prioritised, human-reviewed cases.
7. **Explains every decision:** verified event → geographic match → approved rule →
   communication → citizen response → human follow-up.

The key boundary: **AI communicates safety decisions. AI does not invent safety decisions.**

## Quick start

Requirements: Node.js ≥ 22, npm. Windows, macOS or Linux. A GPU is recommended for the 3D scene
(any integrated GPU works; use the *Lite* quality setting on weak devices).

```bash
npm run setup
```

```bash
npm run demo
```

Open **http://localhost:3360** and sign in:

| Operator | Role | Demo passcode |
|---|---|---|
| Alya H. | Duty officer (can approve/publish) | `aman-demo-2026` |
| Sami R. | Analyst (read-only) | `aman-demo-2026` |

The passcode is a demo-only value set by `AMAN_OPERATOR_PASSCODE` (see `.env.example`). Change it
for any shared deployment.

For development with hot reload use `npm run dev` (also port 3360). `npm run demo` builds and
serves the optimised production bundle — use it on presentation day.

### Citizen devices

In the command center, open **Citizen devices** (left rail) to preview the four synthetic personas
in-place or open each one in its **own window / phone** (same Wi-Fi: replace `localhost` with the
laptop's IP). Responses on a device update the command center live over Server-Sent Events.

| Persona | Circumstance | Language |
|---|---|---|
| Mariam A. (RES-014) | Resident inside the zone, cares for an elderly father, large text | Arabic |
| Priya S. (RES-022) | Resident inside the zone, plain-language preference | English |
| Daniel R. (RES-047) | Driver approaching the confirmed closure | English |
| Omar K. (RES-131) | Resident outside the zone — receives no emergency instruction | Arabic |

### Presentation mode

Click **Presentation** in the top bar for the guided ~3-minute walkthrough. It drives the real
product (same APIs and the real citizen UI), and can be paused (Space), skipped (← →), restarted or
exited at any time. See [DEMO_SCRIPT.md](DEMO_SCRIPT.md).

### Useful commands

| Command | Purpose |
|---|---|
| `npm run setup` | Install dependencies and reset the demo database |
| `npm run demo` | Production build + server on :3360 |
| `npm run dev` | Development server on :3360 |
| `npm run db:reset` | Restore the documented baseline (also available as *Reset demo* in the UI) |
| `npm test` | Unit and integration tests (Vitest) |
| `npm run test:e2e` | End-to-end tests incl. full demo loop and Presentation Mode (Playwright) |
| `npm run evaluate` | Headless evaluation run that prints the measured results in EVALUATION.md |
| `npm run data:osm` | Re-extract focus-area OSM data (Overpass) |

Optional: set `ANTHROPIC_API_KEY` (server-side only) to enable the bounded LLM layer. Without it,
the demo uses the approved bilingual template library and deterministic classifiers, and the UI says
so ("Approved templates (deterministic)").

## Technology

- **Next.js 16 / React 19 / TypeScript**, Tailwind CSS 4, Motion, Zustand, Zod
- **MapLibre GL JS 5** (globe → city) with a **Three.js** custom layer in the same WebGL context:
  34,331 OSM buildings with a facade shader and real-time sun shadows, water shader, hazard volume,
  privacy-aggregated population columns, delivery ripples
- **Turf.js** spatial processing; **SQLite** (better-sqlite3) persistence; **SSE** real-time sync
- **Anthropic Claude** (optional, server-side, structured outputs, validated) for simplification and
  question routing only
- **Vitest** (83 tests) and **Playwright** (full demo loop + Presentation Mode)

## Data & attribution

- Buildings, roads: © OpenStreetMap contributors (ODbL). Heights from OSM `height`/`building:levels`
  where present (1,711 buildings, mostly towers); other buildings use a disclosed class-based
  estimate. The city is a geometric model, **not photogrammetry**.
- Basemap tiles: OpenFreeMap / OpenMapTiles. Earth imagery: EOxCloudless 2024 by EOX IT Services
  GmbH (contains modified Copernicus Sentinel data), CC BY-NC-SA 4.0 for non-commercial/education.
- Attribution is always visible in the map.

## Documentation

| Document | Contents |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Components, data flow, renderer decision, safety boundaries |
| [SAFETY_MODEL.md](SAFETY_MODEL.md) | Why generative AI cannot invent safety-critical instructions |
| [DEMO_SCRIPT.md](DEMO_SCRIPT.md) | Exact three-minute live demo + anticipated judge questions |
| [EVALUATION.md](EVALUATION.md) | Outcomes, test methods, measured simulation results |
| [ROADMAP.md](ROADMAP.md) | Prototype → validation → authorised pilot |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Running, deploying and hardening |
| [BUILD_LOG.md](BUILD_LOG.md) | What was implemented, tested and verified |

## Limitations (honest summary)

- Synthetic scenario and population only; no real government feeds, channels or dispatch.
- Arabic and English wording was written for this prototype and needs expert review.
- The 3D city is OSM-based geometry with estimated heights for untagged buildings.
- Simulation time is compressed (seconds instead of minutes).
- Demo authentication is a shared passcode with signed sessions, not a government identity provider.
