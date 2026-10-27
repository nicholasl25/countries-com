# Countries.COM

**Countries.COM** (Countries. Center of Mass) is a map game: you see a territory, click where you think the population-weighted center of mass is, and get scored on how close you land.

This repo currently ships a **frontend shell** with mock data — one fixed territory (Colorado), a fixed true COM, and click-to-guess scoring. No live GIS or population pipelines yet.

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

## Stack

Vite · React · TypeScript · plain CSS. SVG map only — no map SDK, auth, or database.
