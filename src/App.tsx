import { useEffect, useId, useMemo, useState, type MouseEvent } from 'react'
import { api, type GuessResult, type LatLon, type Territory } from './api'
import { createMapProjection, MAP_HEIGHT, MAP_WIDTH } from './geo'
import { HEAT_STOPS, renderHeatmap } from './heatmap'
import './styles.css'

type Phase = 'loading' | 'ready' | 'submitting' | 'scored' | 'error'

export default function App() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [territory, setTerritory] = useState<Territory | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guess, setGuess] = useState<LatLon | null>(null)
  const [result, setResult] = useState<GuessResult | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [outsideHint, setOutsideHint] = useState(false)

  const clipId = `land-${useId().replace(/:/g, '')}`
  const map = useMemo(() => (territory ? createMapProjection(territory.shape) : null), [territory])
  const heatmap = useMemo(
    () => (map && result ? renderHeatmap(map, result.density) : null),
    [map, result],
  )

  function fetchTerritory() {
    setPhase('loading')
    setError(null)
    setGuess(null)
    setResult(null)
    setSubmitError(null)
    setOutsideHint(false)
    setTerritory(null)
    api
      .getTerritory()
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
    const point = map?.toLatLon(local.x, local.y)
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
    setGuess(null)
    setResult(null)
    setOutsideHint(false)
    setPhase('ready')
  }

  const guessXY = guess && map ? map.toXY(guess) : null
  const comXY = result && map ? map.toXY(result.trueCom) : null
  const km = result?.distanceKm ?? null
  const score = result?.score ?? null

  return (
    <div className="page">
      <div className="atmosphere" aria-hidden="true" />

      <header className="mast rise">
        <p className="brand">
          Countries<span className="brand-dot">.</span>CoM (Center of Mass)
        </p>
      </header>

      <main className="stage">
        <p className="instruction rise delay">
          {phase === 'scored'
            ? <>Your guess versus the true population <span className="nowrap">center of mass (CoM)</span>.</>
            : <>Click the map where you think the population <span className="nowrap">center of mass (CoM)</span> sits.</>}
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
              <button type="button" className="btn" onClick={() => fetchTerritory()}>
                Try again
              </button>
            </div>
          )}

          {territory && map && (phase === 'ready' || phase === 'submitting' || phase === 'scored') && (
            <svg
              className="map"
              viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
              role="img"
              aria-label={`Map of ${territory.name}. Click to place your guess.`}
              onClick={onMapClick}
            >
              <rect
                className="map-frame"
                x="0"
                y="0"
                width={MAP_WIDTH}
                height={MAP_HEIGHT}
              />

              <defs>
                <clipPath id={clipId}>
                  <path d={map.path} />
                </clipPath>
              </defs>

              <path className="territory" d={map.path} />

              {phase === 'scored' && heatmap && (
                <>
                  <image
                    className="heatmap"
                    href={heatmap}
                    x="0"
                    y="0"
                    width={MAP_WIDTH}
                    height={MAP_HEIGHT}
                    clipPath={`url(#${clipId})`}
                  />
                  <path className="territory-edge" d={map.path} />
                </>
              )}

              {guessXY && (
                <g className="pin pin-guess">
                  <circle cx={guessXY.x} cy={guessXY.y} r="10" className="pin-ring" />
                  <circle cx={guessXY.x} cy={guessXY.y} r="4.5" className="pin-core guess" />
                </g>
              )}

              {phase === 'scored' && guessXY && comXY && (
                <>
                  <line
                    className="com-link"
                    x1={guessXY.x}
                    y1={guessXY.y}
                    x2={comXY.x}
                    y2={comXY.y}
                  />
                  <g className="pin pin-com">
                    <circle
                      cx={comXY.x}
                      cy={comXY.y}
                      r="12"
                      className="pin-ring com"
                    />
                    <circle
                      cx={comXY.x}
                      cy={comXY.y}
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

          {submitError && phase === 'ready' && (
            <p className="hint" role="alert">
              {submitError}
            </p>
          )}

          {phase === 'scored' && score !== null && km !== null && (
            <div className="result">
              <p className="score">
                <span className="score-value">{score}</span>
                <span className="score-label">points</span>
              </p>
              <p className="distance">
                {km < 1 ? 'Less than 1 km' : `${km.toFixed(0)} km`} from the true{' '}
                <span className="nowrap">center of mass (CoM)</span>
              </p>
              <div className="legend" aria-hidden="true">
                <span>Fewer people</span>
                <span
                  className="legend-bar"
                  style={{ background: `linear-gradient(90deg, ${HEAT_STOPS.join(', ')})` }}
                />
                <span>More</span>
              </div>
              <div className="actions">
                <button type="button" className="btn" onClick={playAgain}>
                  Guess again
                </button>
                <button type="button" className="btn" onClick={() => fetchTerritory()}>
                  Next territory
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="foot">
        <p>Population data: GHS-POP 2025, European Commission JRC (CC BY 4.0).</p>
      </footer>
    </div>
  )
}
