import { useMemo, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'

export default function Login() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const from = useMemo(() => {
    const state = location.state
    if (state && typeof state.from === 'string') return state.from
    return '/app/dashboard'
  }, [location.state])

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (user) return <Navigate to="/app/dashboard" replace />

  function onSubmit(e) {
    e.preventDefault()
    setError('')
    setIsSubmitting(true)
    const result = login(username.trim(), password)
    setIsSubmitting(false)

    if (!result.ok) {
      setError(result.message || 'No se pudo iniciar sesión')
      return
    }

    navigate(from, { replace: true })
  }

  return (
    <main className="login">
      <form className="login-card" onSubmit={onSubmit}>
        <div className="login-title">
          <h1>Control de Inventario</h1>
          <p>Fábrica de ductos</p>
        </div>

        <label className="field">
          <span>Usuario</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            placeholder="admin"
            required
          />
        </label>

        <label className="field">
          <span>Contraseña</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="admin"
            required
          />
        </label>

        {error ? <div className="form-error">{error}</div> : null}

        <button className="primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>
    </main>
  )
}
