import type { Feature, MultiPolygon, Polygon } from 'geojson'

/**
 * The contract between the frontend and the backend.
 *
 * Everything the UI needs from a server is described here. The backend should
 * implement these shapes (see `http.ts` for the routes).
 *
 * All locations are geographic (lat/lon). Projecting onto the screen is purely
 * a frontend concern, and computing the answer is purely a backend concern —
 * in the game, the true center of mass only comes back from `submitGuess`.
 */

/** A geographic location in degrees. */
export type LatLon = { lat: number; lon: number }

/** GeoJSON outline of a territory (lon/lat coordinates, RFC 7946). */
export type TerritoryShape = Feature<Polygon | MultiPolygon>

export type Territory = {
  id: string
  name: string
  region: string
  shape: TerritoryShape
}

/** Population density on a lat/lon grid (row 0 = north), for the heat map. */
export type DensityGrid = {
  west: number
  south: number
  east: number
  north: number
  width: number
  height: number
  /** Base64, one byte per cell: 0 = no people, 1–255 = log-scaled density, low to high */
  values: string
}

export type GuessResult = {
  /** The true population-weighted center of mass */
  trueCom: LatLon
  /** Great-circle distance between the guess and the true CoM */
  distanceKm: number
  /** 0–1000 */
  score: number
  density: DensityGrid
}

export type CatalogEntry = {
  id: string
  name: string
  region: string
  /** Catalog groups this territory belongs to, e.g. ["Countries", "Europe"] */
  categories: string[]
}

export type Catalog = {
  /** Category names in display order */
  categories: string[]
  /** Sorted by name */
  territories: CatalogEntry[]
}

/** Everything about one territory, answer included — for the catalog only. */
export type CatalogDetail = {
  territory: Territory
  trueCom: LatLon
  population: number
  areaKm2: number
  density: DensityGrid
}

export interface GameApi {
  /** Fetch a territory to play: the given one, or a random one. */
  getTerritory(id?: string): Promise<Territory>
  /** Submit a guess for a territory and get the scored result. */
  submitGuess(territoryId: string, guess: LatLon): Promise<GuessResult>
  /** List every territory, grouped into categories. */
  getCatalog(): Promise<Catalog>
  /** One territory with its answer and heat map. */
  getCatalogDetail(id: string): Promise<CatalogDetail>
}

export class ApiError extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}
