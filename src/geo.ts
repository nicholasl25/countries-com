import {
  geoAzimuthalEqualArea,
  geoCentroid,
  geoPath,
  type GeoProjection,
} from 'd3-geo'
import type { LatLon, TerritoryShape } from './api'

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

  return {
    path: geoPath(projection)(shape) ?? '',
    toXY({ lat, lon }) {
      const [x, y] = projection([lon, lat]) ?? [NaN, NaN]
      return { x, y }
    },
    unproject(x, y) {
      const lonLat = projection.invert?.([x, y])
      return lonLat ? { lon: lonLat[0], lat: lonLat[1] } : null
    },
  }
}
