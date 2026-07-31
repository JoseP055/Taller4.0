import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import {
  IconHome,
  IconDashboard,
  IconTrendingUp,
  IconBox,
  IconLayers,
  IconPackageCheck,
  IconRoll,
  IconClipboardList,
  IconWrench,
  IconCog,
  IconUsers,
  IconFactory,
  IconPackageDown,
  IconSwap,
  IconSliders,
  IconLogout,
  IconChevronsLeft,
} from '../components/icons.jsx'

function linkClassName({ isActive }) {
  return isActive ? 'nav-link active' : 'nav-link'
}

function NavItem({ to, icon, label, onClick, end }) {
  return (
    <NavLink to={to} className={linkClassName} onClick={onClick} end={end} aria-label={label} title={label}>
      <span className="nav-icon">{icon}</span>
      <span className="nav-label">{label}</span>
    </NavLink>
  )
}

export default function Sidebar({ isOpen = false, onClose = () => {}, collapsed = false, onToggleCollapse = () => {} }) {
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
      <aside className={`sidebar${isOpen ? ' open' : ''}${collapsed ? ' collapsed' : ''}`}>
        <div className="brand">
          <div className="brand-mark">
            <div className="brand-logo">
              <img src="/LogoClimatisaSVG.svg" alt="Climatisa" />
            </div>
            <div className="brand-meta">
              <div className="brand-title">Climatisa</div>
              <div className="brand-subtitle">Inventario · Operación</div>
            </div>
            <button
              type="button"
              className="sidebar-collapse-btn"
              onClick={onToggleCollapse}
              aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
              title={collapsed ? 'Expandir menú' : 'Contraer menú'}
            >
              <IconChevronsLeft style={{ transform: collapsed ? 'rotate(180deg)' : 'none' }} />
            </button>
          </div>
        </div>

        <nav className="nav">
          {!isZebra ? (
            <>
              <NavItem to="/app/home" icon={<IconHome />} label="Inicio" onClick={onNav} />
              <NavItem to="/app/dashboard" icon={<IconDashboard />} label="Dashboard" onClick={onNav} end />
              <NavItem to="/app/analytics" icon={<IconTrendingUp />} label="Analytics" onClick={onNav} />

              <details className="nav-group" open>
                <summary className="nav-group-title">Inventario</summary>
                <div className="nav-group-items">
                  <NavItem to="/app/inventario/materias-primas" icon={<IconBox />} label="Materias primas" onClick={onNav} />
                  <NavItem to="/app/inventario/subensambles" icon={<IconLayers />} label="Subensambles" onClick={onNav} />
                  <NavItem
                    to="/app/inventario/productos-terminados"
                    icon={<IconPackageCheck />}
                    label="Productos terminados"
                    onClick={onNav}
                  />
                  <NavItem to="/app/inventario/bobinas-de-lamina" icon={<IconRoll />} label="Bobinas de lámina" onClick={onNav} />
                </div>
              </details>

              <details className="nav-group" open>
                <summary className="nav-group-title">Recursos</summary>
                <div className="nav-group-items">
                  <NavItem to="/app/recursos/herramientas" icon={<IconWrench />} label="Herramientas" onClick={onNav} />
                  <NavItem to="/app/recursos/maquinaria" icon={<IconCog />} label="Maquinaria" onClick={onNav} />
                  <NavItem to="/app/recursos/personal" icon={<IconUsers />} label="Personal" onClick={onNav} />
                </div>
              </details>

              <NavItem to="/app/recetas" icon={<IconClipboardList />} label="Recetas" onClick={onNav} />
            </>
          ) : null}

          <details className="nav-group" open>
            <summary className="nav-group-title">Logística</summary>
            <div className="nav-group-items">
              <NavItem
                to="/app/logistica/creacion-fabricacion"
                icon={<IconFactory />}
                label="Creación/Fabricación"
                onClick={onNav}
              />
              <NavItem
                to="/app/logistica/ingreso-materias-primas"
                icon={<IconPackageDown />}
                label="Ingreso materias primas"
                onClick={onNav}
              />
              <NavItem to="/app/logistica/movimientos" icon={<IconSwap />} label="Movimientos" onClick={onNav} />
            </div>
          </details>
        </nav>

        <div className="sidebar-footer">
          {role === 'admin' ? (
            <NavItem to="/app/configuracion" icon={<IconSliders />} label="Configuración" onClick={onNav} />
          ) : null}
          <button className="nav-link danger" type="button" onClick={onLogout} aria-label="Cerrar sesión" title="Cerrar sesión">
            <span className="nav-icon">
              <IconLogout />
            </span>
            <span className="nav-label">Cerrar sesión</span>
          </button>
        </div>
      </aside>
    </>
  )
}
