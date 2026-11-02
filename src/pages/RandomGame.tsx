import { useEffect, useState } from 'react'
import { api, type Territory } from '../api'
import { GuessRound, type PlayedRound } from '../components/GuessRound'
import { regionForCategory } from '../regions'
import { navigate, routeHref } from '../router'

type Props = {
  /** Play this territory first instead of a random one. */
  territoryId?: string
  /** Only pick random territories from this catalog category. */
  category?: string | null
}

export function RandomGame({ territoryId, category }: Props) {
  const [territory, setTerritory] = useState<Territory | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [played, setPlayed] = useState<PlayedRound | null>(null)

  function loadTerritory(id?: string) {
    const query = id ? { id } : { category: category ?? undefined }
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
        category && (
          <p className="playing-in">
            Random · {regionForCategory(category)?.title ?? category}
            <a href={routeHref({ page: 'random', category: null })}>All territories</a>
          </p>
        )
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
