import {
  ApiError,
  type Catalog,
  type CatalogDetail,
  type GameApi,
  type GuessResult,
  type LatLon,
  type Territory,
  type TerritoryQuery,
  type WorldMap,
} from './types'

/**
 * HTTP implementation of `GameApi`. Routes the backend needs to provide
 * (all JSON, relative to `baseUrl`):
 *
 *   GET  /territory[?id=|?category=]  -> Territory (with GeoJSON `shape`)
 *   POST /guess            -> GuessResult
 *        body: { territoryId: string, guess: { lat, lon } }
 *   GET  /catalog          -> Catalog
 *   GET  /catalog/{id}     -> CatalogDetail
 *   GET  /world            -> WorldMap
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
    getTerritory: (query: TerritoryQuery = {}) => {
      const params = new URLSearchParams()
      if (query.id) params.set('id', query.id)
      if (query.category) params.set('category', query.category)
      const qs = params.toString()
      return request<Territory>(qs ? `/territory?${qs}` : '/territory')
    },
    submitGuess: (territoryId: string, guess: LatLon) =>
      request<GuessResult>('/guess', {
        method: 'POST',
        body: JSON.stringify({ territoryId, guess }),
      }),
    getCatalog: () => request<Catalog>('/catalog'),
    getCatalogDetail: (id: string) =>
      request<CatalogDetail>(`/catalog/${encodeURIComponent(id)}`),
    getWorld: () => request<WorldMap>('/world'),
  }
}
