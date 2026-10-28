/**
 * Catalog region cards. `category` must match a category name from the API
 * (see CATEGORIES in backend/territories.py); `bounds` frames the preview map
 * as [west, south, east, north] in degrees.
 */
export type Region = {
  title: string
  category: string
  /** Label for the browse row, e.g. "Countries" or "States" */
  itemLabel: string
  bounds: [number, number, number, number]
}

export const REGIONS: Region[] = [
  { title: 'Europe', category: 'Europe', itemLabel: 'Countries', bounds: [-12, 35, 42, 66] },
  { title: 'North America', category: 'North America', itemLabel: 'Countries & states', bounds: [-135, 12, -55, 62] },
  { title: 'South America', category: 'South America', itemLabel: 'Countries', bounds: [-84, -45, -34, 12] },
  { title: 'World', category: 'Countries', itemLabel: 'Countries', bounds: [-165, -50, 175, 75] },
  { title: 'Africa', category: 'Africa', itemLabel: 'Countries', bounds: [-20, -36, 52, 38] },
  { title: 'Asia', category: 'Asia', itemLabel: 'Countries', bounds: [30, -8, 145, 55] },
  { title: 'Oceania', category: 'Oceania', itemLabel: 'Countries', bounds: [110, -48, 180, -5] },
  { title: 'The U.S.', category: 'US States', itemLabel: 'States', bounds: [-125, 24, -66, 50] },
]

export function regionForCategory(category: string): Region | undefined {
  return REGIONS.find((r) => r.category === category)
}
