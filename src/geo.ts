import {
  geoAzimuthalEqualArea,
  geoCentroid,
  geoCircle,
  geoPath,
  type GeoProjection,
} from 'd3-geo'
import type { LatLon, TerritoryShape } from './api'

const KM_PER_DEGREE = (Math.PI * 6371) / 180

/** e.g. "46.313° N, 2.691° E", or "46.31°N 2.69°E" when `compact` */
export function formatLatLon({ lat, lon }: LatLon, compact = false): string {
  const part = (value: number, positive: string, negative: string) =>
    `${Math.abs(value).toFixed(compact ? 2 : 3)}°${compact ? '' : ' '}${value >= 0 ? positive : negative}`
  return `${part(lat, 'N', 'S')}${compact ? ' ' : ', '}${part(lon, 'E', 'W')}`
}

/** Opens Google Maps with a pin at the point (it shows the nearest address or
 * place). 4 decimals is ~11 m, the precision answers are stored at. */
export function googleMapsUrl({ lat, lon }: LatLon): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(4)},${lon.toFixed(4)}`
}

/** e.g. "312 km", "4.2 km" */
export function formatKm(km: number): string {
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km).toLocaleString('en-US')} km`
}

export const MAP_WIDTH = 480
export const MAP_HEIGHT = 360
const PADDING = 16

/**
 * Converts between lat/lon and SVG coordinates for one territory, using an
 * equal-area projection centered on the territory so shapes aren't distorted.
 */
export type MapProjection = {
  path: string
  toXY(p: LatLon): { x: number; y: number }
  /** Inverse of `toXY`, whether or not the point is inside the territory. */
  unproject(x: number, y: number): LatLon | null
  /** SVG path of a circle on the Earth's surface (great-circle radius). */
  circle(center: LatLon, radiusKm: number): string
}

export function createMapProjection(shape: TerritoryShape): MapProjection {
  const [lon, lat] = geoCentroid(shape)
  const projection: GeoProjection = geoAzimuthalEqualArea()
    .rotate([-lon, -lat])
    .fitExtent(
      [
        [PADDING, PADDING],
        [MAP_WIDTH - PADDING, MAP_HEIGHT - PADDING],
      ],
      shape,
    )
  const toPath = geoPath(projection)

  return {
    path: toPath(shape) ?? '',
    toXY({ lat, lon }) {
      const [x, y] = projection([lon, lat]) ?? [NaN, NaN]
      return { x, y }
    },
    unproject(x, y) {
      const lonLat = projection.invert?.([x, y])
      return lonLat ? { lon: lonLat[0], lat: lonLat[1] } : null
    },
    circle(center, radiusKm) {
      const circle = geoCircle()
        .center([center.lon, center.lat])
        .radius(Math.min(radiusKm / KM_PER_DEGREE, 179))
        .precision(1)
      return toPath(circle()) ?? ''
    },
  }
}
