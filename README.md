# Countries.COM

**Countries.COM** (Countries. Center of Mass) is a map game: you see a territory, click where you think the population-weighted center of mass is, and get scored on how close you land.

This repo currently ships a **frontend shell** backed by an in-browser mock API. Territories are real borders from [`us-atlas`](https://github.com/topojson/us-atlas) (US states) and [`world-atlas`](https://github.com/topojson/world-atlas) (countries). The answer is a placeholder — each territory's geographic centroid — until population data exists.

## Run locally

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:4317](http://127.0.0.1:4317).

### Scripts

| Command        | What it does              |
| -------------- | ------------------------- |
| `npm run dev`  | Vite dev server (port 4317) |
| `npm run build`| Typecheck + production build |
| `npm run preview` | Preview the production build |

## Backend API

The UI only talks to the backend through `src/api`:

| File | Role |
| ---- | ---- |
| `types.ts` | The contract: `Territory`, `GuessResult`, and the `GameApi` interface |
| `mock.ts`  | In-browser stand-in for the backend: loads borders, computes the answer and score |
| `http.ts`  | `fetch` implementation for a real server |
| `index.ts` | Picks one — exports `api` |

Set `VITE_API_URL` (see `.env.example`) to use a real server; leave it unset for the mock. The server needs to provide:

- `GET  {VITE_API_URL}/territory` → `Territory`: `{ id, name, region, shape }`, where `shape` is a GeoJSON Polygon/MultiPolygon feature (no answer included)
- `POST {VITE_API_URL}/guess` with `{ territoryId, guess: { lat, lon } }` → `GuessResult`: `{ trueCom: { lat, lon }, distanceKm, score }`

Everything crossing the API is lat/lon. The frontend projects it onto the screen (`src/geo.ts`, an equal-area projection centered on the territory); the backend owns the answer and scoring.

Errors can return `{ "error": "message" }`. In mock mode, add `?fail=1` to the URL to see the error UI.

## Stack

Vite · React · TypeScript · plain CSS. SVG map drawn with `d3-geo` — no map SDK, auth, or database.
