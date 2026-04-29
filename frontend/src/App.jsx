import './App.css'
import { Navigate, Route, Routes } from 'react-router-dom'
import RequireAuth from './auth/RequireAuth.jsx'
import { useAuth } from './auth/AuthContext.jsx'
import AppLayout from './layout/AppLayout.jsx'
import Login from './pages/Login.jsx'
import CreacionFabricacion from './pages/CreacionFabricacion.jsx'
import Configuracion from './pages/Configuracion.jsx'
import MateriasPrimas from './pages/MateriasPrimas.jsx'
import ProductosTerminados from './pages/ProductosTerminados.jsx'
import Subensambles from './pages/Subensambles.jsx'
import Movimientos from './pages/Movimientos.jsx'
import SimplePage from './pages/SimplePage.jsx'

function IndexRedirect() {
  const { role } = useAuth()
  if (role === 'zebra') return <Navigate to="logistica/creacion-fabricacion" replace />
  return <Navigate to="dashboard" replace />
}

function RequireRole({ allow, children }) {
  const { role } = useAuth()
  const ok = Array.isArray(allow) ? allow.includes(role) : false
  if (ok) return children
  if (role === 'zebra') return <Navigate to="/app/logistica/creacion-fabricacion" replace />
  return <Navigate to="/app/dashboard" replace />
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<RequireAuth />}>
        <Route path="/app" element={<AppLayout />}>
          <Route index element={<IndexRedirect />} />
          <Route
            path="dashboard"
            element={
              <RequireRole allow={['admin', 'user']}>
                <SimplePage title="Dashboard" />
              </RequireRole>
            }
          />
          <Route
            path="analytics"
            element={
              <RequireRole allow={['admin', 'user']}>
                <SimplePage title="Analytics" />
              </RequireRole>
            }
          />

          <Route
            path="inventario/materias-primas"
            element={
              <RequireRole allow={['admin', 'user']}>
                <MateriasPrimas />
              </RequireRole>
            }
          />
          <Route
            path="inventario/subensambles"
            element={
              <RequireRole allow={['admin', 'user']}>
                <Subensambles />
              </RequireRole>
            }
          />
          <Route
            path="inventario/productos-terminados"
            element={
              <RequireRole allow={['admin', 'user']}>
                <ProductosTerminados />
              </RequireRole>
            }
          />
          <Route
            path="inventario/bobinas-de-lamina"
            element={
              <RequireRole allow={['admin', 'user']}>
                <SimplePage title="Bobinas de lámina" />
              </RequireRole>
            }
          />

          <Route
            path="recursos/herramientas"
            element={
              <RequireRole allow={['admin', 'user']}>
                <SimplePage title="Herramientas" />
              </RequireRole>
            }
          />
          <Route
            path="recursos/suministros"
            element={
              <RequireRole allow={['admin', 'user']}>
                <SimplePage title="Suministros" />
              </RequireRole>
            }
          />
          <Route
            path="recursos/maquinaria"
            element={
              <RequireRole allow={['admin', 'user']}>
                <SimplePage title="Maquinaria" />
              </RequireRole>
            }
          />

          <Route
            path="logistica/creacion-fabricacion"
            element={<CreacionFabricacion />}
          />
          <Route
            path="logistica/movimientos"
            element={<Movimientos />}
          />

          <Route
            path="configuracion"
            element={
              <RequireRole allow={['admin']}>
                <Configuracion />
              </RequireRole>
            }
          />
        </Route>
      </Route>

      <Route path="/" element={<Navigate to="/app" replace />} />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  )
}

export default App
