import { geoArea, geoCentroid, geoDistance } from 'd3-geo'
import { feature } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import {
  ApiError,
  type GameApi,
  type GuessResult,
  type LatLon,
  type Territory,
  type TerritoryShape,
} from './types'

/**
 * In-browser stand-in for the backend. Everything here — border data, the
 * answer, scoring — belongs on the server; delete this file (and flip the switch
 * in `index.ts`) once the real API exists. Nothing outside `src/api` uses it.
 */

const LATENCY_MS = 400
const EARTH_RADIUS_KM = 6371

type Source = 'states' | 'countries'

const POOL: { id: string; name: string; region: string; source: Source }[] = [
  { id: 'us-colorado', name: 'Colorado', region: 'United States', source: 'states' },
  { id: 'us-texas', name: 'Texas', region: 'United States', source: 'states' },
  { id: 'us-california', name: 'California', region: 'United States', source: 'states' },
  { id: 'poland', name: 'Poland', region: 'Europe', source: 'countries' },
  { id: 'germany', name: 'Germany', region: 'Europe', source: 'countries' },
  { id: 'egypt', name: 'Egypt', region: 'Africa', source: 'countries' },
  { id: 'brazil', name: 'Brazil', region: 'South America', source: 'countries' },
  { id: 'india', name: 'India', region: 'Asia', source: 'countries' },
]

async function loadTopology(source: Source): Promise<Topology> {
  const mod =
    source === 'states'
      ? await import('us-atlas/states-10m.json')
      : await import('world-atlas/countries-50m.json')
  return mod.default
}

const shapes = new Map<string, TerritoryShape>()

async function loadShape(entry: (typeof POOL)[number]): Promise<TerritoryShape> {
  const cached = shapes.get(entry.id)
  if (cached) return cached

  const topology = await loadTopology(entry.source)
  const collection = topology.objects[entry.source] as GeometryCollection<{ name?: string }>
  const geometry = collection.geometries.find(
    (g) => (g.properties as { name?: string } | undefined)?.name === entry.name,
  )
  if (!geometry) throw new ApiError(`No border data for "${entry.name}".`, 404)

  const shape = feature(topology, geometry) as TerritoryShape
  shapes.set(entry.id, shape)
  return shape
}

/**
 * The "answer". Placeholder: the geographic centroid. Replace with a
 * population-weighted center once population data exists.
 */
function computeTrueCom(shape: TerritoryShape): LatLon {
  const [lon, lat] = geoCentroid(shape)
  return { lat, lon }
}

/** 0–1000. Distance is judged relative to the territory's size. */
function computeScore(distanceKm: number, shape: TerritoryShape): number {
  const sizeKm = Math.sqrt(geoArea(shape)) * EARTH_RADIUS_KM
  return Math.max(0, Math.round(1000 * Math.exp(-distanceKm / (0.18 * sizeKm))))
}

function wait(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, LATENCY_MS))
}

/** Append `?fail=1` to the URL to exercise the error UI. */
function shouldFail(): boolean {
  return new URLSearchParams(window.location.search).has('fail')
}

let lastId: string | null = null

export const mockApi: GameApi = {
  async getTerritory(): Promise<Territory> {
    await wait()
    if (shouldFail()) throw new ApiError('Could not load a territory.')

    const options = POOL.filter((t) => t.id !== lastId)
    const entry = options[Math.floor(Math.random() * options.length)]
    lastId = entry.id
    return { id: entry.id, name: entry.name, region: entry.region, shape: await loadShape(entry) }
  },

  async submitGuess(territoryId, guess): Promise<GuessResult> {
    await wait()
    const entry = POOL.find((t) => t.id === territoryId)
    if (!entry) throw new ApiError(`Unknown territory "${territoryId}".`, 404)

    const shape = await loadShape(entry)
    const trueCom = computeTrueCom(shape)
    const distanceKm =
      geoDistance([guess.lon, guess.lat], [trueCom.lon, trueCom.lat]) * EARTH_RADIUS_KM
    return { trueCom, distanceKm, score: computeScore(distanceKm, shape) }
  },
}
