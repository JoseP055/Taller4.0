import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'

const CARDS = [
  { to: '/app/dashboard', icon: '📊', title: 'Dashboard', desc: 'Resumen general del sistema' },
  { to: '/app/analytics', icon: '📈', title: 'Analytics', desc: 'Movimientos y tendencias' },
  { to: '/app/inventario/materias-primas', icon: '🧱', title: 'Materias primas', desc: 'Inventario de insumos' },
  { to: '/app/inventario/subensambles', icon: '🔧', title: 'Subensambles', desc: 'Piezas semi-terminadas' },
  { to: '/app/inventario/productos-terminados', icon: '📦', title: 'Productos terminados', desc: 'Inventario final' },
  { to: '/app/inventario/bobinas-de-lamina', icon: '🧻', title: 'Bobinas de lámina', desc: 'Control de bobinas' },
  { to: '/app/recetas', icon: '📋', title: 'Recetas', desc: 'BOM y disponibilidad' },
  { to: '/app/recursos/herramientas', icon: '🛠️', title: 'Herramientas', desc: 'Unidades y asignaciones' },
  { to: '/app/recursos/personal', icon: '👷', title: 'Personal', desc: 'Colaboradores' },
  { to: '/app/recursos/maquinaria', icon: '⚙️', title: 'Maquinaria', desc: 'Equipos de planta' },
  { to: '/app/logistica/creacion-fabricacion', icon: '🏭', title: 'Creación/Fabricación', desc: 'Fabricar con recetas' },
  { to: '/app/logistica/movimientos', icon: '🔄', title: 'Movimientos', desc: 'Entradas y salidas' },
]

const ADMIN_CARD = { to: '/app/configuracion', icon: '⚙', title: 'Configuración', desc: 'Usuarios y accesos' }

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
              <div className="home-card-icon">{c.icon}</div>
              <div className="home-card-title">{c.title}</div>
              <div className="home-card-desc">{c.desc}</div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
