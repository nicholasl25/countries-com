import type { Feature, MultiPolygon, Polygon } from 'geojson'

/**
 * The contract between the frontend and the backend.
 *
 * Everything the UI needs from a server is described here. The backend should
 * implement these shapes (see `http.ts` for the routes); until then `mock.ts`
 * implements them in the browser.
 *
 * All locations are geographic (lat/lon). Projecting onto the screen is purely
 * a frontend concern, and computing the answer is purely a backend concern —
 * the true center of mass only comes back from `submitGuess`.
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

export type GuessResult = {
  /** The true population-weighted center of mass */
  trueCom: LatLon
  /** Great-circle distance between the guess and the true CoM */
  distanceKm: number
  /** 0–1000 */
  score: number
}

export interface GameApi {
  /** Fetch a territory to play. */
  getTerritory(): Promise<Territory>
  /** Submit a guess for a territory and get the scored result. */
  submitGuess(territoryId: string, guess: LatLon): Promise<GuessResult>
}

export class ApiError extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}
