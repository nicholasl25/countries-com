# Countries.COM

**Countries.COM** (Countries. Center of Mass) is a map game: you see a territory, click where you think the population-weighted center of mass is, and get scored on how close you land.

This repo currently ships a **frontend shell** backed by an in-browser mock API — one fixed territory (Colorado), a fixed true COM, and click-to-guess scoring. No live GIS or population pipelines yet.

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
| `mock.ts`  | In-browser implementation (holds the answer and scoring) |
| `http.ts`  | `fetch` implementation for a real server |
| `index.ts` | Picks one — exports `api` |

Set `VITE_API_URL` (see `.env.example`) to use a real server; leave it unset for the mock. The server needs to provide:

- `GET  {VITE_API_URL}/territory` → `Territory` (no answer included)
- `POST {VITE_API_URL}/guess` with `{ territoryId, guess: {x, y} }` → `GuessResult` (`trueCom`, `distanceKm`, `score`)

Errors can return `{ "error": "message" }`. In mock mode, add `?fail=1` to the URL to see the error UI.

## Stack

Vite · React · TypeScript · plain CSS. SVG map only — no map SDK, auth, or database.
