# Focus-area geography — Al Majaz / Khalid Lagoon, Sharjah

Extracted with `npm run data:osm` (see `scripts/fetch-osm.mjs`).

- **Source:** OpenStreetMap via the Overpass API
- **Attribution:** © OpenStreetMap contributors
- **License:** Open Database License (ODbL) 1.0 — https://opendatacommons.org/licenses/odbl/
  These derived files are made available under the same license.

## Building heights

`h` is metres above ground. `src` records where each value came from:

| `src`            | meaning                                                          |
|------------------|------------------------------------------------------------------|
| `height`         | OSM `height` tag                                                 |
| `levels`         | OSM `building:levels` × 3.4 m + 1.2 m                            |
| `class-estimate` | No height data in OSM; conservative estimate by building class   |

Buildings with `est: 1` are approximations. AMAN 360 discloses this in the Data Sources panel and
never presents the city model as photogrammetry.
