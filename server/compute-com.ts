/**
 * Offline step: compute each territory's population-weighted center of mass
 * from the GHS-POP 30 arc-second (~1 km) global population grid, and write the
 * results to `server/data/answers.json`. Run `npm run data:fetch` first.
 *
 * Each grid cell's population is treated as a point mass on the sphere at the
 * cell center; the CoM is the weighted mean of those unit vectors, projected
 * back onto the surface.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { geoBounds } from 'd3-geo'
import { fromFile } from 'geotiff'
import type { TerritoryShape } from '../src/api/types.ts'
import { getShape, TERRITORIES, type Answer } from './territories.ts'

const RASTER_PATH = new URL('../data/raw/GHS_POP_E2025_GLOBE_R2023A_4326_30ss_V1_0.tif', import.meta.url)
const OUT_DIR = new URL('./data/', import.meta.url)
const DEG = Math.PI / 180

function rings(shape: TerritoryShape): number[][][] {
  const g = shape.geometry
  return g.type === 'Polygon' ? g.coordinates : g.coordinates.flat()
}

async function main() {
  const tiff = await fromFile(RASTER_PATH.pathname)
  const image = await tiff.getImage()
  const [originLon, originLat] = image.getOrigin()
  const [resLon, resLat] = image.getResolution() // resLat is negative (north-up)
  const width = image.getWidth()
  const height = image.getHeight()
  const noData = image.getGDALNoData()

  const answers: Record<string, Answer> = {}

  for (const t of TERRITORIES) {
    const shape = getShape(t)
    const [[west, south], [east, north]] = geoBounds(shape)
    const col0 = Math.max(0, Math.floor((west - originLon) / resLon))
    const col1 = Math.min(width, Math.ceil((east - originLon) / resLon))
    const row0 = Math.max(0, Math.floor((north - originLat) / resLat))
    const row1 = Math.min(height, Math.ceil((south - originLat) / resLat))
    const w = col1 - col0

    const [band] = (await image.readRasters({ window: [col0, row0, col1, row1] })) as unknown as [
      ArrayLike<number>,
    ]

    const cosLon = new Float64Array(w)
    const sinLon = new Float64Array(w)
    for (let c = 0; c < w; c++) {
      const lon = (originLon + (col0 + c + 0.5) * resLon) * DEG
      cosLon[c] = Math.cos(lon)
      sinLon[c] = Math.sin(lon)
    }

    const edges = rings(shape)
    let sx = 0
    let sy = 0
    let sz = 0
    let total = 0

    // Scanline fill: for each row, find where the outline crosses the row's
    // center latitude and sum the cells between crossing pairs (even-odd rule).
    for (let r = 0; r < row1 - row0; r++) {
      const lat = originLat + (row0 + r + 0.5) * resLat
      const crossings: number[] = []
      for (const ring of edges) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [lonA, latA] = ring[i]
          const [lonB, latB] = ring[j]
          if (latA > lat !== latB > lat) {
            crossings.push(lonA + ((lat - latA) * (lonB - lonA)) / (latB - latA))
          }
        }
      }
      crossings.sort((a, b) => a - b)

      const cosLat = Math.cos(lat * DEG)
      const sinLat = Math.sin(lat * DEG)
      for (let k = 0; k + 1 < crossings.length; k += 2) {
        const cStart = Math.max(0, Math.ceil((crossings[k] - originLon) / resLon - 0.5) - col0)
        const cEnd = Math.min(w - 1, Math.floor((crossings[k + 1] - originLon) / resLon - 0.5) - col0)
        for (let c = cStart; c <= cEnd; c++) {
          const pop = band[r * w + c]
          if (!(pop > 0) || pop === noData) continue
          sx += pop * cosLat * cosLon[c]
          sy += pop * cosLat * sinLon[c]
          sz += pop * sinLat
          total += pop
        }
      }
    }

    const lon = Math.atan2(sy, sx) / DEG
    const lat = Math.atan2(sz, Math.hypot(sx, sy)) / DEG
    answers[t.id] = {
      lat: Number(lat.toFixed(4)),
      lon: Number(lon.toFixed(4)),
      population: Math.round(total),
    }
    console.log(
      `${t.name.padEnd(12)} ${lat.toFixed(3)}, ${lon.toFixed(3)}  pop ${Math.round(total).toLocaleString()}`,
    )
  }

  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(
    new URL('answers.json', OUT_DIR),
    JSON.stringify({ source: 'GHS-POP E2025 R2023A, 30 arc-second (JRC, CC BY 4.0)', answers }, null, 2) + '\n',
  )
  console.log('Wrote server/data/answers.json')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
