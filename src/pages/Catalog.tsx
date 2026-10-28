import { useEffect, useState } from 'react'
import { api, type Catalog as CatalogData } from '../api'
import { routeHref } from '../router'

type Props = {
  /** Selected category; null shows the first one. */
  category: string | null
}

export function Catalog({ category }: Props) {
  const [catalog, setCatalog] = useState<CatalogData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .getCatalog()
      .then(setCatalog)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Something went wrong.'))
  }, [])

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

  const active = category && catalog.categories.includes(category) ? category : catalog.categories[0]
  const items = catalog.territories.filter((t) => t.categories.includes(active))

  return (
    <div className="catalog rise">
      <p className="instruction">See where people live — and where the center of mass lands.</p>

      <nav className="chips" aria-label="Categories">
        {catalog.categories.map((c) => (
          <a
            key={c}
            className={`chip${c === active ? ' is-active' : ''}`}
            href={routeHref({ page: 'catalog', category: c })}
            aria-current={c === active ? 'page' : undefined}
          >
            {c}
            <span className="chip-count">
              {catalog.territories.filter((t) => t.categories.includes(c)).length}
            </span>
          </a>
        ))}
      </nav>

      <ul className="catalog-grid">
        {items.map((t) => (
          <li key={t.id}>
            <a className="catalog-card" href={routeHref({ page: 'territory', id: t.id })}>
              <span className="catalog-name">{t.name}</span>
              <span className="catalog-region">{t.region}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
