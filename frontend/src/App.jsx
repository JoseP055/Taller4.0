import './App.css'
import { Navigate, Route, Routes } from 'react-router-dom'
import RequireAuth from './auth/RequireAuth.jsx'
import AppLayout from './layout/AppLayout.jsx'
import Login from './pages/Login.jsx'
import CreacionFabricacion from './pages/CreacionFabricacion.jsx'
import Configuracion from './pages/Configuracion.jsx'
import MateriasPrimas from './pages/MateriasPrimas.jsx'
import ProductosTerminados from './pages/ProductosTerminados.jsx'
import Subensambles from './pages/Subensambles.jsx'
import SimplePage from './pages/SimplePage.jsx'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<RequireAuth />}>
        <Route path="/app" element={<AppLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<SimplePage title="Dashboard" />} />
          <Route path="analytics" element={<SimplePage title="Analytics" />} />

          <Route
            path="inventario/materias-primas"
            element={<MateriasPrimas />}
          />
          <Route
            path="inventario/subensambles"
            element={<Subensambles />}
          />
          <Route
            path="inventario/productos-terminados"
            element={<ProductosTerminados />}
          />
          <Route
            path="inventario/bobinas-de-lamina"
            element={<SimplePage title="Bobinas de lámina" />}
          />

          <Route
            path="recursos/herramientas"
            element={<SimplePage title="Herramientas" />}
          />
          <Route
            path="recursos/suministros"
            element={<SimplePage title="Suministros" />}
          />
          <Route
            path="recursos/maquinaria"
            element={<SimplePage title="Maquinaria" />}
          />

          <Route
            path="logistica/creacion-fabricacion"
            element={<CreacionFabricacion />}
          />
          <Route
            path="logistica/movimientos"
            element={<SimplePage title="Movimientos" />}
          />

          <Route
            path="configuracion"
            element={<Configuracion />}
          />
        </Route>
      </Route>

      <Route path="/" element={<Navigate to="/app" replace />} />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  )
}

export default App
