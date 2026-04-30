import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'

const API_BASE = (() => {
  const env = String(import.meta.env.VITE_API_URL || '').trim()
  const locHost = globalThis.location?.hostname || 'localhost'
  const fallback = `http://${locHost}:8000`
  if (!env) return fallback
  try {
    const u = new URL(env)
    const envHost = u.hostname
    const isLocalEnv = envHost === 'localhost' || envHost === '127.0.0.1'
    const isLocalPage = locHost === 'localhost' || locHost === '127.0.0.1'
    if (isLocalEnv && !isLocalPage) {
      u.hostname = locHost
      return u.toString().replace(/\/+$/, '')
    }
    return env.replace(/\/+$/, '')
  } catch {
    return env
  }
})()
const ACCESS_TOKEN_KEY = 'ductos_inventory_supabase_access_token'
const STORAGE_SESSION = 'ductos_inventory_supabase_session'
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

function authHeaders() {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY)
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

function parseBackendErrorText(text) {
  if (!text) return ''
  try {
    const outer = JSON.parse(text)
    const detail = outer?.detail ?? outer?.message ?? outer
    if (typeof detail === 'string') {
      try {
        const inner = JSON.parse(detail)
        return inner?.msg || inner?.message || inner?.error || detail
      } catch {
        return detail
      }
    }
    if (detail && typeof detail === 'object') return detail?.msg || detail?.message || JSON.stringify(detail)
    return String(detail)
  } catch {
    return text
  }
}

function isExpiredJwtErrorText(text) {
  const t = String(text || '')
  return t.includes('"error_code":"bad_jwt"') && (t.toLowerCase().includes('expired') || t.toLowerCase().includes('expir'))
}

async function refreshAccessTokenFromSession() {
  const raw = localStorage.getItem(STORAGE_SESSION)
  const session = raw ? JSON.parse(raw) : null
  const refresh = session?.refresh_token
  if (!refresh) return null
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null
  const res = await fetch(
    `${String(SUPABASE_URL).replace(/\/+$/, '')}/auth/v1/token?grant_type=refresh_token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ refresh_token: refresh }),
    },
  )
  if (!res.ok) return null
  const data = await res.json()
  const nextExpiresAt = Date.now() + Number(data.expires_in || 0) * 1000
  const nextSession = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    token_type: data.token_type,
    expires_at: nextExpiresAt,
    user: data.user || session?.user || null,
  }
  localStorage.setItem(STORAGE_SESSION, JSON.stringify(nextSession))
  localStorage.setItem(ACCESS_TOKEN_KEY, nextSession?.access_token ? String(nextSession.access_token) : '')
  return String(nextSession.access_token || '')
}

async function fetchJson(path, { signal, method = 'GET', body } = {}) {
  const doFetch = async () => {
    return fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : null),
        ...authHeaders(),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal,
    })
  }

  const res = await doFetch()
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    if ((res.status === 401 || res.status === 403) && isExpiredJwtErrorText(text)) {
      const nextToken = await refreshAccessTokenFromSession()
      if (nextToken) {
        const retry = await doFetch()
        if (!retry.ok) {
          const text2 = await retry.text().catch(() => '')
          throw new Error(parseBackendErrorText(text2) || `HTTP ${retry.status}`)
        }
        return retry.json()
      }
    }
    throw new Error(parseBackendErrorText(text) || `HTTP ${res.status}`)
  }
  return res.json()
}

function formatDate(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('es-ES')
}

export default function Configuracion() {
  const { role, user } = useAuth()
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [users, setUsers] = useState([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    setError('')
    setIsLoading(true)
    fetchJson('/admin/app-users', { signal: controller.signal })
      .then((data) => setUsers(Array.isArray(data?.users) ? data.users : []))
      .catch((e) => {
        if (controller.signal.aborted) return
        setUsers([])
        setError(e?.message || 'No se pudo cargar usuarios')
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })
    return () => controller.abort()
  }, [refreshKey])

  const rows = useMemo(() => {
    return users.map((u) => ({
      user_id: u.user_id,
      email: u.email || '',
      role: u.role || 'user',
      active: Boolean(u.active),
      created_at: u.created_at || '',
      updated_at: u.updated_at || '',
    }))
  }, [users])

  async function updateUser(user_id, patch) {
    setError('')
    setIsSaving(true)
    try {
      await fetchJson(`/admin/app-users/${encodeURIComponent(user_id)}`, {
        method: 'PATCH',
        body: patch,
      })
      setRefreshKey((k) => k + 1)
    } catch (e) {
      setError(e?.message || 'No se pudo guardar')
    } finally {
      setIsSaving(false)
    }
  }

  async function deleteUser(user_id) {
    setError('')
    if (!globalThis.confirm('¿Eliminar este usuario del sistema?')) return
    setIsSaving(true)
    try {
      await fetchJson(`/admin/app-users/${encodeURIComponent(user_id)}`, { method: 'DELETE' })
      setRefreshKey((k) => k + 1)
    } catch (e) {
      setError(e?.message || 'No se pudo eliminar')
    } finally {
      setIsSaving(false)
    }
  }

  if (role !== 'admin') {
    return (
      <section className="page">
        <header className="page-header">
          <h2>Configuración</h2>
        </header>
        <div className="page-body">
          <div className="card">
            <p>No autorizado.</p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="page">
      <header className="page-header">
        <h2>Configuración</h2>
      </header>

      <div className="page-body">
        {error ? <div className="form-error">{error}</div> : null}

        <div className="card">
          <div className="card-title">Usuarios (Supabase Auth)</div>

          <div className="modal-actions" style={{ marginBottom: 10 }}>
            <button
              className="btn"
              type="button"
              onClick={() => setRefreshKey((k) => k + 1)}
              disabled={isLoading || isSaving}
            >
              Recargar
            </button>
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Correo</th>
                  <th>Rol</th>
                  <th>Activo</th>
                  <th>Creado</th>
                  <th>Actualizado</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="empty">
                      Cargando...
                    </td>
                  </tr>
                ) : rows.length ? (
                  rows.map((r) => (
                    <tr key={r.user_id}>
                      <td className="mono">{r.email || r.user_id}</td>
                      <td>
                        <select
                          value={r.role}
                          onChange={(e) => updateUser(r.user_id, { role: e.target.value })}
                          disabled={isSaving}
                        >
                          <option value="user">user</option>
                          <option value="admin">admin</option>
                          <option value="zebra">zebra</option>
                        </select>
                      </td>
                      <td>
                        <select
                          value={r.active ? 'true' : 'false'}
                          onChange={(e) =>
                            updateUser(r.user_id, { active: e.target.value === 'true' })
                          }
                          disabled={isSaving}
                        >
                          <option value="true">SI</option>
                          <option value="false">NO</option>
                        </select>
                      </td>
                      <td>{formatDate(r.created_at)}</td>
                      <td>{formatDate(r.updated_at)}</td>
                      <td>
                        <button
                          className="btn icon"
                          type="button"
                          onClick={() => deleteUser(r.user_id)}
                          disabled={isSaving || String(user?.id || '') === String(r.user_id)}
                          title={
                            String(user?.id || '') === String(r.user_id)
                              ? 'No puedes eliminar tu propio usuario'
                              : 'Eliminar'
                          }
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="empty">
                      Sin usuarios registrados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  )
}
