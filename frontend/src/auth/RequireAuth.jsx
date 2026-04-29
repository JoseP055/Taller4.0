import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'

export default function RequireAuth() {
  const { user, appUser, isApproved, isLoading, logout, refreshMe, authError } = useAuth()
  const location = useLocation()
  const email = user?.email || ''

  if (isLoading) {
    return (
      <section className="page">
        <header className="page-header">
          <h2>Cargando...</h2>
        </header>
        <div className="page-body">
          <div className="card">
            <p>Validando sesión.</p>
          </div>
        </div>
      </section>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (!appUser) {
    return (
      <section className="page">
        <header className="page-header">
          <h2>Cargando...</h2>
        </header>
        <div className="page-body">
          <div className="card">
            <p>Validando acceso.</p>
          </div>
        </div>
      </section>
    )
  }

  if (!isApproved) {
    return (
      <section className="page">
        <header className="page-header">
          <h2>Acceso pendiente</h2>
        </header>
        <div className="page-body">
          <div className="card">
            <p>Tu usuario está pendiente de aprobación.</p>
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              {email ? `Correo: ${email}` : ''}
            </p>
            <p className="muted" style={{ fontSize: 13 }}>
              Estado: {appUser ? (appUser.active ? 'ACTIVO' : 'PENDIENTE') : 'SIN REGISTRO'}
            </p>
            {authError ? (
              <div className="form-error" style={{ marginTop: 10 }}>
                {authError}
              </div>
            ) : null}
            <div className="modal-actions">
              <button className="primary" type="button" onClick={refreshMe}>
                Reintentar
              </button>
              <button className="btn" type="button" onClick={logout}>
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      </section>
    )
  }

  return <Outlet />
}
