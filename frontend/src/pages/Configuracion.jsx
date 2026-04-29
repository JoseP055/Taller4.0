import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'

const API_BASE =
  import.meta.env.VITE_API_URL || `http://${globalThis.location?.hostname || 'localhost'}:8000`
const ACCESS_TOKEN_KEY = 'ductos_inventory_supabase_access_token'

function authHeaders() {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY)
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

async function fetchJson(path, { signal, method = 'GET', body } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : null),
      ...authHeaders(),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `HTTP ${res.status}`)
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
          <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
            Un usuario se agrega aquí cuando inicia sesión por primera vez. Luego lo activas.
          </div>

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
