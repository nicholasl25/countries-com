import { useEffect, useMemo, useState } from 'react'
import { api, type Catalog as CatalogData, type WorldMap } from '../api'
import { RegionCard } from '../components/RegionCard'
import { REGIONS, regionForCategory } from '../regions'
import { routeHref } from '../router'

type Props = {
  /** Show this category's territories; null shows the region cards. */
  category: string | null
}

export function Catalog({ category }: Props) {
  const [catalog, setCatalog] = useState<CatalogData | null>(null)
  const [world, setWorld] = useState<WorldMap | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .getCatalog()
      .then(setCatalog)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Something went wrong.'))
    // The previews are decoration; the catalog works without them.
    api.getWorld().then(setWorld, () => {})
  }, [])

  const highlights = useMemo(
    () =>
      new Map(
        REGIONS.map((r) => [
          r.category,
          new Set(
            catalog?.territories.filter((t) => t.categories.includes(r.category)).map((t) => t.name),
          ),
        ]),
      ),
    [catalog],
  )

  if (error) {
    return (
      <div className="state" role="alert">
        <p className="state-title">Couldn’t load the catalog</p>
        <p className="state-body">{error}</p>
      </div>
    )
  }

  if (!catalog) {
    return (
      <p className="state" role="status">
        Loading catalog…
      </p>
    )
  }

  const inCategory = (c: string) => catalog.territories.filter((t) => t.categories.includes(c))

  if (!category) {
    return (
      <div className="catalog rise">
        <p className="instruction">See where people live — and where the center of mass lands.</p>
        <div className="region-grid">
          {REGIONS.map((r) => (
            <RegionCard
              key={r.title}
              region={r}
              world={world}
              count={inCategory(r.category).length}
              highlight={highlights.get(r.category) ?? new Set()}
            />
          ))}
        </div>
      </div>
    )
  }

  const items = inCategory(category)
  const title = regionForCategory(category)?.title ?? category

  return (
    <div className="catalog rise">
      <div className="catalog-head">
        <a className="back-link" href={routeHref({ page: 'catalog', category: null })}>
          ← All regions
        </a>
        <h1 className="catalog-title">{title}</h1>
        {items.length > 0 && (
          <a className="btn btn-primary" href={routeHref({ page: 'random', category })}>
            Play random
          </a>
        )}
      </div>

      {items.length === 0 ? (
        <p className="state">Nothing here yet.</p>
      ) : (
        <ul className="catalog-grid">
          {items.map((t) => (
            <li key={t.id}>
              <a className="catalog-card" href={routeHref({ page: 'territory', id: t.id, category })}>
                <span className="catalog-name">{t.name}</span>
                <span className="catalog-region">{t.region}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
