import { useEffect, useId, useState, type MouseEvent } from 'react'
import {
  distanceKm,
  loadTerritory,
  scoreGuess,
  type Point,
  type Territory,
} from './data'
import './styles.css'

type Phase = 'loading' | 'ready' | 'scored' | 'error'

export default function App() {
  const clipId = useId().replace(/:/g, '')
  const [phase, setPhase] = useState<Phase>('loading')
  const [territory, setTerritory] = useState<Territory | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guess, setGuess] = useState<Point | null>(null)
  const [outsideHint, setOutsideHint] = useState(false)

  function fetchTerritory(retry = false) {
    setPhase('loading')
    setError(null)
    setGuess(null)
    setOutsideHint(false)
    setTerritory(null)
    loadTerritory({ ignoreFailParam: retry })
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
    fetchTerritory()
  }, [])

  function onMapClick(event: MouseEvent<SVGSVGElement>) {
    if (phase !== 'ready' || !territory) return

    const svg = event.currentTarget
    const pt = svg.createSVGPoint()
    pt.x = event.clientX
    pt.y = event.clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return
    const local = pt.matrixTransform(ctm.inverse())
    const point = { x: local.x, y: local.y }

    const pathEl = svg.querySelector('path.territory') as SVGGeometryElement | null
    if (pathEl && !pathEl.isPointInFill(point)) {
      setOutsideHint(true)
      return
    }

    setOutsideHint(false)
    setGuess(point)
    setPhase('scored')
  }

  function playAgain() {
    setGuess(null)
    setOutsideHint(false)
    setPhase('ready')
  }

  const km =
    territory && guess
      ? distanceKm(guess, territory.trueCom, territory.kmPerUnit)
      : null
  const score = km === null ? null : scoreGuess(km)

  return (
    <div className="page">
      <div className="atmosphere" aria-hidden="true" />

      <header className="mast rise">
        <p className="brand">
          Countries<span className="brand-dot">.</span>COM
        </p>
        <p className="tag">Center of Mass</p>
      </header>

      <main className="stage">
        <p className="instruction rise delay">
          {phase === 'scored'
            ? 'Your guess versus the true population center of mass.'
            : 'Click the map where you think the population center of mass sits.'}
        </p>

        <div
          className={`board rise delay-2${phase === 'loading' ? ' is-loading' : ''}`}
        >
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
              <button type="button" className="btn" onClick={() => fetchTerritory(true)}>
                Try again
              </button>
            </div>
          )}

          {territory && (phase === 'ready' || phase === 'scored') && (
            <svg
              className="map"
              viewBox={territory.viewBox}
              role="img"
              aria-label={`Map of ${territory.name}. Click to place your guess.`}
              onClick={onMapClick}
            >
              <defs>
                <clipPath id={`land-${clipId}`}>
                  <path d={territory.path} />
                </clipPath>
              </defs>

              <rect
                className="map-frame"
                x="0"
                y="0"
                width="480"
                height="360"
              />

              <g clipPath={`url(#land-${clipId})`}>
                <rect className="land-fill" x="0" y="0" width="480" height="360" />
                <g className="hatch" aria-hidden="true">
                  {Array.from({ length: 28 }, (_, i) => (
                    <line
                      key={i}
                      x1={i * 22}
                      y1="0"
                      x2={i * 22 - 80}
                      y2="360"
                    />
                  ))}
                </g>
              </g>

              <path className="territory" d={territory.path} />

              {guess && (
                <g className="pin pin-guess">
                  <circle cx={guess.x} cy={guess.y} r="10" className="pin-ring" />
                  <circle cx={guess.x} cy={guess.y} r="4.5" className="pin-core guess" />
                </g>
              )}

              {phase === 'scored' && territory && guess && (
                <>
                  <line
                    className="com-link"
                    x1={guess.x}
                    y1={guess.y}
                    x2={territory.trueCom.x}
                    y2={territory.trueCom.y}
                  />
                  <g className="pin pin-com">
                    <circle
                      cx={territory.trueCom.x}
                      cy={territory.trueCom.y}
                      r="12"
                      className="pin-ring com"
                    />
                    <circle
                      cx={territory.trueCom.x}
                      cy={territory.trueCom.y}
                      r="5"
                      className="pin-core com"
                    />
                  </g>
                </>
              )}
            </svg>
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

          {phase === 'scored' && score !== null && km !== null && (
            <div className="result">
              <p className="score">
                <span className="score-value">{score}</span>
                <span className="score-label">points</span>
              </p>
              <p className="distance">
                {km < 1 ? 'Less than 1 km' : `${km.toFixed(0)} km`} from the true
                COM
              </p>
              <button type="button" className="btn" onClick={playAgain}>
                Guess again
              </button>
            </div>
          )}
        </div>
      </main>

      <footer className="foot">
        <p>Mock data for now — one fixed territory, no live population feed.</p>
      </footer>
    </div>
  )
}
