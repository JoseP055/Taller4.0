import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import {
  IconDashboard,
  IconTrendingUp,
  IconBox,
  IconLayers,
  IconPackageCheck,
  IconRoll,
  IconClipboardList,
  IconWrench,
  IconUsers,
  IconCog,
  IconFactory,
  IconSwap,
  IconSliders,
} from '../components/icons.jsx'

const CARDS = [
  { to: '/app/dashboard', Icon: IconDashboard, title: 'Dashboard', desc: 'Resumen general del sistema' },
  { to: '/app/analytics', Icon: IconTrendingUp, title: 'Analytics', desc: 'Movimientos y tendencias' },
  { to: '/app/inventario/materias-primas', Icon: IconBox, title: 'Materias primas', desc: 'Inventario de insumos' },
  { to: '/app/inventario/subensambles', Icon: IconLayers, title: 'Subensambles', desc: 'Piezas semi-terminadas' },
  { to: '/app/inventario/productos-terminados', Icon: IconPackageCheck, title: 'Productos terminados', desc: 'Inventario final' },
  { to: '/app/inventario/bobinas-de-lamina', Icon: IconRoll, title: 'Bobinas de lámina', desc: 'Control de bobinas' },
  { to: '/app/recetas', Icon: IconClipboardList, title: 'Recetas', desc: 'BOM y disponibilidad' },
  { to: '/app/recursos/herramientas', Icon: IconWrench, title: 'Herramientas', desc: 'Unidades y asignaciones' },
  { to: '/app/recursos/personal', Icon: IconUsers, title: 'Personal', desc: 'Colaboradores' },
  { to: '/app/recursos/maquinaria', Icon: IconCog, title: 'Maquinaria', desc: 'Equipos de planta' },
  { to: '/app/logistica/creacion-fabricacion', Icon: IconFactory, title: 'Creación/Fabricación', desc: 'Fabricar con recetas' },
  { to: '/app/logistica/movimientos', Icon: IconSwap, title: 'Movimientos', desc: 'Entradas y salidas' },
]

const ADMIN_CARD = { to: '/app/configuracion', Icon: IconSliders, title: 'Configuración', desc: 'Usuarios y accesos' }

export default function Home() {
  const { role } = useAuth()
  const cards = role === 'admin' ? [...CARDS, ADMIN_CARD] : CARDS

  return (
    <section className="page">
      <header className="page-header">
        <h2>Inicio</h2>
      </header>
      <div className="page-body">
        <div className="card-grid">
          {cards.map((c) => (
            <Link className="home-card" to={c.to} key={c.to}>
              <div className="home-card-icon">
                <c.Icon />
              </div>
              <div className="home-card-title">{c.title}</div>
              <div className="home-card-desc">{c.desc}</div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
