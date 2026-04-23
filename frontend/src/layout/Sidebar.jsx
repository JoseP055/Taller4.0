import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'

function linkClassName({ isActive }) {
  return isActive ? 'nav-link active' : 'nav-link'
}

export default function Sidebar() {
  const { logout } = useAuth()
  const navigate = useNavigate()

  function onLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-title">Inventario Ductos</div>
      </div>

      <nav className="nav">
        <NavLink to="/app/dashboard" className={linkClassName} end>
          Dashboard
        </NavLink>

        <NavLink to="/app/analytics" className={linkClassName}>
          Analytics
        </NavLink>

        <details className="nav-group" open>
          <summary className="nav-group-title">Inventario</summary>
          <div className="nav-group-items">
            <NavLink
              to="/app/inventario/materias-primas"
              className={linkClassName}
            >
              Materias primas
            </NavLink>
            <NavLink to="/app/inventario/subensambles" className={linkClassName}>
              Subensambles
            </NavLink>
            <NavLink
              to="/app/inventario/productos-terminados"
              className={linkClassName}
            >
              Productos terminados
            </NavLink>
            <NavLink
              to="/app/inventario/bobinas-de-lamina"
              className={linkClassName}
            >
              Bobinas de lámina
            </NavLink>
          </div>
        </details>

        <details className="nav-group" open>
          <summary className="nav-group-title">Recursos</summary>
          <div className="nav-group-items">
            <NavLink to="/app/recursos/herramientas" className={linkClassName}>
              Herramientas
            </NavLink>
            <NavLink to="/app/recursos/suministros" className={linkClassName}>
              Suministros
            </NavLink>
            <NavLink to="/app/recursos/maquinaria" className={linkClassName}>
              Maquinaria
            </NavLink>
          </div>
        </details>
      </nav>

      <div className="sidebar-footer">
        <NavLink to="/app/configuracion" className={linkClassName}>
          Configuración
        </NavLink>
        <button className="nav-link danger" type="button" onClick={onLogout}>
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
