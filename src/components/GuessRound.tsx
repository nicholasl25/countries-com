import { useState, type ReactNode } from 'react'
import { api, type GuessResult, type LatLon, type Territory } from '../api'
import { formatKm, formatLatLon } from '../geo'
import { HeatLegend, TerritoryMap } from './TerritoryMap'

export type PlayedRound = { guess: LatLon; result: GuessResult }

type Props = {
  /** null while the territory is loading */
  territory: Territory | null
  /** Shown instead of the map if the territory failed to load */
  loadError?: string | null
  onRetry?: () => void
  /** Shown under the instruction, e.g. the game mode or round */
  header?: ReactNode
  /** The finished guess, if this round has been played */
  played: PlayedRound | null
  onPlayed: (round: PlayedRound) => void
  /** Shown in the map's bottom-right corner once the round is played, e.g. a next button */
  action?: ReactNode
  /** Shown under the score once the round is played */
  children?: ReactNode
}

/** One territory: click a guess, submit it, then show the score and heat map. */
export function GuessRound({
  territory,
  loadError,
  onRetry,
  header,
  played,
  onPlayed,
  action,
  children,
}: Props) {
  const [pending, setPending] = useState<LatLon | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const loading = !territory && !loadError
  const ready = territory && !played && !pending

  function onPick(point: LatLon) {
    if (!ready) return
    setSubmitError(null)
    setPending(point)
    api
      .submitGuess(territory.id, point)
      .then((result) => onPlayed({ guess: point, result }))
      .catch((err: unknown) => {
        setSubmitError(err instanceof Error ? err.message : 'Could not submit your guess.')
      })
      .finally(() => setPending(null))
  }

  const result = played?.result

  return (
    <>
      <p className="instruction rise delay">
        {result ? (
          'Your guess versus the true population center'
        ) : (
          <>
            Click the map where you think the population{' '}
            <span className="nowrap">center of mass</span> sits.
          </>
        )}
      </p>

      {header}

      <p className="place rise delay">
        {territory && (
          <>
            {territory.name}
            <span className="place-region">, {territory.region}</span>
          </>
        )}
      </p>

      <div className={`board rise delay-2${loading ? ' is-loading' : ''}`}>
        {loading && (
          <div className="state" role="status">
            <div className="skeleton-map" />
            <p>Loading territory…</p>
          </div>
        )}

        {loadError && (
          <div className="state" role="alert">
            <p className="state-title">Couldn’t load the map</p>
            <p className="state-body">{loadError}</p>
            {onRetry && (
              <button type="button" className="btn" onClick={onRetry}>
                Try again
              </button>
            )}
          </div>
        )}

        {territory && (
          <TerritoryMap
            key={territory.id}
            shape={territory.shape}
            label={`Map of ${territory.name}. Click to place your guess.`}
            guess={played?.guess ?? pending}
            trueCom={result?.trueCom ?? null}
            sigmaKm={result?.sigmaKm ?? null}
            density={result?.density ?? null}
            onPick={ready ? onPick : undefined}
          />
        )}

        {played && (
          <dl className="board-summary">
            <div>
              <dt>
                <svg className="summary-icon" viewBox="-8 -8 16 16" aria-hidden="true">
                  <path className="guess-x" d="M -5 -5 L 5 5 M 5 -5 L -5 5" />
                </svg>
                Guess:
              </dt>
              <dd>{formatLatLon(played.guess, true)}</dd>
            </div>
            <div>
              <dt>
                <svg className="summary-icon" viewBox="-8 -8 16 16" aria-hidden="true">
                  <circle r="4.5" className="pin-core com" />
                </svg>
                True CoM:
              </dt>
              <dd>{formatLatLon(played.result.trueCom, true)}</dd>
            </div>
            {played.result.sigmaKm && (
              <div>
                <dt>
                  <svg className="summary-icon" viewBox="-8 -8 16 16" aria-hidden="true">
                    <circle r="6" className="summary-ring" />
                  </svg>
                  σ:
                </dt>
                <dd>{formatKm(played.result.sigmaKm)}</dd>
              </div>
            )}
            <div>
              <dt>Score:</dt>
              <dd>{played.result.score}</dd>
            </div>
          </dl>
        )}

        {result && action && <div className="board-action">{action}</div>}
      </div>

      <div className="meta rise delay-2" aria-live="polite">
        {submitError && ready && (
          <p className="hint" role="alert">
            {submitError}
          </p>
        )}

        {result && (
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
            {children}
          </div>
        )}
      </div>
    </>
  )
}
