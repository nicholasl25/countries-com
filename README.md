# Countries.COM

**Countries.COM** (Countries. Center of Mass) is a map game: you see a territory, click where you think the population-weighted center of mass is, and get scored on how close you land.

Territories are real borders from [`us-atlas`](https://github.com/topojson/us-atlas) (US states) and [`world-atlas`](https://github.com/topojson/world-atlas) (countries). Answers are precomputed from the [GHS-POP](https://human-settlement.emergency.copernicus.eu/ghs_pop2023.php) 2025 population grid (~1 km, European Commission JRC, CC BY 4.0).

## Run locally

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:4317](http://127.0.0.1:4317). `npm run dev` starts both the Vite frontend (port 4317) and the API server (port 8787); Vite proxies `/api` to the API.

The precomputed answers are committed in `server/data/answers.json`, so you don't need the population data to play.

### Scripts

| Command             | What it does |
| ------------------- | ------------ |
| `npm run dev`       | Frontend + API with reload |
| `npm run dev:web`   | Frontend only |
| `npm run dev:api`   | API only |
| `npm run start:api` | API without file watching |
| `npm run data:fetch`| Download + unzip the GHS-POP raster into `data/raw/` (~480 MB zip, gitignored) |
| `npm run data:com`  | Recompute `server/data/answers.json` from the raster (~20 s) |
| `npm run build`     | Typecheck + production build of the frontend |

## How it fits together

```
src/            frontend (never sees population data or answers up front)
  api/types.ts  the API contract shared with the server
  api/http.ts   fetch client
  geo.ts        lat/lon <-> SVG projection for one territory
server/
  territories.ts  playable territories + their borders
  compute-com.ts  offline: raster -> data/answers.json
  index.ts        HTTP API
```

API (all lat/lon; errors return `{ "error": "message" }`):

- `GET  /api/territory` → `{ id, name, region, shape }`, where `shape` is a GeoJSON Polygon/MultiPolygon feature (no answer included)
- `POST /api/guess` with `{ territoryId, guess: { lat, lon } }` → `{ trueCom: { lat, lon }, distanceKm, score }`

Set `VITE_API_URL` (see `.env.example`) to point the frontend at a server other than `/api`.

### How the center of mass is computed

Every ~1 km grid cell inside the territory's outline contributes its population as a point mass at the cell center. The CoM is the population-weighted mean of those points as 3D unit vectors, projected back onto the Earth's surface. To add a territory, add it to `TERRITORIES` in `server/territories.ts` and rerun `npm run data:com`.

## Stack

Vite · React · TypeScript · plain CSS. SVG map drawn with `d3-geo`. API is a plain Node HTTP server run with `tsx` — no framework, auth, or database.
