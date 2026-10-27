import { createRequire } from 'node:module'
import { feature } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import type { LatLon, TerritoryShape } from '../src/api/types.ts'

const require = createRequire(import.meta.url)

type Source = 'states' | 'countries'

const topologies: Record<Source, Topology> = {
  states: require('us-atlas/states-10m.json'),
  countries: require('world-atlas/countries-50m.json'),
}

/** A precomputed population center of mass, as stored in `data/answers.json`. */
export type Answer = LatLon & { population: number }

export type TerritoryInfo = { id: string; name: string; region: string; source: Source }

export const TERRITORIES: TerritoryInfo[] = [
  { id: 'us-colorado', name: 'Colorado', region: 'United States', source: 'states' },
  { id: 'us-texas', name: 'Texas', region: 'United States', source: 'states' },
  { id: 'us-california', name: 'California', region: 'United States', source: 'states' },
  { id: 'poland', name: 'Poland', region: 'Europe', source: 'countries' },
  { id: 'germany', name: 'Germany', region: 'Europe', source: 'countries' },
  { id: 'egypt', name: 'Egypt', region: 'Africa', source: 'countries' },
  { id: 'brazil', name: 'Brazil', region: 'South America', source: 'countries' },
  { id: 'india', name: 'India', region: 'Asia', source: 'countries' },
]

const shapes = new Map<string, TerritoryShape>()

export function getShape(t: TerritoryInfo): TerritoryShape {
  const cached = shapes.get(t.id)
  if (cached) return cached

  const topology = topologies[t.source]
  const collection = topology.objects[t.source] as GeometryCollection
  const geometry = collection.geometries.find(
    (g) => (g.properties as { name?: string } | undefined)?.name === t.name,
  )
  if (!geometry) throw new Error(`No border data for "${t.name}".`)

  const shape = feature(topology, geometry) as TerritoryShape
  shapes.set(t.id, shape)
  return shape
}
