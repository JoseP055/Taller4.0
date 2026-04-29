import { useMemo, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'

export default function Login() {
  const { user, login, register, allowedEmailDomains } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const from = useMemo(() => {
    const state = location.state
    if (state && typeof state.from === 'string') return state.from
    return '/app'
  }, [location.state])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [mode, setMode] = useState('login')

  if (user) return <Navigate to="/app" replace />

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setMessage('')
    setIsSubmitting(true)
    if (mode === 'register') {
      const result = await register(email.trim(), password)
      setIsSubmitting(false)
      if (!result.ok) {
        setError(result.message || 'No se pudo registrar')
        return
      }
      setMessage('Cuenta creada. Revisa tu correo para confirmar (también spam). Luego inicia sesión.')
      setMode('login')
      setPassword('')
      return
    }
    const result = await login(email.trim(), password)
    setIsSubmitting(false)

    if (!result.ok) {
      setError(result.message || 'No se pudo iniciar sesión')
      return
    }
    const role = result?.appUser?.role || 'user'
    const target = role === 'zebra' ? '/app/logistica/creacion-fabricacion' : from
    navigate(target, { replace: true })
  }

  return (
    <main className="login">
      <form className="login-card" onSubmit={onSubmit}>
        <div className="login-title">
          <h1>Climatisa</h1>
          <p>Control de Inventario · Fábrica de ductos</p>
        </div>

        <label className="field">
          <span>Correo</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder={`usuario@${allowedEmailDomains?.[0] || 'climatisa.com'}`}
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
            placeholder=""
            required
          />
        </label>

        {mode === 'register' ? (
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.35 }}>
            Solo correos corporativos ({(allowedEmailDomains || []).join(', ')}). Contraseña mínimo 10 caracteres y con números.
          </div>
        ) : null}

        {message ? (
          <div className="card" style={{ padding: 12 }}>
            <p style={{ margin: 0 }}>{message}</p>
          </div>
        ) : null}
        {error ? <div className="form-error">{error}</div> : null}

        <button className="primary" type="submit" disabled={isSubmitting}>
          {mode === 'register'
            ? isSubmitting
              ? 'Creando cuenta...'
              : 'Crear cuenta'
            : isSubmitting
              ? 'Ingresando...'
              : 'Ingresar'}
        </button>

        <button
          className="btn"
          type="button"
          onClick={() => {
            setError('')
            setMessage('')
            setMode((m) => (m === 'login' ? 'register' : 'login'))
          }}
          disabled={isSubmitting}
        >
          {mode === 'login' ? 'Crear cuenta' : 'Ya tengo cuenta'}
        </button>
      </form>
    </main>
  )
}
