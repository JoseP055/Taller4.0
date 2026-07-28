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

function NuevoTipoModal({ meta, onClose, onSaved }) {
  const subcats = meta?.subcategorias || []
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [unidad, setUnidad] = useState('UND')
  const [codigoSap, setCodigoSap] = useState('')
  const [idSubcategoria, setIdSubcategoria] = useState(subcats[0]?.id ?? '')
  const [codigoPreview, setCodigoPreview] = useState(null)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!idSubcategoria) return
    const controller = new AbortController()
    fetchJson(`/herramientas/next-codigo?id_subcategoria=${encodeURIComponent(idSubcategoria)}`, {
      signal: controller.signal,
    })
      .then((data) => setCodigoPreview(data?.codigo_articulo ?? null))
      .catch((e) => {
        if (controller.signal.aborted) return
        setCodigoPreview(null)
        setError(e?.message || 'No se pudo generar el código')
      })
    return () => controller.abort()
  }, [idSubcategoria])

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (!idSubcategoria) {
      setError('Selecciona una subcategoría.')
      return
    }
    if (!codigoPreview) {
      setError('No se pudo generar el código del artículo.')
      return
    }
    if (!nombre.trim()) {
      setError('El nombre es obligatorio.')
      return
    }
    const codigoSapRaw = codigoSap.trim()
    const codigo_sap = codigoSapRaw ? Number(codigoSapRaw) : null
    if (codigoSapRaw && (!Number.isFinite(codigo_sap) || codigo_sap <= 0)) {
      setError('Código SAP inválido.')
      return
    }
    setIsSubmitting(true)
    try {
      await fetchApi('/herramientas/tipos', {
        method: 'POST',
        body: {
          id_subcategoria: Number(idSubcategoria),
          nombre_base: nombre.trim().toUpperCase(),
          descripcion: descripcion.trim() ? descripcion.trim().toUpperCase() : null,
          unidad_medida: unidad.trim().toUpperCase() || 'UND',
          codigo_sap,
        },
      })
      onSaved()
    } catch (e2) {
      setError(e2?.message || 'No se pudo crear el tipo de herramienta')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="modal-head">
          <div className="modal-title">Nuevo tipo de herramienta</div>
          <button type="button" className="btn" onClick={onClose}>
            Cerrar
          </button>
        </div>
        <form className="modal-body" onSubmit={submit}>
          <div className="form-grid">
            <label className="field">
              <span>Código (Artículo)</span>
              <input value={codigoPreview ? String(codigoPreview) : 'Generando...'} disabled />
            </label>
            <label className="field">
              <span>Código SAP (opcional)</span>
              <input value={codigoSap} onChange={(e) => setCodigoSap(e.target.value)} placeholder="123456" inputMode="numeric" />
            </label>
            <label className="field">
              <span>Subcategoría</span>
              <select
                value={idSubcategoria}
                onChange={(e) => {
                  setCodigoPreview(null)
                  setIdSubcategoria(e.target.value)
                }}
                disabled={!subcats.length}
              >
                {subcats.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Nombre</span>
              <input value={nombre} onChange={(e) => setNombre(e.target.value.toUpperCase())} placeholder="TALADRO INALÁMBRICO" required />
            </label>
            <label className="field">
              <span>Unidad de medida</span>
              <input value={unidad} onChange={(e) => setUnidad(e.target.value.toUpperCase())} placeholder="UND" />
            </label>
            <label className="field">
              <span>Descripción (opcional)</span>
              <input value={descripcion} onChange={(e) => setDescripcion(e.target.value.toUpperCase())} placeholder="Descripción general..." />
            </label>
          </div>
          {error ? <div className="form-error">{error}</div> : null}
          <div className="modal-actions">
            <button className="primary" type="submit" disabled={isSubmitting || !codigoPreview}>
              {isSubmitting ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function NuevaUnidadModal({ meta, onClose, onSaved }) {
  const tipos = meta?.tipos || []
  const ubis = meta?.ubicaciones || []
  const [idArticulo, setIdArticulo] = useState(tipos[0]?.id ?? '')
  const [codigo, setCodigo] = useState('')
  const [idUbicacion, setIdUbicacion] = useState(() => ubis.find((u) => u.codigo === 'HERRAMIENTAS')?.id ?? ubis[0]?.id ?? '')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (!idArticulo) {
      setError('Selecciona un tipo de herramienta.')
      return
    }
    if (!codigo.trim()) {
      setError('El código de la herramienta es obligatorio.')
      return
    }
    setIsSubmitting(true)
    try {
      await fetchApi('/herramientas/unidades', {
        method: 'POST',
        body: {
          id_articulo: Number(idArticulo),
          codigo_herramienta: codigo.trim().toUpperCase(),
          id_ubicacion: idUbicacion ? Number(idUbicacion) : null,
        },
      })
      onSaved()
    } catch (e2) {
      setError(e2?.message || 'No se pudo crear la unidad')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!tipos.length) {
    return (
      <div className="modal-overlay" role="dialog" aria-modal="true">
        <div className="modal">
          <div className="modal-head">
            <div className="modal-title">Nueva unidad de herramienta</div>
            <button type="button" className="btn" onClick={onClose}>
              Cerrar
            </button>
          </div>
          <div className="modal-body">
            <div className="muted">
              Primero crea un tipo de herramienta con el botón &quot;Nuevo tipo&quot;.
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="modal-head">
          <div className="modal-title">Nueva unidad de herramienta</div>
          <button type="button" className="btn" onClick={onClose}>
            Cerrar
          </button>
        </div>
        <form className="modal-body" onSubmit={submit}>
          <div className="form-grid">
            <label className="field">
              <span>Tipo de herramienta</span>
              <select value={idArticulo} onChange={(e) => setIdArticulo(e.target.value)}>
                {tipos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.codigo} — {t.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Código de la unidad</span>
              <input value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} placeholder="HR-001" required />
            </label>
            <label className="field">
              <span>Ubicación</span>
              <select value={idUbicacion} onChange={(e) => setIdUbicacion(e.target.value)}>
                {ubis.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.codigo} — {u.nombre}
                  </option>
                ))}
              </select>
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

function AsignarModal({ meta, herramienta, onClose, onSaved }) {
  const colaboradores = meta?.colaboradores || []
  const [idColaborador, setIdColaborador] = useState(colaboradores[0]?.id ?? '')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (!idColaborador) {
      setError('Selecciona un colaborador.')
      return
    }
    setIsSubmitting(true)
    try {
      await fetchApi(`/herramientas/${herramienta.id}/asignar`, {
        method: 'POST',
        body: { id_colaborador: Number(idColaborador) },
      })
      onSaved()
    } catch (e2) {
      setError(e2?.message || 'No se pudo asignar la herramienta')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="modal-head">
          <div className="modal-title">Asignar {herramienta.codigo} — {herramienta.nombre}</div>
          <button type="button" className="btn" onClick={onClose}>
            Cerrar
          </button>
        </div>
        <form className="modal-body" onSubmit={submit}>
          {colaboradores.length ? (
            <div className="form-grid">
              <label className="field">
                <span>Colaborador</span>
                <select value={idColaborador} onChange={(e) => setIdColaborador(e.target.value)}>
                  {colaboradores.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.codigo} — {c.nombre}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <div className="muted">No hay colaboradores activos. Crea uno en el módulo de Personal.</div>
          )}
          {error ? <div className="form-error">{error}</div> : null}
          <div className="modal-actions">
            <button className="primary" type="submit" disabled={isSubmitting || !colaboradores.length}>
              {isSubmitting ? 'Asignando...' : 'Asignar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Herramientas() {
  const [items, setItems] = useState([])
  const [meta, setMeta] = useState(null)
  const [isLoadingMeta, setIsLoadingMeta] = useState(true)
  const [isLoadingItems, setIsLoadingItems] = useState(true)
  const [filter, setFilter] = useState('Todas')
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const [tipoModalOpen, setTipoModalOpen] = useState(false)
  const [unidadModalOpen, setUnidadModalOpen] = useState(false)
  const [asignarTarget, setAsignarTarget] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    fetchJson('/herramientas/meta', { signal: controller.signal })
      .then((data) => setMeta(data))
      .catch((e) => {
        if (controller.signal.aborted) return
        setError(e?.message || 'No se pudo cargar catálogos')
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingMeta(false)
      })
    return () => controller.abort()
  }, [refreshKey])

  useEffect(() => {
    const controller = new AbortController()
    const handle = setTimeout(() => {
      setIsLoadingItems(true)
      setError('')
      const qs = new URLSearchParams()
      if (search.trim()) qs.set('search', search.trim())
      if (filter !== 'Todas') qs.set('estatus', filter)
      qs.set('limit', '200')
      fetchJson(`/herramientas/items?${qs.toString()}`, { signal: controller.signal })
        .then((data) => setItems(Array.isArray(data?.items) ? data.items : []))
        .catch((e) => {
          if (controller.signal.aborted) return
          setItems([])
          setError(e?.message || 'No se pudo cargar la tabla')
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsLoadingItems(false)
        })
    }, 300)
    return () => {
      controller.abort()
      clearTimeout(handle)
    }
  }, [filter, search, refreshKey])

  const kpis = useMemo(() => {
    const total = items.length
    const disponibles = items.filter((x) => x.estado === 'DISPONIBLE').length
    const asignadas = items.filter((x) => x.estado === 'ASIGNADA').length
    return { total, disponibles, asignadas }
  }, [items])

  async function onDevolver(x) {
    setError('')
    try {
      await fetchApi(`/herramientas/${x.id}/devolver`, { method: 'POST', body: {} })
      setRefreshKey((k) => k + 1)
    } catch (e) {
      setError(e?.message || 'No se pudo devolver la herramienta')
    }
  }

  const columns = useMemo(
    () => [
      { key: 'codigo', label: 'Código', render: (x) => <span className="mono">{x.codigo}</span> },
      { key: 'nombre', label: 'Nombre' },
      { key: 'tipo', label: 'Tipo' },
      { key: 'estado', label: 'Estado', type: 'enum', render: (x) => <span className="pill">{x.estado}</span> },
      { key: 'ubicacion', label: 'Ubicación' },
      { key: 'asignado_a', label: 'Asignado a', value: (x) => x.asignado_a || '-' },
      {
        key: 'accion',
        label: 'Acción',
        filterable: false,
        render: (x) =>
          x.estado === 'DISPONIBLE' ? (
            <button type="button" className="btn icon" onClick={() => setAsignarTarget(x)}>
              Asignar
            </button>
          ) : x.estado === 'ASIGNADA' ? (
            <button type="button" className="btn icon" onClick={() => onDevolver(x)}>
              Devolver
            </button>
          ) : null,
      },
    ],
    [],
  )

  return (
    <section className="inv-page">
      <div className="inv-head">
        <div className="inv-breadcrumbs">Climatisa · Sistema de Inventario</div>
        <div className="inv-title-row">
          <h2 className="inv-title">Herramientas</h2>
        </div>
      </div>

      {error ? <div className="form-error">{error}</div> : null}

      <div className="stats">
        <StatCard label="Unidades registradas" value={isLoadingItems ? '-' : kpis.total} />
        <StatCard label="Disponibles" value={isLoadingItems ? '-' : kpis.disponibles} />
        <StatCard label="Asignadas" value={isLoadingItems ? '-' : kpis.asignadas} />
      </div>

      <div className="card">
        <div className="table-top">
          <div className="table-filters">
            <div className="segmented" role="tablist" aria-label="Filtro de estado">
              <button type="button" className={filter === 'Todas' ? 'seg active' : 'seg'} onClick={() => setFilter('Todas')}>
                Todas
              </button>
              <button type="button" className={filter === 'DISPONIBLE' ? 'seg active' : 'seg'} onClick={() => setFilter('DISPONIBLE')}>
                Disponibles
              </button>
              <button type="button" className={filter === 'ASIGNADA' ? 'seg active' : 'seg'} onClick={() => setFilter('ASIGNADA')}>
                Asignadas
              </button>
            </div>
            <input
              className="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar código o nombre..."
            />
          </div>
          <div className="actions">
            <button className="btn" type="button" onClick={() => setTipoModalOpen(true)} disabled={isLoadingMeta}>
              Nuevo tipo
            </button>
            <button className="primary" type="button" onClick={() => setUnidadModalOpen(true)} disabled={isLoadingMeta}>
              Agregar unidad
            </button>
          </div>
        </div>

        <FilterableTable
          columns={columns}
          rows={items}
          isLoading={isLoadingItems}
          emptyMessage="No hay herramientas registradas."
        />
      </div>

      {tipoModalOpen ? (
        <NuevoTipoModal
          meta={meta}
          onClose={() => setTipoModalOpen(false)}
          onSaved={() => {
            setTipoModalOpen(false)
            setRefreshKey((k) => k + 1)
          }}
        />
      ) : null}

      {unidadModalOpen ? (
        <NuevaUnidadModal
          meta={meta}
          onClose={() => setUnidadModalOpen(false)}
          onSaved={() => {
            setUnidadModalOpen(false)
            setRefreshKey((k) => k + 1)
          }}
        />
      ) : null}

      {asignarTarget ? (
        <AsignarModal
          meta={meta}
          herramienta={asignarTarget}
          onClose={() => setAsignarTarget(null)}
          onSaved={() => {
            setAsignarTarget(null)
            setRefreshKey((k) => k + 1)
          }}
        />
      ) : null}
    </section>
  )
}
