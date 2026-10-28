# Countries.COM

**Countries.COM** (Countries. Center of Mass) is a map game: you see a territory, click where you think the population-weighted center of mass is, and get scored on how close you land.

There are 284 playable territories: all 50 US states plus 234 countries and territories. Borders come from [us-atlas](https://github.com/topojson/us-atlas) (US states) and [world-atlas](https://github.com/topojson/world-atlas) (countries, 1:50m). Answers are precomputed from the [GHS-POP](https://human-settlement.emergency.copernicus.eu/ghs_pop2023.php) 2025 population grid (~1 km, European Commission JRC, CC BY 4.0).

## Run locally

```bash
npm install
npm run setup:api   # one-time: creates backend/.venv and installs Python deps
npm run dev
```

Open [http://127.0.0.1:4317](http://127.0.0.1:4317). `npm run dev` starts both the Vite frontend (port 4317) and the Python API (FastAPI on port 8787); Vite proxies `/api` to the API. Interactive API docs are at [http://127.0.0.1:8787/docs](http://127.0.0.1:8787/docs).

The precomputed answers are committed in `backend/data/answers.json`, so you don't need the population data to play.

### Scripts

| Command             | What it does |
| ------------------- | ------------ |
| `npm run dev`       | Frontend + API with reload |
| `npm run dev:web`   | Frontend only |
| `npm run dev:api`   | API only (uvicorn with reload) |
| `npm run setup:api` | Create `backend/.venv` and install `backend/requirements.txt` |
| `npm run data:com`  | Recompute `backend/data/answers.json` (downloads the ~480 MB GHS-POP raster into `backend/data/raw/` on first run; gitignored) |
| `npm run build`     | Typecheck + production build of the frontend |

## How it fits together

```
src/            frontend (never sees population data or answers up front)
  App.tsx       header menu + page switch (hash routes, see router.ts)
  pages/        RandomGame, Catalog, CatalogTerritory
  components/   TerritoryMap (outline, heat map, guess X, CoM dot), RegionCard
  regions.ts    catalog region cards (title, category, preview bounds)
  api/types.ts  the API contract shared with the server
  api/http.ts   fetch client
  geo.ts        lat/lon <-> SVG projection for one territory
  heatmap.ts    draws a density grid in the map's projection
backend/        Python
  territories.py  playable territories + their borders (TopoJSON in data/borders/)
  data/countries.csv  which world-atlas shapes are countries: display name + continent
  compute_com.py  offline: population raster -> data/answers.json + data/density/*.json
  main.py         FastAPI app
```

API (all lat/lon; errors return `{ "error": "message" }`):

- `GET  /api/territory[?id=|?category=]` → `{ id, name, region, shape }` (random unless `id` is given; `category` limits the pick), where `shape` is a GeoJSON Polygon/MultiPolygon feature (no answer included)
- `POST /api/guess` with `{ territoryId, guess: { lat, lon } }` → `{ trueCom: { lat, lon }, distanceKm, score, density }`, where `density` is a coarse population-density grid (≤256 cells on the long side) the frontend draws as a heat map

- `GET  /api/catalog` → `{ categories, territories: [{ id, name, region, categories, mapName }] }` (`mapName` is the containing feature in `/api/world`)
- `GET  /api/catalog/{id}` → `{ territory, trueCom, population, areaKm2, density }` — the catalog intentionally shows the answer
- `GET  /api/world` → low-detail world map (GeoJSON, ~50 KB gzipped) for the catalog's region previews

Set `VITE_API_URL` (see `.env.example`) to point the frontend at a server other than `/api`.

### How the center of mass is computed

Every ~1 km grid cell inside the territory's outline contributes its population as a point mass at the cell center. The CoM is the population-weighted mean of those points as 3D unit vectors, projected back onto the Earth's surface. That point can fall outside the territory (in the sea for archipelagos like Indonesia, or in a neighbor for Palestine), so guesses are accepted anywhere on the map. Territories crossing the 180° meridian (Alaska, Russia, Fiji, …) are shifted east before reading the raster, and territories smaller than one cell use every cell they touch. Uninhabited territories (e.g. Heard Island) and Antarctica are skipped.

The same pass writes a downsampled, log-scaled density grid per territory to `data/density/` for the heat map. A full run takes under a minute and peaks around 3 GB of memory (Russia). After rerunning it, restart the API (or touch `main.py`) since density files are cached in memory.

To add or rename a country, edit `backend/data/countries.csv` (`atlas_name` must match the world-atlas shape; `continent` decides which catalog groups it appears in) and rerun `npm run data:com`. Borders come from the [us-atlas](https://github.com/topojson/us-atlas) / [world-atlas](https://github.com/topojson/world-atlas) npm packages (Natural Earth and US Census data), copied into `backend/data/borders/`.

## Stack

Vite · React · TypeScript · plain CSS. SVG map drawn with `d3-geo`. Backend: Python · FastAPI · numpy · rasterio. No auth or database.
