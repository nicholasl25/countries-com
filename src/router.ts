import { useSyncExternalStore } from 'react'

/**
 * Hash-based routes, so the app works from any static host without server
 * rewrites:
 *
 *   #/random[?c=<group>]       random game, optionally within a catalog group
 *   #/play/<id>                game on a specific territory
 *   #/catalog                  region cards
 *   #/catalog?c=<group>        territories in one group
 *   #/catalog/<id>[?c=<group>] one territory's heat map and answer
 *   #/daily                    daily game (not built yet)
 */
export type Route =
  | { page: 'random'; category: string | null }
  | { page: 'play'; id: string }
  | { page: 'catalog'; category: string | null }
  | { page: 'territory'; id: string; category: string | null }
  | { page: 'daily' }

export function parseRoute(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#/, '').split('?')
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent)
  const category = new URLSearchParams(query).get('c')

  switch (parts[0]) {
    case 'play':
      return parts[1] ? { page: 'play', id: parts[1] } : { page: 'random', category: null }
    case 'catalog':
      return parts[1]
        ? { page: 'territory', id: parts[1], category }
        : { page: 'catalog', category }
    case 'daily':
      return { page: 'daily' }
    default:
      return { page: 'random', category }
  }
}

function withCategory(path: string, category: string | null): string {
  return category ? `${path}?c=${encodeURIComponent(category)}` : path
}

export function routeHref(route: Route): string {
  switch (route.page) {
    case 'random':
      return withCategory('#/random', route.category)
    case 'play':
      return `#/play/${encodeURIComponent(route.id)}`
    case 'catalog':
      return withCategory('#/catalog', route.category)
    case 'territory':
      return withCategory(`#/catalog/${encodeURIComponent(route.id)}`, route.category)
    case 'daily':
      return '#/daily'
  }
}

export function navigate(route: Route) {
  window.location.hash = routeHref(route)
}

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

/** The current route; re-renders on navigation. */
export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash)
  return parseRoute(hash)
}
