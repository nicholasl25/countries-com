# Countries.COM

**Countries.COM** (Countries. Center of Mass) is a map game: you see a territory, click where you think the population-weighted center of mass is, and get scored on how close you land.

Territories are real borders from [us-atlas](https://github.com/topojson/us-atlas) (US states) and [world-atlas](https://github.com/topojson/world-atlas) (countries). Answers are precomputed from the [GHS-POP](https://human-settlement.emergency.copernicus.eu/ghs_pop2023.php) 2025 population grid (~1 km, European Commission JRC, CC BY 4.0).

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
  api/types.ts  the API contract shared with the server
  api/http.ts   fetch client
  geo.ts        lat/lon <-> SVG projection for one territory
backend/        Python
  territories.py  playable territories + their borders (TopoJSON in data/borders/)
  compute_com.py  offline: population raster -> data/answers.json + data/density/*.json
  main.py         FastAPI app
```

API (all lat/lon; errors return `{ "error": "message" }`):

- `GET  /api/territory` → `{ id, name, region, shape }`, where `shape` is a GeoJSON Polygon/MultiPolygon feature (no answer included)
- `POST /api/guess` with `{ territoryId, guess: { lat, lon } }` → `{ trueCom: { lat, lon }, distanceKm, score, density }`, where `density` is a coarse population-density grid (≤256 cells on the long side) the frontend draws as a heat map

Set `VITE_API_URL` (see `.env.example`) to point the frontend at a server other than `/api`.

### How the center of mass is computed

Every ~1 km grid cell inside the territory's outline contributes its population as a point mass at the cell center. The CoM is the population-weighted mean of those points as 3D unit vectors, projected back onto the Earth's surface. The same pass writes a downsampled, log-scaled density grid per territory to `data/density/` for the heat map. After rerunning it, restart the API (or touch `main.py`) since density files are cached in memory. To add a territory, add it to `TERRITORIES` in `backend/territories.py` and rerun `npm run data:com`. Borders come from the [us-atlas](https://github.com/topojson/us-atlas) / [world-atlas](https://github.com/topojson/world-atlas) npm packages (Natural Earth and US Census data), copied into `backend/data/borders/`.

## Stack

Vite · React · TypeScript · plain CSS. SVG map drawn with `d3-geo`. Backend: Python · FastAPI · numpy · rasterio. No auth or database.
