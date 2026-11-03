import { Fragment, useEffect, useState } from 'react'
import { api, type Territory } from '../api'
import { GuessRound, type PlayedRound } from '../components/GuessRound'
import { regionForCategory } from '../regions'
import { navigate } from '../router'

type Mode = { label: string; route: string | null; category?: string }

/**
 * The Random page's pools. `route` is the `?c=` value (null is the default
 * pool); `category` is what's sent to the API (undefined = every territory).
 */
const MODE_GROUPS: { label?: string; modes: Mode[] }[] = [
  {
    modes: [
      { label: 'Countries (Top 100)', route: null, category: '100 Largest Countries' },
      { label: 'Countries (All)', route: 'Countries', category: 'Countries' },
      { label: 'U.S. States', route: 'US States', category: 'US States' },
      { label: 'Continents', route: 'Continents', category: 'Continents' },
      { label: 'All', route: 'all' },
    ],
  },
  {
    label: 'Countries by continent',
    modes: ['Africa', 'Asia', 'Europe', 'North America', 'Oceania', 'South America'].map((c) => ({
      label: c,
      route: c,
      category: c,
    })),
  },
]
const MODES = MODE_GROUPS.flatMap((g) => g.modes)

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
        <label className="mode-picker">
          <span className="mode-picker-label">Random from</span>
          <select
            value={mode ? MODES.indexOf(mode) : ''}
            onChange={(e) => navigate({ page: 'random', category: MODES[Number(e.target.value)].route })}
          >
            {!mode && (
              <option value="" disabled>
                {catalogCategory ? (regionForCategory(catalogCategory)?.title ?? catalogCategory) : 'Choose…'}
              </option>
            )}
            {MODE_GROUPS.map((g, gi) => {
              const options = g.modes.map((m) => (
                <option key={m.label} value={MODES.indexOf(m)}>
                  {m.label}
                </option>
              ))
              return g.label ? (
                <optgroup key={g.label} label={g.label}>
                  {options}
                </optgroup>
              ) : (
                <Fragment key={gi}>{options}</Fragment>
              )
            })}
          </select>
        </label>
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
