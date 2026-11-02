import { useEffect, useState } from 'react'
import { api, type CatalogDetail } from '../api'
import { HeatLegend, TerritoryMap } from '../components/TerritoryMap'
import { formatKm, formatLatLon } from '../geo'
import { regionForCategory } from '../regions'
import { routeHref } from '../router'

type Props = {
  id: string
  /** Category the user came from, for the back link */
  category: string | null
}

export function CatalogTerritory({ id, category }: Props) {
  const [detail, setDetail] = useState<CatalogDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDetail(null)
    setError(null)
    api
      .getCatalogDetail(id)
      .then(setDetail)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Something went wrong.'))
  }, [id])

  const { territory } = detail ?? {}

  return (
    <div className="catalog-detail rise">
      <a className="back-link" href={routeHref({ page: 'catalog', category })}>
        ← {category ? (regionForCategory(category)?.title ?? category) : 'Catalog'}
      </a>

      <p className="place">
        {territory && (
          <>
            {territory.name}
            <span className="place-region">, {territory.region}</span>
          </>
        )}
      </p>

      <div className={`board${detail ? '' : ' is-loading'}`}>
        {error && (
          <div className="state" role="alert">
            <p className="state-title">Couldn’t load this territory</p>
            <p className="state-body">{error}</p>
          </div>
        )}
        {!detail && !error && (
          <div className="state" role="status">
            <div className="skeleton-map" />
          </div>
        )}
        {detail && territory && (
          <TerritoryMap
            key={territory.id}
            shape={territory.shape}
            label={`Population heat map of ${territory.name}`}
            trueCom={detail.trueCom}
            sigmaKm={detail.sigmaKm}
            density={detail.density}
          />
        )}
      </div>

      {detail && territory && (
        <div className="meta">
          <HeatLegend />
          <dl className="facts">
            <div>
              <dt>Center of mass</dt>
              <dd>{formatLatLon(detail.trueCom)}</dd>
            </div>
            <div>
              <dt>Population</dt>
              <dd>{detail.population.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Area</dt>
              <dd>{detail.areaKm2.toLocaleString()} km²</dd>
            </div>
            <div>
              <dt>Density</dt>
              <dd>{Math.round(detail.population / detail.areaKm2).toLocaleString()} / km²</dd>
            </div>
            <div className="facts-wide">
              <dt>
                Spread <span className="no-caps">σ</span> (rings at 1, 2, 3
                <span className="no-caps">σ</span>)
              </dt>
              <dd>{formatKm(detail.sigmaKm)}</dd>
            </div>
          </dl>
          <a className="btn btn-primary" href={routeHref({ page: 'play', id: territory.id })}>
            Play {territory.name}
          </a>
        </div>
      )}
    </div>
  )
}
