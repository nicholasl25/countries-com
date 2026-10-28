import { geoMercator, geoPath } from 'd3-geo'
import type { MultiPoint } from 'geojson'
import { useMemo } from 'react'
import type { WorldMap } from '../api'
import type { Region } from '../regions'
import { routeHref } from '../router'

const W = 200
const H = 210
/** Frame the region below the title; the rows overlap its lower edge. */
const MAP_AREA: [[number, number], [number, number]] = [
  [8, 40],
  [W - 8, H * 0.78],
]

type Props = {
  region: Region
  world: WorldMap | null
  /** Number of territories in this region's category */
  count: number
  /** Country names to emphasise on the preview (the playable ones in this region) */
  highlight: Set<string>
}

/** Mercator projection framing the region's bounds in the visible part of the card. */
function regionProjection([west, south, east, north]: Region['bounds']) {
  const corners: MultiPoint = {
    type: 'MultiPoint',
    coordinates: [
      [west, south],
      [east, south],
      [east, north],
      [west, north],
    ],
  }
  return geoMercator()
    .fitExtent(MAP_AREA, corners)
    .clipExtent([
      [0, 0],
      [W, H],
    ])
}

export function RegionCard({ region, world, count, highlight }: Props) {
  const shapes = useMemo(() => {
    if (!world) return []
    const path = geoPath(regionProjection(region.bounds))
    return world.features.map((f, i) => ({
      key: `${f.properties.name ?? 'feature'}-${i}`,
      d: path(f) ?? '',
      highlighted: highlight.has(f.properties.name ?? ''),
    }))
  }, [world, region.bounds, highlight])

  const empty = count === 0

  return (
    <article className={`region-card${empty ? ' is-empty' : ''}`}>
      <svg
        className="region-map"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        {shapes.map((s) => (
          <path key={s.key} d={s.d} className={s.highlighted ? 'is-highlighted' : undefined} />
        ))}
      </svg>

      <h2 className="region-title">{region.title}</h2>

      <div className="region-rows">
        {empty ? (
          <span className="region-row is-disabled">
            <span>{region.itemLabel}</span>
            <span className="region-stat">Soon</span>
          </span>
        ) : (
          <>
            <a className="region-row" href={routeHref({ page: 'catalog', category: region.category })}>
              <span>{region.itemLabel}</span>
              <span className="region-stat">{count}</span>
            </a>
            <a className="region-row" href={routeHref({ page: 'random', category: region.category })}>
              <span>Play random</span>
              <span className="region-stat" aria-hidden="true">
                ▶
              </span>
            </a>
          </>
        )}
      </div>
    </article>
  )
}
