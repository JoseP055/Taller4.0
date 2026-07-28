import { useEffect, useMemo, useState } from 'react'
import FilterableTable from '../components/FilterableTable.jsx'

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

function authHeaders() {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY)
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

async function readApiError(res) {
  const text = await res.text().catch(() => '')
  if (!text) return `HTTP ${res.status}`
  try {
    const outer = JSON.parse(text)
    const detail = outer?.detail ?? outer?.message ?? outer
    if (typeof detail === 'string') {
      try {
        const inner = JSON.parse(detail)
        return inner?.message || inner?.error || detail
      } catch {
        return detail
      }
    }
    if (detail && typeof detail === 'object') return detail?.message || JSON.stringify(detail)
    return String(detail)
  } catch {
    return text
  }
}

async function fetchJson(path, { signal } = {}) {
  const res = await fetch(`${API_BASE}${path}`, { signal, headers: authHeaders() })
  if (res.ok) return res.json()
  throw new Error(await readApiError(res))
}

async function fetchApi(path, { method = 'GET', body, signal } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : null), ...authHeaders() },
    body: body ? JSON.stringify(body) : undefined,
    signal,
  })
  if (res.ok) {
    const contentType = res.headers.get('content-type') || ''
    if (contentType.includes('application/json')) return res.json()
    return null
  }
  throw new Error(await readApiError(res))
}

function StatCard({ label, value }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  )
}

function ColaboradorModal({ item, onClose, onSaved }) {
  const [codigo, setCodigo] = useState(item?.codigo || '')
  const [nombre, setNombre] = useState(item?.nombre || '')
  const [apellido, setApellido] = useState(item?.apellido || '')
  const [puesto, setPuesto] = useState(item?.puesto && item.puesto !== '-' ? item.puesto : '')
  const [area, setArea] = useState(item?.area && item.area !== '-' ? item.area : '')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (!codigo.trim() || !nombre.trim() || !apellido.trim()) {
      setError('Código, nombre y apellido son obligatorios.')
      return
    }
    setIsSubmitting(true)
    try {
      const body = {
        codigo_colaborador: codigo.trim().toUpperCase(),
        nombre: nombre.trim().toUpperCase(),
        apellido: apellido.trim().toUpperCase(),
        puesto: puesto.trim() ? puesto.trim().toUpperCase() : null,
        area: area.trim() ? area.trim().toUpperCase() : null,
      }
      if (item) {
        await fetchApi(`/personal/colaboradores/${item.id}`, { method: 'PATCH', body })
      } else {
        await fetchApi('/personal/colaboradores', { method: 'POST', body })
      }
      onSaved()
    } catch (e2) {
      setError(e2?.message || 'No se pudo guardar')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="modal-head">
          <div className="modal-title">{item ? 'Editar colaborador' : 'Nuevo colaborador'}</div>
          <button type="button" className="btn" onClick={onClose}>
            Cerrar
          </button>
        </div>
        <form className="modal-body" onSubmit={submit}>
          <div className="form-grid">
            <label className="field">
              <span>Código</span>
              <input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="COL_001" required />
            </label>
            <label className="field">
              <span>Nombre</span>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
            </label>
            <label className="field">
              <span>Apellido</span>
              <input value={apellido} onChange={(e) => setApellido(e.target.value)} required />
            </label>
            <label className="field">
              <span>Puesto (opcional)</span>
              <input value={puesto} onChange={(e) => setPuesto(e.target.value)} />
            </label>
            <label className="field">
              <span>Área (opcional)</span>
              <input value={area} onChange={(e) => setArea(e.target.value)} />
            </label>
          </div>
          {error ? <div className="form-error">{error}</div> : null}
          <div className="modal-actions">
            <button className="primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Personal() {
  const [items, setItems] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [modalItem, setModalItem] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    const handle = setTimeout(() => {
      setIsLoading(true)
      setError('')
      const qs = new URLSearchParams()
      if (search.trim()) qs.set('search', search.trim())
      fetchJson(`/personal/colaboradores?${qs.toString()}`, { signal: controller.signal })
        .then((data) => setItems(Array.isArray(data) ? data : []))
        .catch((e) => {
          if (controller.signal.aborted) return
          setItems([])
          setError(e?.message || 'No se pudo cargar el personal')
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsLoading(false)
        })
    }, 300)
    return () => {
      controller.abort()
      clearTimeout(handle)
    }
  }, [search, refreshKey])

  const kpis = useMemo(() => {
    const total = items.length
    const activos = items.filter((x) => x.estado === 'Activo').length
    return { total, activos }
  }, [items])

  async function onToggleActivo(x) {
    setError('')
    try {
      await fetchApi(`/personal/colaboradores/${x.id}/activo`, {
        method: 'PATCH',
        body: { activo: x.estado !== 'Activo' },
      })
      setRefreshKey((k) => k + 1)
    } catch (e) {
      setError(e?.message || 'No se pudo actualizar el estado')
    }
  }

  const columns = useMemo(
    () => [
      { key: 'codigo', label: 'Código', render: (x) => <span className="mono">{x.codigo}</span> },
      { key: 'nombre', label: 'Nombre' },
      { key: 'apellido', label: 'Apellido' },
      { key: 'puesto', label: 'Puesto' },
      { key: 'area', label: 'Área' },
      {
        key: 'herramientas_asignadas',
        label: 'Herramientas',
        type: 'number',
        align: 'right',
        className: 'num',
      },
      { key: 'estado', label: 'Estado', type: 'enum', render: (x) => <span className="pill">{x.estado}</span> },
      {
        key: 'accion',
        label: 'Acción',
        filterable: false,
        render: (x) => (
          <div className="actions inline">
            <button
              type="button"
              className="btn icon"
              onClick={() => {
                setModalItem(x)
                setModalOpen(true)
              }}
            >
              Editar
            </button>
            <button type="button" className="btn icon" onClick={() => onToggleActivo(x)}>
              {x.estado === 'Activo' ? 'Desactivar' : 'Activar'}
            </button>
          </div>
        ),
      },
    ],
    [],
  )

  return (
    <section className="inv-page">
      <div className="inv-head">
        <div className="inv-breadcrumbs">Climatisa · Sistema de Inventario</div>
        <div className="inv-title-row">
          <h2 className="inv-title">Personal</h2>
        </div>
      </div>

      {error ? <div className="form-error">{error}</div> : null}

      <div className="stats">
        <StatCard label="Colaboradores registrados" value={isLoading ? '-' : kpis.total} />
        <StatCard label="Activos" value={isLoading ? '-' : kpis.activos} />
      </div>

      <div className="card">
        <div className="table-top">
          <div className="table-filters">
            <input
              className="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar código, nombre, área..."
            />
          </div>
          <button
            className="primary"
            type="button"
            onClick={() => {
              setModalItem(null)
              setModalOpen(true)
            }}
          >
            Agregar
          </button>
        </div>

        <FilterableTable columns={columns} rows={items} isLoading={isLoading} emptyMessage="No hay colaboradores registrados." />
      </div>

      {modalOpen ? (
        <ColaboradorModal
          item={modalItem}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false)
            setRefreshKey((k) => k + 1)
          }}
        />
      ) : null}
    </section>
  )
}
