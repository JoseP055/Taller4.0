import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'

export default function RequireAuth() {
  const { user, appUser, isApproved, isLoading, logout, refreshMe, authError } = useAuth()
  const location = useLocation()
  const email = user?.email || ''

  if (isLoading) {
    return (
      <main className="stage">
        <div className="stage-card">
          <div className="stage-brand">
            <img src="/LogoClimatisaSVG.svg" alt="Climatisa" />
            <div>
              <div className="brand-title">Climatisa</div>
              <div className="brand-subtitle">Validando sesión…</div>
            </div>
          </div>
          <div className="spinner" aria-hidden="true"></div>
        </div>
      </main>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (!appUser) {
    if (authError) {
      return (
        <main className="stage">
          <div className="stage-card">
            <div className="stage-brand">
              <img src="/LogoClimatisaSVG.svg" alt="Climatisa" />
              <div>
                <div className="brand-title">Acceso pendiente</div>
                <div className="brand-subtitle">Tu cuenta aún no está habilitada</div>
              </div>
            </div>
            <div className="kv" style={{ marginTop: 8 }}>
              <div className="kv-row">
                <div className="kv-k">Correo</div>
                <div className="kv-v">{email || '-'}</div>
              </div>
              <div className="kv-row">
                <div className="kv-k">Estado</div>
                <div className="kv-v">SIN REGISTRO</div>
              </div>
            </div>
            <div className="form-error" style={{ marginTop: 12 }}>
              {authError}
            </div>
            <div className="modal-actions" style={{ marginTop: 12 }}>
              <button className="primary" type="button" onClick={refreshMe}>
                Reintentar
              </button>
              <button className="btn" type="button" onClick={logout}>
                Cerrar sesión
              </button>
            </div>
          </div>
        </main>
      )
    }

    return (
      <main className="stage">
        <div className="stage-card">
          <div className="stage-brand">
            <img src="/LogoClimatisaSVG.svg" alt="Climatisa" />
            <div>
              <div className="brand-title">Climatisa</div>
              <div className="brand-subtitle">Validando acceso…</div>
            </div>
          </div>
          <div className="spinner" aria-hidden="true"></div>
        </div>
      </main>
    )
  }

  if (!isApproved) {
    return (
      <main className="stage">
        <div className="stage-card">
          <div className="stage-brand">
            <img src="/LogoClimatisaSVG.svg" alt="Climatisa" />
            <div>
              <div className="brand-title">Acceso pendiente</div>
              <div className="brand-subtitle">Tu cuenta requiere aprobación</div>
            </div>
          </div>
          <div className="kv" style={{ marginTop: 8 }}>
            <div className="kv-row">
              <div className="kv-k">Correo</div>
              <div className="kv-v">{email || '-'}</div>
            </div>
            <div className="kv-row">
              <div className="kv-k">Estado</div>
              <div className="kv-v">{appUser ? (appUser.active ? 'ACTIVO' : 'PENDIENTE') : 'SIN REGISTRO'}</div>
            </div>
          </div>
          {authError ? (
            <div className="form-error" style={{ marginTop: 12 }}>
              {authError}
            </div>
          ) : null}
          <div className="modal-actions" style={{ marginTop: 12 }}>
            <button className="primary" type="button" onClick={refreshMe}>
              Reintentar
            </button>
            <button className="btn" type="button" onClick={logout}>
              Cerrar sesión
            </button>
          </div>
        </div>
      </main>
    )
  }

  return <Outlet />
}
