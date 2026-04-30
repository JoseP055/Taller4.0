import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'

const TITLES_BY_PATH = [
  { prefix: '/app/dashboard', title: 'Dashboard' },
  { prefix: '/app/analytics', title: 'Analytics' },
  { prefix: '/app/inventario/materias-primas', title: 'Materias primas' },
  { prefix: '/app/inventario/subensambles', title: 'Subensambles' },
  { prefix: '/app/inventario/productos-terminados', title: 'Productos terminados' },
  { prefix: '/app/inventario/bobinas-de-lamina', title: 'Bobinas de lámina' },
  { prefix: '/app/recursos/herramientas', title: 'Herramientas' },
  { prefix: '/app/recursos/suministros', title: 'Suministros' },
  { prefix: '/app/recursos/maquinaria', title: 'Maquinaria' },
  { prefix: '/app/logistica/creacion-fabricacion', title: 'Creación/Fabricación' },
  { prefix: '/app/logistica/movimientos', title: 'Movimientos' },
  { prefix: '/app/configuracion', title: 'Configuración' },
]

function resolveTitle(pathname) {
  const found = TITLES_BY_PATH.find((t) => pathname.startsWith(t.prefix))
  return found ? found.title : 'Panel'
}

export default function AppLayout() {
  const location = useLocation()
  const title = resolveTitle(location.pathname)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light')

  useEffect(() => {
    setIsSidebarOpen(false)
  }, [location.pathname])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('climatisa_theme', theme)
  }, [theme])

  return (
    <div className="app-shell">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <div className="app-main">
        <div className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="topbar-menu-btn"
              onClick={() => setIsSidebarOpen(true)}
              aria-label="Abrir menú"
            >
              ☰
            </button>
            <div className="topbar-brand">
              <img src="/LogoClimatisaSVG.svg" alt="Climatisa" />
              <div className="topbar-title">{title}</div>
            </div>
          </div>
          <div className="topbar-right">
            <button
              type="button"
              className="icon-btn"
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
            >
              {theme === 'dark' ? '☀' : '☾'}
            </button>
          </div>
        </div>
        <div className="app-content">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
