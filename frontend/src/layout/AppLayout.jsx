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

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-main">
        <div className="topbar">
          <div className="topbar-title">{title}</div>
        </div>
        <div className="app-content">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
