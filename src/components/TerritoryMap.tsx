import { useId, useMemo, type MouseEvent } from 'react'
import type { DensityGrid, LatLon, TerritoryShape } from '../api'
import { createMapProjection, MAP_HEIGHT, MAP_WIDTH } from '../geo'
import { HEAT_STOPS, renderHeatmap } from '../heatmap'

type Props = {
  shape: TerritoryShape
  label: string
  /** Where the player clicked (black X) */
  guess?: LatLon | null
  /** The true center of mass (red dot) */
  trueCom?: LatLon | null
  /** Population heat map drawn inside the border */
  density?: DensityGrid | null
  /** Called on click with the clicked location. It can be outside the border,
   * since a center of mass can land in the sea or a neighboring country. */
  onPick?: (point: LatLon) => void
}

const X_PATH = 'M -6 -6 L 6 6 M 6 -6 L -6 6'

export function TerritoryMap({ shape, label, guess, trueCom, density, onPick }: Props) {
  const clipId = `land-${useId().replace(/:/g, '')}`
  const map = useMemo(() => createMapProjection(shape), [shape])
  const heatmap = useMemo(() => (density ? renderHeatmap(map, density) : null), [map, density])

  const guessXY = guess ? map.toXY(guess) : null
  const comXY = trueCom ? map.toXY(trueCom) : null

  function onClick(event: MouseEvent<SVGSVGElement>) {
    if (!onPick) return
    const svg = event.currentTarget
    const ctm = svg.getScreenCTM()
    if (!ctm) return
    const pt = svg.createSVGPoint()
    pt.x = event.clientX
    pt.y = event.clientY
    const local = pt.matrixTransform(ctm.inverse())
    const point = map.unproject(local.x, local.y)
    if (point) onPick(point)
  }

  return (
    <svg
      className={`map${onPick ? ' is-pickable' : ''}`}
      viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
      role="img"
      aria-label={label}
      onClick={onClick}
    >
      <defs>
        <clipPath id={clipId}>
          <path d={map.path} />
        </clipPath>
      </defs>

      <rect className="map-frame" x="0" y="0" width={MAP_WIDTH} height={MAP_HEIGHT} />
      <path className="territory" d={map.path} />

      {heatmap && (
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

      {guessXY && comXY && (
        <line className="com-link" x1={guessXY.x} y1={guessXY.y} x2={comXY.x} y2={comXY.y} />
      )}

      {guessXY && (
        <g transform={`translate(${guessXY.x} ${guessXY.y})`} aria-label="Your guess">
          <g className="pin pin-guess">
            <path className="guess-x-halo" d={X_PATH} />
            <path className="guess-x" d={X_PATH} />
          </g>
        </g>
      )}

      {comXY && (
        <g className="pin pin-com" aria-label="True center of mass">
          <circle cx={comXY.x} cy={comXY.y} r="12" className="pin-ring com" />
          <circle cx={comXY.x} cy={comXY.y} r="5" className="pin-core com" />
        </g>
      )}
    </svg>
  )
}

export function HeatLegend() {
  return (
    <div className="legend" aria-hidden="true">
      <span>Fewer people</span>
      <span
        className="legend-bar"
        style={{ background: `linear-gradient(90deg, ${HEAT_STOPS.join(', ')})` }}
      />
      <span>More</span>
    </div>
  )
}
