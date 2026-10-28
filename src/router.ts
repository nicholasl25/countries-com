import { useSyncExternalStore } from 'react'

/**
 * Hash-based routes, so the app works from any static host without server
 * rewrites:
 *
 *   #/random              random game
 *   #/play/<id>           game on a specific territory
 *   #/catalog?c=<group>   catalog, optionally on a category
 *   #/catalog/<id>        one territory's heat map and answer
 *   #/daily               daily game (not built yet)
 */
export type Route =
  | { page: 'random' }
  | { page: 'play'; id: string }
  | { page: 'catalog'; category: string | null }
  | { page: 'territory'; id: string }
  | { page: 'daily' }

export function parseRoute(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#/, '').split('?')
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent)

  switch (parts[0]) {
    case 'play':
      return parts[1] ? { page: 'play', id: parts[1] } : { page: 'random' }
    case 'catalog':
      return parts[1]
        ? { page: 'territory', id: parts[1] }
        : { page: 'catalog', category: new URLSearchParams(query).get('c') }
    case 'daily':
      return { page: 'daily' }
    default:
      return { page: 'random' }
  }
}

export function routeHref(route: Route): string {
  switch (route.page) {
    case 'random':
      return '#/random'
    case 'play':
      return `#/play/${encodeURIComponent(route.id)}`
    case 'catalog':
      return route.category ? `#/catalog?c=${encodeURIComponent(route.category)}` : '#/catalog'
    case 'territory':
      return `#/catalog/${encodeURIComponent(route.id)}`
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
