/**
 * The contract between the frontend and the backend.
 *
 * Everything the UI needs from a server is described here. The backend should
 * implement these shapes (see `http.ts` for the routes); until then `mock.ts`
 * implements them in the browser.
 *
 * Note the true center of mass is NOT part of `Territory` — it only comes back
 * from `submitGuess`, so the answer is never shipped to the client up front.
 */

/** A point in the territory's `viewBox` coordinate space. */
export type Point = { x: number; y: number }

export type Territory = {
  id: string
  name: string
  region: string
  /** SVG viewBox, e.g. "0 0 480 360" */
  viewBox: string
  /** Closed SVG path in viewBox units */
  path: string
}

export type GuessResult = {
  /** The true population-weighted center of mass, in viewBox units */
  trueCom: Point
  /** Distance between the guess and the true CoM */
  distanceKm: number
  /** 0–1000, computed by the backend */
  score: number
}

export interface GameApi {
  /** Fetch the territory to play. */
  getTerritory(): Promise<Territory>
  /** Submit a guess for a territory and get the scored result. */
  submitGuess(territoryId: string, guess: Point): Promise<GuessResult>
}

export class ApiError extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}
