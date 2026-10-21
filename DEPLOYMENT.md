# Running & deploying

## Local (presentation laptop)

```bash
npm run setup
```

```bash
npm run demo
```

- Serves on `http://localhost:3360` (`next start -p 3360`). Use the production build on
  presentation day — no on-demand compilation.
- Phones on the same Wi-Fi can open citizen links using the laptop's LAN IP.
- First load fetches basemap tiles and stores them in `.data/tile-cache/`; afterwards the demo
  works without internet. Warm the cache by flying around Al Majaz once (or running the intro).
- Data lives in `.data/` (SQLite database, tile cache, per-installation secret). Delete the folder
  to start completely fresh; `npm run db:reset` restores the scenario baseline only.

### Environment variables (`.env.local`, all optional)

| Variable | Default | Purpose |
|---|---|---|
| `AMAN_OPERATOR_PASSCODE` | `aman-demo-2026` | Demo operator passcode — change for shared use |
| `AMAN_SESSION_SECRET` | per-installation secret in `.data/secret` | Signs operator sessions |
| `ANTHROPIC_API_KEY` | unset | Enables the bounded LLM layer (server-side only) |
| `AMAN_LLM_MODEL` | `claude-opus-5-5` | Model for simplification / question routing |
| `AMAN_DB_PATH` | `.data/aman360.db` | SQLite file |
| `AMAN_DATA_DIR` | `.data` | Runtime data directory |

Never commit `.env*` or `.data/`; both are git-ignored.

## Tests

```bash
npm test
```

```bash
npx playwright install chromium
```

```bash
npm run test:e2e
```

The e2e suite reuses a server already running on port 3360, or starts `npm run dev`. It uses the
GPU when available; on machines without one Chromium falls back to software WebGL (slower).

## Hosting a shared demo

AMAN needs a long-running Node.js process (SSE streams, SQLite file, simulation scheduler), so use
a VM or container rather than serverless functions:

```bash
npm ci
```

```bash
npm run build
```

```bash
npm run start
```

- Put it behind HTTPS (the session cookie becomes `Secure` automatically on https).
- Mount `.data/` on persistent storage.
- Set a strong `AMAN_OPERATOR_PASSCODE` and `AMAN_SESSION_SECRET`.
- Keep the deployment non-public or access-restricted: it is a training prototype.
- Respect tile providers' terms: OpenFreeMap allows small offline caches with a unique
  User-Agent; EOxCloudless imagery is CC BY-NC-SA (non-commercial). Commercial or government use
  needs licensed basemaps.

## What a government-approved environment would add

- Hosting in an accredited government cloud / data centre with data residency.
- Government identity provider (SSO, MFA) and role management; two-person approval.
- PostgreSQL + PostGIS with backups, replicas and point-in-time recovery; immutable audit storage.
- Message queue for channel delivery, authorised SMS / cell-broadcast / push gateways.
- Secrets in a managed vault; network segmentation; WAF; monitoring and alerting.
- Penetration testing, privacy impact assessment and security accreditation before go-live.
