import { useEffect, useState } from 'react'
import { api, type GuessResult, type LatLon, type Territory } from '../api'
import { HeatLegend, TerritoryMap } from '../components/TerritoryMap'
import { navigate } from '../router'

type Phase = 'loading' | 'ready' | 'submitting' | 'scored' | 'error'

type Props = {
  /** Play this territory first instead of a random one. */
  territoryId?: string
}

export function RandomGame({ territoryId }: Props) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [territory, setTerritory] = useState<Territory | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guess, setGuess] = useState<LatLon | null>(null)
  const [result, setResult] = useState<GuessResult | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [outsideHint, setOutsideHint] = useState(false)

  function loadTerritory(id?: string) {
    setPhase('loading')
    setError(null)
    setGuess(null)
    setResult(null)
    setSubmitError(null)
    setOutsideHint(false)
    setTerritory(null)
    api
      .getTerritory(id)
      .then((t) => {
        setTerritory(t)
        setPhase('ready')
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Something went wrong.')
        setPhase('error')
      })
  }

  useEffect(() => {
    loadTerritory(territoryId)
  }, [territoryId])

  function onPick(point: LatLon | null) {
    if (phase !== 'ready' || !territory) return
    if (!point) {
      setOutsideHint(true)
      return
    }

    setOutsideHint(false)
    setSubmitError(null)
    setGuess(point)
    setPhase('submitting')
    api
      .submitGuess(territory.id, point)
      .then((r) => {
        setResult(r)
        setPhase('scored')
      })
      .catch((err: unknown) => {
        setGuess(null)
        setSubmitError(err instanceof Error ? err.message : 'Could not submit your guess.')
        setPhase('ready')
      })
  }

  function playAgain() {
    if (territoryId) navigate({ page: 'random' })
    else loadTerritory()
  }

  const scored = phase === 'scored' && result

  return (
    <>
      <p className="instruction rise delay">
        {scored ? (
          <>
            Your guess versus the true population <span className="nowrap">center of mass (CoM)</span>.
          </>
        ) : (
          <>
            Click the map where you think the population{' '}
            <span className="nowrap">center of mass (CoM)</span> sits.
          </>
        )}
      </p>

      <div className={`board rise delay-2${phase === 'loading' ? ' is-loading' : ''}`}>
        {phase === 'loading' && (
          <div className="state" role="status">
            <div className="skeleton-map" />
            <p>Loading territory…</p>
          </div>
        )}

        {phase === 'error' && (
          <div className="state" role="alert">
            <p className="state-title">Couldn’t load the map</p>
            <p className="state-body">{error}</p>
            <button type="button" className="btn" onClick={() => loadTerritory(territoryId)}>
              Try again
            </button>
          </div>
        )}

        {territory && phase !== 'loading' && phase !== 'error' && (
          <TerritoryMap
            shape={territory.shape}
            label={`Map of ${territory.name}. Click to place your guess.`}
            guess={guess}
            trueCom={scored ? result.trueCom : null}
            density={scored ? result.density : null}
            onPick={phase === 'ready' ? onPick : undefined}
          />
        )}
      </div>

      <div className="meta rise delay-2" aria-live="polite">
        {territory && phase !== 'error' && phase !== 'loading' && (
          <p className="place">
            <span className="place-name">{territory.name}</span>
            <span className="place-region">{territory.region}</span>
          </p>
        )}

        {outsideHint && phase === 'ready' && (
          <p className="hint">Click inside the territory outline.</p>
        )}

        {submitError && phase === 'ready' && (
          <p className="hint" role="alert">
            {submitError}
          </p>
        )}

        {scored && (
          <div className="result">
            <p className="score">
              <span className="score-value">{result.score}</span>
              <span className="score-label">points</span>
            </p>
            <p className="distance">
              {result.distanceKm < 1 ? 'Less than 1 km' : `${result.distanceKm.toFixed(0)} km`} from
              the true <span className="nowrap">center of mass (CoM)</span>
            </p>
            <HeatLegend />
            <button type="button" className="btn btn-primary" onClick={playAgain}>
              Play again
            </button>
          </div>
        )}
      </div>
    </>
  )
}
