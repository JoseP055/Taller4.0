import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'

function linkClassName({ isActive }) {
  return isActive ? 'nav-link active' : 'nav-link'
}

export default function Sidebar({ isOpen = false, onClose = () => {} }) {
  const { logout, role } = useAuth()
  const navigate = useNavigate()
  const isZebra = role === 'zebra'
  const onNav = () => onClose()

  function onLogout() {
    logout()
    onClose()
    navigate('/login', { replace: true })
  }

  return (
    <>
      {isOpen ? (
        <div className="sidebar-overlay" role="button" tabIndex={-1} onClick={onClose} />
      ) : null}
      <aside className={`sidebar${isOpen ? ' open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">
            <div className="brand-logo">
              <img src="/LogoClimatisaSVG.svg" alt="Climatisa" />
            </div>
            <div className="brand-meta">
              <div className="brand-title">Climatisa</div>
              <div className="brand-subtitle">Inventario · Operación</div>
            </div>
          </div>
        </div>

        <nav className="nav">
          {!isZebra ? (
            <>
              <NavLink to="/app/dashboard" className={linkClassName} end onClick={onNav}>
              Dashboard
              </NavLink>

              <NavLink to="/app/analytics" className={linkClassName} onClick={onNav}>
              Analytics
              </NavLink>

              <details className="nav-group" open>
              <summary className="nav-group-title">Inventario</summary>
              <div className="nav-group-items">
                <NavLink to="/app/inventario/materias-primas" className={linkClassName} onClick={onNav}>
                  Materias primas
                </NavLink>
                <NavLink to="/app/inventario/subensambles" className={linkClassName} onClick={onNav}>
                  Subensambles
                </NavLink>
                <NavLink to="/app/inventario/productos-terminados" className={linkClassName} onClick={onNav}>
                  Productos terminados
                </NavLink>
                <NavLink to="/app/inventario/bobinas-de-lamina" className={linkClassName} onClick={onNav}>
                  Bobinas de lámina
                </NavLink>
              </div>
            </details>

            <details className="nav-group" open>
              <summary className="nav-group-title">Recursos</summary>
              <div className="nav-group-items">
                <NavLink to="/app/recursos/herramientas" className={linkClassName} onClick={onNav}>
                  Herramientas
                </NavLink>
                <NavLink to="/app/recursos/suministros" className={linkClassName} onClick={onNav}>
                  Suministros
                </NavLink>
                <NavLink to="/app/recursos/maquinaria" className={linkClassName} onClick={onNav}>
                  Maquinaria
                </NavLink>
              </div>
            </details>
            </>
          ) : null}

        <details className="nav-group" open>
          <summary className="nav-group-title">Logística</summary>
          <div className="nav-group-items">
            <NavLink
              to="/app/logistica/creacion-fabricacion"
              className={linkClassName}
              onClick={onNav}
            >
              Creación/Fabricación
            </NavLink>
            <NavLink to="/app/logistica/movimientos" className={linkClassName} onClick={onNav}>
              Movimientos
            </NavLink>
          </div>
        </details>
      </nav>

      <div className="sidebar-footer">
        {role === 'admin' ? (
          <NavLink to="/app/configuracion" className={linkClassName} onClick={onNav}>
            Configuración
          </NavLink>
        ) : null}
        <button className="nav-link danger" type="button" onClick={onLogout}>
          Cerrar sesión
        </button>
      </div>
      </aside>
    </>
  )
}
