/** Mock territory for the frontend shell — fixed COM, no live GIS. */

export type Point = { x: number; y: number }

export type Territory = {
  id: string
  name: string
  region: string
  viewBox: string
  /** Closed SVG path in viewBox units */
  path: string
  /** Fixed true population center of mass (mock) */
  trueCom: Point
  /** Rough km per viewBox unit for scoring copy */
  kmPerUnit: number
}

/**
 * Simplified outline of Colorado (USA).
 * True COM is biased toward the Front Range, east of geometric center.
 */
export const MOCK_TERRITORY: Territory = {
  id: 'colorado',
  name: 'Colorado',
  region: 'United States',
  viewBox: '0 0 480 360',
  path: [
    'M 48 72',
    'L 432 64',
    'L 440 288',
    'L 56 300',
    'Z',
  ].join(' '),
  trueCom: { x: 318, y: 168 },
  kmPerUnit: 1.05,
}

/** Simulated async load. Append `?fail=1` to the URL to exercise the error UI. */
export function loadTerritory(options?: { ignoreFailParam?: boolean }): Promise<Territory> {
  const shouldFail =
    !options?.ignoreFailParam &&
    new URLSearchParams(window.location.search).has('fail')
  return new Promise((resolve, reject) => {
    window.setTimeout(() => {
      if (shouldFail) {
        reject(new Error('Could not load today’s territory.'))
        return
      }
      resolve(MOCK_TERRITORY)
    }, 700)
  })
}

export function distanceKm(
  a: Point,
  b: Point,
  kmPerUnit: number,
): number {
  return Math.hypot(a.x - b.x, a.y - b.y) * kmPerUnit
}

/** Score 0–1000 from distance; tight guesses land high. */
export function scoreGuess(km: number): number {
  return Math.max(0, Math.round(1000 * Math.exp(-km / 95)))
}
