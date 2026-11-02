import type { DensityGrid } from './api'
import type { MapProjection } from './geo'

/** Color stops from sparse to dense; the first matches the territory fill. */
export const HEAT_STOPS = ['#1d5fd1', '#1fa7c9', '#8fdc5a', '#ffd23f', '#fff6d5']

/** A rectangle in map (SVG viewBox) units. */
export type MapRect = { x: number; y: number; width: number; height: number }

function buildPalette(): Uint8ClampedArray {
  const rgb = HEAT_STOPS.map((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)))
  const palette = new Uint8ClampedArray(256 * 3)
  for (let v = 1; v < 256; v++) {
    const t = ((v - 1) / 254) * (rgb.length - 1)
    const i = Math.min(Math.floor(t), rgb.length - 2)
    const f = t - i
    for (let c = 0; c < 3; c++) palette[v * 3 + c] = rgb[i][c] + (rgb[i + 1][c] - rgb[i][c]) * f
  }
  return palette
}

const palette = buildPalette()

/**
 * Renders the density grids into the map's projection for the part of the map
 * in `rect`, returning a `pixelWidth` × `pixelHeight` PNG data URL. Pixels with
 * no people are left transparent.
 */
export function renderHeatmap(
  map: MapProjection,
  grids: DensityGrid[],
  rect: MapRect,
  pixelWidth: number,
  pixelHeight: number,
): string {
  const decoded = grids.map((grid) => ({
    grid,
    values: Uint8Array.from(atob(grid.values), (c) => c.charCodeAt(0)),
    cellLon: (grid.east - grid.west) / grid.width,
    cellLat: (grid.north - grid.south) / grid.height,
  }))

  const canvas = document.createElement('canvas')
  canvas.width = pixelWidth
  canvas.height = pixelHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const image = ctx.createImageData(pixelWidth, pixelHeight)

  for (let py = 0; py < pixelHeight; py++) {
    for (let px = 0; px < pixelWidth; px++) {
      const p = map.unproject(
        rect.x + ((px + 0.5) / pixelWidth) * rect.width,
        rect.y + ((py + 0.5) / pixelHeight) * rect.height,
      )
      if (!p) continue
      for (const { grid, values, cellLon, cellLat } of decoded) {
        // Grids for territories crossing the antimeridian run past 180° east.
        const lon = p.lon < grid.west ? p.lon + 360 : p.lon
        const col = Math.floor((lon - grid.west) / cellLon)
        const row = Math.floor((grid.north - p.lat) / cellLat)
        if (col < 0 || row < 0 || col >= grid.width || row >= grid.height) continue
        const v = values[row * grid.width + col]
        if (!v) continue
        const o = (py * pixelWidth + px) * 4
        image.data[o] = palette[v * 3]
        image.data[o + 1] = palette[v * 3 + 1]
        image.data[o + 2] = palette[v * 3 + 2]
        image.data[o + 3] = 255
        break
      }
    }
  }

  ctx.putImageData(image, 0, 0)
  return canvas.toDataURL()
}
