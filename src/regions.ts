/**
 * Catalog region cards. `category` must match a category name from the API
 * (see CATEGORIES in backend/territories.py); `bounds` frames the preview map
 * as [west, south, east, north] in degrees.
 */
export type Region = {
  title: string
  category: string
  /** Heading the card is listed under on the catalog page (see SECTIONS) */
  section: Section
  /** Label for the browse row, e.g. "Countries" or "States" */
  itemLabel: string
  bounds: [number, number, number, number]
}

/** Catalog headings, in page order. */
export const SECTIONS = ['Worldwide', 'By continent', 'States & Territories'] as const
export type Section = (typeof SECTIONS)[number]

export const REGIONS: Region[] = [
  { title: 'World', category: 'Countries', section: 'Worldwide', itemLabel: 'Countries', bounds: [-165, -50, 175, 75] },
  { title: 'Continents', category: 'Continents', section: 'Worldwide', itemLabel: 'Continents', bounds: [-165, -50, 175, 75] },
  { title: 'Africa', category: 'Africa', section: 'By continent', itemLabel: 'Countries', bounds: [-20, -36, 52, 38] },
  { title: 'Asia', category: 'Asia', section: 'By continent', itemLabel: 'Countries', bounds: [30, -8, 145, 55] },
  { title: 'Europe', category: 'Europe', section: 'By continent', itemLabel: 'Countries', bounds: [-12, 35, 42, 66] },
  { title: 'North America', category: 'North America', section: 'By continent', itemLabel: 'Countries', bounds: [-135, 12, -55, 62] },
  { title: 'Oceania', category: 'Oceania', section: 'By continent', itemLabel: 'Countries', bounds: [110, -48, 180, -5] },
  { title: 'South America', category: 'South America', section: 'By continent', itemLabel: 'Countries', bounds: [-84, -45, -34, 12] },
  { title: 'The U.S.', category: 'US States', section: 'States & Territories', itemLabel: 'States', bounds: [-125, 24, -66, 50] },
]

export function regionForCategory(category: string): Region | undefined {
  return REGIONS.find((r) => r.category === category)
}
