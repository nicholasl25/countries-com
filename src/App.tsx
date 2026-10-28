import { Catalog } from './pages/Catalog'
import { CatalogTerritory } from './pages/CatalogTerritory'
import { RandomGame } from './pages/RandomGame'
import { routeHref, useRoute, type Route } from './router'
import './styles.css'

const MENU: { label: string; route: Route; matches: Route['page'][]; soon?: boolean }[] = [
  { label: 'Daily Game', route: { page: 'daily' }, matches: ['daily'], soon: true },
  { label: 'Random', route: { page: 'random' }, matches: ['random', 'play'] },
  { label: 'Catalog', route: { page: 'catalog', category: null }, matches: ['catalog', 'territory'] },
]

export default function App() {
  const route = useRoute()

  return (
    <div className="page">
      <div className="atmosphere" aria-hidden="true" />

      <header className="mast">
        <div className="mast-inner">
        <a className="brand" href={routeHref({ page: 'random' })}>
          Countries<span className="brand-dot">.</span>CoM (Center of Mass)
        </a>
        <nav className="menu" aria-label="Main">
          {MENU.map((item) => {
            const active = item.matches.includes(route.page)
            return (
              <a
                key={item.label}
                className={`menu-item${active ? ' is-active' : ''}`}
                href={routeHref(item.route)}
                aria-current={active ? 'page' : undefined}
              >
                {item.label}
                {item.soon && <span className="menu-soon">Soon</span>}
              </a>
            )
          })}
        </nav>
        </div>
      </header>

      <main className="stage">
        {route.page === 'random' && <RandomGame key="random" />}
        {route.page === 'play' && <RandomGame key={`play-${route.id}`} territoryId={route.id} />}
        {route.page === 'catalog' && <Catalog category={route.category} />}
        {route.page === 'territory' && <CatalogTerritory id={route.id} />}
        {route.page === 'daily' && (
          <div className="state rise">
            <p className="state-title">Daily Game</p>
            <p className="state-body">Coming soon — one territory a day, same for everyone.</p>
            <a className="btn" href={routeHref({ page: 'random' })}>
              Play Random instead
            </a>
          </div>
        )}
      </main>

      <footer className="foot">
        <p>Population data: GHS-POP 2025, European Commission JRC (CC BY 4.0).</p>
      </footer>
    </div>
  )
}
