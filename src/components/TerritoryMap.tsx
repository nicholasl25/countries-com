import { useEffect, useId, useMemo, useRef, useState, type PointerEvent } from 'react'
import type { DensityGrid, LatLon, TerritoryShape } from '../api'
import { createMapProjection, MAP_HEIGHT, MAP_WIDTH } from '../geo'
import { HEAT_STOPS, renderHeatmap, type MapRect } from '../heatmap'

type Props = {
  shape: TerritoryShape
  label: string
  /** Where the player clicked (black X) */
  guess?: LatLon | null
  /** The true center of mass (red dot) */
  trueCom?: LatLon | null
  /** Population heat map drawn inside the border */
  density?: DensityGrid[] | null
  /** Called on click with the clicked location. It can be outside the border,
   * since a center of mass can land in the sea or a neighboring country. */
  onPick?: (point: LatLon) => void
}

/** Top-left corner of the visible area in map units, and the zoom factor. */
type View = { x: number; y: number; k: number }

const FULL_VIEW: View = { x: 0, y: 0, k: 1 }
const MAX_ZOOM = 256
/** A press that moves less than this is a click (a guess), not a drag. */
const DRAG_THRESHOLD_PX = 5
const HEATMAP_DPI = 2
const X_PATH = 'M -6 -6 L 6 6 M 6 -6 L -6 6'

function viewRect({ x, y, k }: View): MapRect {
  return { x, y, width: MAP_WIDTH / k, height: MAP_HEIGHT / k }
}

function clampView({ x, y, k }: View): View {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, k))
  const { width, height } = viewRect({ x, y, k: zoom })
  return {
    k: zoom,
    x: Math.min(MAP_WIDTH - width, Math.max(0, x)),
    y: Math.min(MAP_HEIGHT - height, Math.max(0, y)),
  }
}

/** Zooms by `factor`, keeping the map point (px, py) at the same spot on screen. */
function zoomAround(view: View, factor: number, px: number, py: number): View {
  const k = Math.min(MAX_ZOOM, Math.max(1, view.k * factor))
  const r = view.k / k
  return clampView({ k, x: px - (px - view.x) * r, y: py - (py - view.y) * r })
}

/** Screen position to map units, plus screen pixels per map unit. */
function toMap(svg: SVGSVGElement, view: View, clientX: number, clientY: number) {
  const box = svg.getBoundingClientRect()
  const rect = viewRect(view)
  // The SVG letterboxes (preserveAspectRatio "meet") when the board isn't 4:3.
  const scale = Math.min(box.width / rect.width, box.height / rect.height)
  return {
    x: rect.x + (clientX - box.left - (box.width - rect.width * scale) / 2) / scale,
    y: rect.y + (clientY - box.top - (box.height - rect.height * scale) / 2) / scale,
    scale,
  }
}

/** Remount (with a `key`) to reset the zoom when showing a different territory. */
export function TerritoryMap({ shape, label, guess, trueCom, density, onPick }: Props) {
  const clipId = `land-${useId().replace(/:/g, '')}`
  const map = useMemo(() => createMapProjection(shape), [shape])
  const svgRef = useRef<SVGSVGElement>(null)

  const [view, setViewState] = useState(FULL_VIEW)
  const viewRef = useRef(view)
  function setView(next: View) {
    viewRef.current = next
    setViewState(next)
  }

  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const press = useRef({ moved: false, startX: 0, startY: 0 })
  const [panning, setPanning] = useState(false)

  // Re-render the heat map at full detail for the visible area once zooming stops.
  const [heatView, setHeatView] = useState(view)
  useEffect(() => {
    const timer = window.setTimeout(() => setHeatView(view), 150)
    return () => window.clearTimeout(timer)
  }, [view])
  const heatRect = viewRect(heatView)
  const heatmap = useMemo(
    () =>
      density
        ? renderHeatmap(map, density, viewRect(heatView), MAP_WIDTH * HEATMAP_DPI, MAP_HEIGHT * HEATMAP_DPI)
        : null,
    [map, density, heatView],
  )

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    function onWheel(event: WheelEvent) {
      const current = viewRef.current
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY
      // Let the page scroll when the map can't zoom out any further.
      if (current.k <= 1 && delta > 0) return
      event.preventDefault()
      const p = toMap(svg!, current, event.clientX, event.clientY)
      // Trackpad pinches arrive as ctrl+wheel with small deltas.
      const next = zoomAround(current, Math.exp(-delta * (event.ctrlKey ? 0.01 : 0.002)), p.x, p.y)
      viewRef.current = next
      setViewState(next)
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [])

  function onPointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 1) {
      press.current = { moved: false, startX: event.clientX, startY: event.clientY }
    } else {
      press.current.moved = true // a pinch never places a guess
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    const prev = pointers.current.get(event.pointerId)
    if (!prev) return
    const svg = event.currentTarget
    const cur = { x: event.clientX, y: event.clientY }
    const current = viewRef.current

    if (pointers.current.size === 1) {
      const dragged = Math.hypot(cur.x - press.current.startX, cur.y - press.current.startY)
      if (!press.current.moved && dragged < DRAG_THRESHOLD_PX) return
      press.current.moved = true
      setPanning(true)
      const { scale } = toMap(svg, current, cur.x, cur.y)
      setView(clampView({ ...current, x: current.x - (cur.x - prev.x) / scale, y: current.y - (cur.y - prev.y) / scale }))
    } else if (pointers.current.size === 2) {
      const other = [...pointers.current].find(([id]) => id !== event.pointerId)?.[1]
      if (!other) return
      const before = { x: (prev.x + other.x) / 2, y: (prev.y + other.y) / 2, d: Math.hypot(prev.x - other.x, prev.y - other.y) }
      const after = { x: (cur.x + other.x) / 2, y: (cur.y + other.y) / 2, d: Math.hypot(cur.x - other.x, cur.y - other.y) }
      if (before.d > 0) {
        const mid = toMap(svg, current, before.x, before.y)
        const zoomed = zoomAround(current, after.d / before.d, mid.x, mid.y)
        const { scale } = toMap(svg, zoomed, 0, 0)
        setView(clampView({ ...zoomed, x: zoomed.x - (after.x - before.x) / scale, y: zoomed.y - (after.y - before.y) / scale }))
      }
    }
    pointers.current.set(event.pointerId, cur)
  }

  function onPointerUp(event: PointerEvent<SVGSVGElement>) {
    if (!pointers.current.delete(event.pointerId)) return
    if (pointers.current.size > 0) return
    setPanning(false)
    if (press.current.moved || !onPick) return
    const p = toMap(event.currentTarget, viewRef.current, event.clientX, event.clientY)
    const point = map.unproject(p.x, p.y)
    if (point) onPick(point)
  }

  function onPointerCancel(event: PointerEvent<SVGSVGElement>) {
    pointers.current.delete(event.pointerId)
    press.current.moved = true
    if (pointers.current.size === 0) setPanning(false)
  }

  function zoomBy(factor: number) {
    const { x, y, width, height } = viewRect(view)
    setView(zoomAround(view, factor, x + width / 2, y + height / 2))
  }

  const rect = viewRect(view)
  const pinScale = `scale(${1 / view.k})`
  const guessXY = guess ? map.toXY(guess) : null
  const comXY = trueCom ? map.toXY(trueCom) : null

  return (
    <>
      <svg
        ref={svgRef}
        className={`map${onPick ? ' is-pickable' : ''}${panning ? ' is-panning' : ''}`}
        viewBox={`${rect.x} ${rect.y} ${rect.width} ${rect.height}`}
        role="img"
        aria-label={label}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
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
              x={heatRect.x}
              y={heatRect.y}
              width={heatRect.width}
              height={heatRect.height}
              clipPath={`url(#${clipId})`}
            />
            <path className="territory-edge" d={map.path} />
          </>
        )}

        {guessXY && comXY && (
          <line className="com-link" x1={guessXY.x} y1={guessXY.y} x2={comXY.x} y2={comXY.y} />
        )}

        {guessXY && (
          <g transform={`translate(${guessXY.x} ${guessXY.y}) ${pinScale}`} aria-label="Your guess">
            <g className="pin pin-guess">
              <path className="guess-x-halo" d={X_PATH} />
              <path className="guess-x" d={X_PATH} />
            </g>
          </g>
        )}

        {comXY && (
          <g transform={`translate(${comXY.x} ${comXY.y}) ${pinScale}`} aria-label="True center of mass">
            <g className="pin pin-com">
              <circle r="12" className="pin-ring com" />
              <circle r="5" className="pin-core com" />
            </g>
          </g>
        )}
      </svg>

      <div className="map-zoom">
        <button type="button" aria-label="Zoom in" title="Zoom in (or scroll / pinch)" onClick={() => zoomBy(2)}>
          +
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          title="Zoom out"
          disabled={view.k <= 1}
          onClick={() => zoomBy(0.5)}
        >
          −
        </button>
        {view.k > 1 && (
          <button type="button" aria-label="Show whole territory" title="Show whole territory" onClick={() => setView(FULL_VIEW)}>
            ⤢
          </button>
        )}
      </div>
    </>
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
