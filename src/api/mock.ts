import {
  ApiError,
  type GameApi,
  type GuessResult,
  type Point,
  type Territory,
} from './types'

/**
 * In-browser stand-in for the backend. Delete this file (and flip the switch in
 * `index.ts`) once the real API exists — nothing outside `src/api` depends on it.
 */

const LATENCY_MS = 400

/** Simplified outline of Colorado (USA). */
const TERRITORY: Territory = {
  id: 'colorado',
  name: 'Colorado',
  region: 'United States',
  viewBox: '0 0 480 360',
  path: ['M 48 72', 'L 432 64', 'L 440 288', 'L 56 300', 'Z'].join(' '),
}

/** Server-side secrets: the answer and scoring parameters. */
const ANSWERS: Record<string, { trueCom: Point; kmPerUnit: number }> = {
  // Biased toward the Front Range, east of geometric center.
  colorado: { trueCom: { x: 318, y: 168 }, kmPerUnit: 1.05 },
}

function scoreFromKm(km: number): number {
  return Math.max(0, Math.round(1000 * Math.exp(-km / 95)))
}

function delay<T>(value: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    window.setTimeout(() => {
      try {
        resolve(value())
      } catch (err) {
        reject(err)
      }
    }, LATENCY_MS)
  })
}

/** Append `?fail=1` to the URL to exercise the error UI. */
function shouldFail(): boolean {
  return new URLSearchParams(window.location.search).has('fail')
}

export const mockApi: GameApi = {
  getTerritory() {
    return delay(() => {
      if (shouldFail()) throw new ApiError('Could not load today’s territory.')
      return TERRITORY
    })
  },

  submitGuess(territoryId, guess) {
    return delay((): GuessResult => {
      const answer = ANSWERS[territoryId]
      if (!answer) throw new ApiError(`Unknown territory "${territoryId}".`, 404)
      const distanceKm =
        Math.hypot(guess.x - answer.trueCom.x, guess.y - answer.trueCom.y) *
        answer.kmPerUnit
      return { trueCom: answer.trueCom, distanceKm, score: scoreFromKm(distanceKm) }
    })
  },
}
