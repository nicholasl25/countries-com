import {
  ApiError,
  type GameApi,
  type GuessResult,
  type Point,
  type Territory,
} from './types'

/**
 * HTTP implementation of `GameApi`. Routes the backend needs to provide
 * (all JSON, relative to `baseUrl`):
 *
 *   GET  /territory  -> Territory
 *   POST /guess      -> GuessResult
 *        body: { territoryId: string, guess: Point }
 *
 * Non-2xx responses may include `{ "error": "message" }`.
 */
export function createHttpApi(baseUrl: string): GameApi {
  const base = baseUrl.replace(/\/+$/, '')

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response
    try {
      res = await fetch(`${base}${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...init?.headers },
      })
    } catch {
      throw new ApiError('Could not reach the server.')
    }

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      throw new ApiError(body?.error ?? `Request failed (${res.status}).`, res.status)
    }
    return (await res.json()) as T
  }

  return {
    getTerritory: () => request<Territory>('/territory'),
    submitGuess: (territoryId: string, guess: Point) =>
      request<GuessResult>('/guess', {
        method: 'POST',
        body: JSON.stringify({ territoryId, guess }),
      }),
  }
}
