import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson'

/**
 * The contract between the frontend and the backend.
 *
 * Everything the UI needs from a server is described here. The backend should
 * implement these shapes (see `http.ts` for the routes).
 *
 * All locations are geographic (lat/lon). Projecting onto the screen is purely
 * a frontend concern, and computing the answer is purely a backend concern —
 * in the game, the true center of mass only comes back from `submitGuess`.
 */

/** A geographic location in degrees. */
export type LatLon = { lat: number; lon: number }

/** GeoJSON outline of a territory (lon/lat coordinates, RFC 7946). */
export type TerritoryShape = Feature<Polygon | MultiPolygon>

export type Territory = {
  id: string
  name: string
  region: string
  shape: TerritoryShape
}

/**
 * Population density on a lat/lon grid (row 0 = north), for the heat map.
 * For territories crossing the antimeridian, `east` (and maybe `west`) exceed 180.
 */
export type DensityGrid = {
  west: number
  south: number
  east: number
  north: number
  width: number
  height: number
  /** Base64, one byte per cell: 0 = no people, 1–255 = log-scaled density, low to high */
  values: string
}

export type GuessResult = {
  /** The true population-weighted center of mass */
  trueCom: LatLon
  /**
   * Population spread, treating it as a 2D normal around the CoM (39% of
   * people live within 1σ). The score scales with it; rings show 1σ, 2σ, 3σ.
   */
  sigmaKm: number
  /** Great-circle distance between the guess and the true CoM */
  distanceKm: number
  /** 0–1000 */
  score: number
  /** One grid per group of nearby parts (e.g. mainland France, Réunion, …) */
  density: DensityGrid[]
}

export type CatalogEntry = {
  id: string
  name: string
  region: string
  /** Catalog groups this territory belongs to, e.g. ["Countries", "Europe"] */
  categories: string[]
  /** Name of the world preview map feature containing this territory */
  mapName: string | null
}

export type Catalog = {
  /** Category names in display order */
  categories: string[]
  /** Sorted by name */
  territories: CatalogEntry[]
}

/** Everything about one territory, answer included — for the catalog only. */
export type CatalogDetail = {
  territory: Territory
  trueCom: LatLon
  /** See `GuessResult.sigmaKm` */
  sigmaKm: number
  population: number
  areaKm2: number
  density: DensityGrid[]
}

/** One day's hand-picked rounds, the same for everyone. */
export type DailyGame = {
  /** YYYY-MM-DD */
  date: string
  /** 1 for the first scheduled day, counting up by one per calendar day */
  number: number
  rounds: Territory[]
}

/** Low-detail outlines of every country, for catalog previews. */
export type WorldMap = FeatureCollection<Polygon | MultiPolygon, { name: string | null }>

export type TerritoryQuery = {
  /** A specific territory */
  id?: string
  /** A random territory within this catalog category */
  category?: string
}

export interface GameApi {
  /** Fetch a territory to play: a specific one, or a random one (optionally within a category). */
  getTerritory(query?: TerritoryQuery): Promise<Territory>
  /** Submit a guess for a territory and get the scored result. */
  submitGuess(territoryId: string, guess: LatLon): Promise<GuessResult>
  /** List every territory, grouped into categories. */
  getCatalog(): Promise<Catalog>
  /** One territory with its answer and heat map. */
  getCatalogDetail(id: string): Promise<CatalogDetail>
  /** Low-detail world map for catalog previews. */
  getWorld(): Promise<WorldMap>
  /** The daily game for a local calendar date (YYYY-MM-DD). */
  getDaily(date: string): Promise<DailyGame>
}

export class ApiError extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}
