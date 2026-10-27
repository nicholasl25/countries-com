import { createHttpApi } from './http'
import type { GameApi } from './types'

export * from './types'

/**
 * The single place the app talks to the backend. UI code should only import
 * `api` from here.
 *
 * Defaults to `/api` (proxied to the local server by Vite in dev). Set
 * `VITE_API_URL` to point at a different server.
 */
export const api: GameApi = createHttpApi(import.meta.env.VITE_API_URL || '/api')
