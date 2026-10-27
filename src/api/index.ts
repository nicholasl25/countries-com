import { createHttpApi } from './http'
import { mockApi } from './mock'
import type { GameApi } from './types'

export * from './types'

/**
 * The single place the app picks a backend.
 *
 * - `VITE_API_URL` set   -> talk to that server (e.g. "http://localhost:8080/api")
 * - `VITE_API_URL` unset -> use the in-browser mock
 *
 * UI code should only import `api` from here.
 */
const apiUrl = import.meta.env.VITE_API_URL as string | undefined

export const api: GameApi = apiUrl ? createHttpApi(apiUrl) : mockApi
