/**
 * Game API. Implements the contract in `src/api/types.ts`:
 *
 *   GET  /api/territory -> Territory
 *   POST /api/guess     -> GuessResult   body: { territoryId, guess: { lat, lon } }
 *
 * The answers come from `server/data/answers.json` (see `compute-com.ts`) and
 * only ever leave the server as part of a guess result.
 */
import { readFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { geoArea, geoDistance } from 'd3-geo'
import type { GuessResult, LatLon, Territory } from '../src/api/types.ts'
import { getShape, TERRITORIES, type Answer } from './territories.ts'

const PORT = Number(process.env.PORT ?? 8787)
const EARTH_RADIUS_KM = 6371

const { answers } = JSON.parse(
  readFileSync(new URL('./data/answers.json', import.meta.url), 'utf8'),
) as { answers: Record<string, Answer> }

const playable = TERRITORIES.filter((t) => answers[t.id])

/** 0–1000. Distance is judged relative to the territory's size. */
function score(distanceKm: number, territoryId: string): number {
  const t = playable.find((p) => p.id === territoryId)!
  const sizeKm = Math.sqrt(geoArea(getShape(t))) * EARTH_RADIUS_KM
  return Math.max(0, Math.round(1000 * Math.exp(-distanceKm / (0.18 * sizeKm))))
}

function randomTerritory(): Territory {
  const t = playable[Math.floor(Math.random() * playable.length)]
  return { id: t.id, name: t.name, region: t.region, shape: getShape(t) }
}

function guessResult(territoryId: string, guess: LatLon): GuessResult | null {
  const answer = answers[territoryId]
  if (!answer) return null
  const trueCom = { lat: answer.lat, lon: answer.lon }
  const distanceKm =
    geoDistance([guess.lon, guess.lat], [trueCom.lon, trueCom.lat]) * EARTH_RADIUS_KM
  return { trueCom, distanceKm, score: score(distanceKm, territoryId) }
}

function isLatLon(v: unknown): v is LatLon {
  const p = v as LatLon | null
  return (
    typeof p?.lat === 'number' &&
    typeof p.lon === 'number' &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lon) <= 180
  )
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let body = ''
  for await (const chunk of req) body += chunk
  return JSON.parse(body)
}

function send(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/api/territory') {
      return send(res, 200, randomTerritory())
    }

    if (req.method === 'POST' && req.url === '/api/guess') {
      const body = (await readJson(req)) as { territoryId?: unknown; guess?: unknown }
      if (typeof body.territoryId !== 'string' || !isLatLon(body.guess)) {
        return send(res, 400, { error: 'Expected { territoryId, guess: { lat, lon } }.' })
      }
      const result = guessResult(body.territoryId, body.guess)
      if (!result) return send(res, 404, { error: `Unknown territory "${body.territoryId}".` })
      return send(res, 200, result)
    }

    send(res, 404, { error: 'Not found.' })
  } catch (err) {
    console.error(err)
    send(res, 500, { error: 'Something went wrong.' })
  }
})

server.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT} (${playable.length} territories)`)
})
