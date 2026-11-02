import { useEffect, useState } from 'react'
import { api, type Territory } from '../api'
import { GuessRound, type PlayedRound } from '../components/GuessRound'
import { regionForCategory } from '../regions'
import { navigate, routeHref } from '../router'

/**
 * The Random page's pools. `route` is the `?c=` value (null is the default
 * pool); `category` is what's sent to the API (undefined = every territory).
 */
const MODES: { label: string; route: string | null; category?: string }[] = [
  { label: '100 largest countries', route: null, category: '100 Largest Countries' },
  { label: 'States', route: 'US States', category: 'US States' },
  { label: 'All', route: 'all' },
]

type Props = {
  /** Play this territory first instead of a random one. */
  territoryId?: string
  /** A mode's `route` value, or a catalog category to pick from. */
  category?: string | null
}

export function RandomGame({ territoryId, category = null }: Props) {
  const [territory, setTerritory] = useState<Territory | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [played, setPlayed] = useState<PlayedRound | null>(null)

  const mode = territoryId ? undefined : MODES.find((m) => m.route === category)
  // Not one of the modes: a catalog category, e.g. from a region's "Play random".
  const catalogCategory = !territoryId && !mode ? category : null

  function loadTerritory(id?: string) {
    const query = id ? { id } : { category: mode ? mode.category : (catalogCategory ?? undefined) }
    setError(null)
    setPlayed(null)
    setTerritory(null)
    api.getTerritory(query).then(setTerritory, (err: unknown) => {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    })
  }

  // Remounted (via `key`) whenever the route's territory or category changes.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => loadTerritory(territoryId), [])

  function playAgain() {
    if (territoryId) navigate({ page: 'random', category: null })
    else loadTerritory()
  }

  return (
    <GuessRound
      key={territory?.id}
      territory={territory}
      loadError={error}
      onRetry={() => loadTerritory(territoryId)}
      header={
        <>
          <nav className="mode-switch" aria-label="Random from">
            {MODES.map((m) => (
              <a
                key={m.label}
                className={`mode-option${m === mode ? ' is-active' : ''}`}
                href={routeHref({ page: 'random', category: m.route })}
                aria-current={m === mode ? 'page' : undefined}
              >
                {m.label}
              </a>
            ))}
          </nav>
          {catalogCategory && (
            <p className="playing-in">
              Random · {regionForCategory(catalogCategory)?.title ?? catalogCategory}
            </p>
          )}
        </>
      }
      played={played}
      onPlayed={setPlayed}
      action={
        <button type="button" className="btn btn-primary" onClick={playAgain}>
          Play again
        </button>
      }
    />
  )
}
