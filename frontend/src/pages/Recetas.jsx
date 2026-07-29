import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import FilterableTable from '../components/FilterableTable.jsx'
import ItemPicker from '../components/ItemPicker.jsx'

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

function asNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function formatNumber(n) {
  return new Intl.NumberFormat('es-ES').format(n)
}

function normalizeItems(data) {
  const rows = Array.isArray(data?.items) ? data.items : []
  return rows.map((x) => ({
    id: x.id,
    codigo: String(x.codigo ?? ''),
    nombre: x.nombre ?? '',
    medida: x.medida ?? '',
  }))
}

function formatInsumoLabel(item) {
  const medida = String(item.medida || '').trim()
  return medida ? `${item.codigo} — ${item.nombre} (${medida})` : `${item.codigo} — ${item.nombre}`
}

function sortByNombre(a, b) {
  return `${a.nombre}`.localeCompare(`${b.nombre}`)
}

function RecetaFormModal({ ptOptions, materiasPrimas, subensambles, initial, onClose, onSaved }) {
  const [ptId, setPtId] = useState(initial ? String(initial.id_producto_terminado) : '')
  const [nombre, setNombre] = useState(initial?.nombre || '')
  const [items, setItems] = useState(
    initial?.items?.length
      ? initial.items.map((it) => ({ id_articulo: String(it.id_articulo), cantidad_por_unidad: String(it.cantidad_por_unidad) }))
      : [],
  )
  const [insumoSearch, setInsumoSearch] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const ptOptionsOrdenados = useMemo(() => [...ptOptions].sort(sortByNombre), [ptOptions])

  const insumoOptions = useMemo(() => {
    const mp = materiasPrimas.map((a) => ({ ...a, subcategoria: 'Materia prima' }))
    const sub = subensambles.map((a) => ({ ...a, subcategoria: 'Subensamble' }))
    return [...mp, ...sub].sort(sortByNombre)
  }, [materiasPrimas, subensambles])

  const filteredInsumos = useMemo(() => {
    const term = insumoSearch.trim().toLowerCase()
    if (!term) return insumoOptions
    return insumoOptions.filter((a) => `${a.codigo} ${a.nombre} ${a.medida}`.toLowerCase().includes(term))
  }, [insumoOptions, insumoSearch])

  function addInsumo(idArticulo) {
    setItems((prev) => {
      if (prev.some((it) => it.id_articulo === String(idArticulo))) return prev
      return [...prev, { id_articulo: String(idArticulo), cantidad_por_unidad: '' }]
    })
  }

  function removeInsumo(idArticulo) {
    setItems((prev) => prev.filter((it) => it.id_articulo !== String(idArticulo)))
  }

  function updateCantidad(idArticulo, value) {
    setItems((prev) => prev.map((it) => (it.id_articulo === String(idArticulo) ? { ...it, cantidad_por_unidad: value } : it)))
  }

  async function submit(e) {
    e.preventDefault()
    setError('')
    const parsedItems = items
      .filter((it) => it.id_articulo && it.cantidad_por_unidad)
      .map((it) => ({ id_articulo: Number(it.id_articulo), cantidad_por_unidad: Number(it.cantidad_por_unidad) }))
    if (!ptId || !nombre.trim() || parsedItems.length === 0) {
      setError('Completa producto terminado, nombre y al menos un insumo.')
      return
    }
    setIsSubmitting(true)
    try {
      const body = { id_producto_terminado: Number(ptId), nombre: nombre.trim().toUpperCase(), items: parsedItems }
      if (initial) {
        await fetchApi(`/logistica/recetas/${initial.id_receta}`, { method: 'PATCH', body })
      } else {
        await fetchApi('/logistica/recetas', { method: 'POST', body })
      }
      onSaved()
    } catch (e2) {
      setError(e2?.message || 'No se pudo guardar la receta')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal" style={{ maxWidth: 720 }}>
        <div className="modal-head">
          <div className="modal-title">{initial ? 'Editar receta' : 'Nueva receta'}</div>
          <button type="button" className="btn" onClick={onClose}>
            Cerrar
          </button>
        </div>
        <form className="modal-body" onSubmit={submit}>
          <div className="form-grid">
            <label className="field">
              <span>Producto terminado</span>
              <select value={ptId} onChange={(e) => setPtId(e.target.value)} disabled={isSubmitting}>
                <option value="">Selecciona…</option>
                {ptOptionsOrdenados.map((p) => (
                  <option key={p.id} value={p.id}>
                    {formatInsumoLabel(p)}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Nombre de la receta</span>
              <input value={nombre} onChange={(e) => setNombre(e.target.value.toUpperCase())} disabled={isSubmitting} />
            </label>

            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <span>Buscar insumo (materia prima o subensamble)</span>
              <input
                value={insumoSearch}
                onChange={(e) => setInsumoSearch(e.target.value)}
                placeholder="Buscar por nombre, código o medida..."
                disabled={isSubmitting}
              />
              <div style={{ marginTop: 8 }}>
                <ItemPicker
                  items={filteredInsumos}
                  selectedId={null}
                  onPick={(id) => addInsumo(id)}
                  disabled={isSubmitting}
                  pageSize={5}
                  resetKey={`insumo:${insumoSearch}`}
                  emptyText="No hay insumos que coincidan con la búsqueda."
                />
              </div>
            </div>

            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <span>Insumos de la receta</span>
              {items.length ? (
                items.map((it) => {
                  const insumo = insumoOptions.find((a) => String(a.id) === it.id_articulo)
                  return (
                    <div
                      key={it.id_articulo}
                      style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}
                    >
                      <div style={{ flex: 1, minWidth: 220 }}>
                        {insumo ? formatInsumoLabel(insumo) : `Artículo #${it.id_articulo}`}
                      </div>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        placeholder="cantidad por unidad"
                        value={it.cantidad_por_unidad}
                        onChange={(e) => updateCantidad(it.id_articulo, e.target.value)}
                        disabled={isSubmitting}
                        style={{ maxWidth: 180 }}
                      />
                      <button
                        type="button"
                        className="btn"
                        onClick={() => removeInsumo(it.id_articulo)}
                        disabled={isSubmitting}
                      >
                        Quitar
                      </button>
                    </div>
                  )
                })
              ) : (
                <div className="muted" style={{ marginTop: 6 }}>
                  Buscá arriba y elegí los insumos que necesita esta receta.
                </div>
              )}
            </div>
          </div>

          {error ? <div className="form-error">{error}</div> : null}

          <div className="modal-actions">
            <button className="primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando...' : initial ? 'Guardar cambios' : 'Crear receta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function DisponibilidadPanel({ receta }) {
  const [cantidad, setCantidad] = useState('1')

  const qty = useMemo(() => {
    const n = Number(cantidad)
    return cantidad === '' ? null : Number.isNaN(n) ? NaN : n
  }, [cantidad])

  const preview = useMemo(() => {
    if (!receta || qty === null || Number.isNaN(qty)) return []
    return (receta.items || []).map((it) => {
      const necesario = asNumber(it.cantidad_por_unidad, 0) * qty
      const restante = asNumber(it.stock_actual, 0) - necesario
      return { ...it, necesario, restante, insuficiente: restante < 0 }
    })
  }, [receta, qty])

  const puedeFabricar = preview.length > 0 && !preview.some((it) => it.insuficiente)

  if (!receta) {
    return (
      <div className="card">
        <div className="card-title">Disponibilidad</div>
        <div className="muted">Selecciona una receta de la tabla para ver su disponibilidad.</div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-title">
        Disponibilidad — {receta.producto_terminado} · {receta.nombre}
      </div>

      <label className="field" style={{ maxWidth: 220 }}>
        <span>Cantidad a simular</span>
        <input type="number" min="0" step="any" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
      </label>

      {preview.length ? (
        <>
          <div className={puedeFabricar ? 'badge success' : 'badge'} style={{ marginTop: 10, marginBottom: 10 }}>
            {puedeFabricar ? '✅ Se puede fabricar' : '⚠ Faltan insumos'}
          </div>
          <div className="kv">
            {preview.map((it) => (
              <div className="kv-row" key={it.id_articulo}>
                <div className="kv-k">
                  {it.nombre}
                  {it.medida ? ` ${it.medida}` : ''}
                </div>
                <div className="kv-v" style={it.insuficiente ? { color: 'var(--danger, #c0392b)' } : undefined}>
                  necesita {formatNumber(it.necesario)} {it.unidad_medida} · disponible {formatNumber(asNumber(it.stock_actual, 0))}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="muted">Ingresa una cantidad válida para simular.</div>
      )}
    </div>
  )
}

export default function Recetas() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'

  const [recetas, setRecetas] = useState([])
  const [productosTerminados, setProductosTerminados] = useState([])
  const [subensambles, setSubensambles] = useState([])
  const [materiasPrimas, setMateriasPrimas] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const [selectedId, setSelectedId] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [formInitial, setFormInitial] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    setIsLoading(true)
    setError('')

    const qs = new URLSearchParams({ estatus: 'Todas', limit: '200', offset: '0', search: '' })
    const requests = [
      fetchJson(`/inventario/productos-terminados/items?${qs.toString()}`, { signal: controller.signal }),
      fetchJson(`/inventario/subensambles/items?${qs.toString()}`, { signal: controller.signal }),
      fetchApi('/logistica/recetas', { signal: controller.signal }),
      ...(isAdmin ? [fetchJson(`/inventario/materias-primas/items?${qs.toString()}`, { signal: controller.signal })] : []),
    ]

    Promise.all(requests)
      .then(([ptData, subData, recetasData, mpData]) => {
        setProductosTerminados(normalizeItems(ptData))
        setSubensambles(normalizeItems(subData))
        setRecetas(Array.isArray(recetasData) ? recetasData : [])
        setMateriasPrimas(isAdmin && mpData ? normalizeItems(mpData) : [])
      })
      .catch((e) => {
        if (controller.signal.aborted) return
        setError(e?.message || 'No se pudieron cargar las recetas')
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })

    return () => controller.abort()
  }, [refreshKey, isAdmin])

  const selectedReceta = useMemo(() => recetas.find((r) => r.id_receta === selectedId) || null, [recetas, selectedId])

  async function onToggleActiva(r) {
    setError('')
    try {
      await fetchApi(`/logistica/recetas/${r.id_receta}/activa`, { method: 'PATCH', body: { activa: !r.activa } })
      setRefreshKey((k) => k + 1)
    } catch (e) {
      setError(e?.message || 'No se pudo cambiar el estado de la receta')
    }
  }

  async function onDelete(r) {
    setError('')
    try {
      await fetchApi(`/logistica/recetas/${r.id_receta}`, { method: 'DELETE' })
      if (selectedId === r.id_receta) setSelectedId(null)
      setRefreshKey((k) => k + 1)
    } catch (e) {
      setError(e?.message || 'No se pudo eliminar la receta')
    }
  }

  const columns = useMemo(
    () => [
      {
        key: 'producto_terminado',
        label: 'Producto terminado',
        render: (r) => (r.pt_medida ? `${r.producto_terminado} (${r.pt_medida})` : r.producto_terminado),
      },
      { key: 'nombre', label: 'Receta' },
      {
        key: 'insumos',
        label: '# Insumos',
        type: 'number',
        align: 'right',
        className: 'num',
        value: (r) => (Array.isArray(r.items) ? r.items.length : 0),
      },
      {
        key: 'activa',
        label: 'Estado',
        type: 'enum',
        value: (r) => (r.activa ? 'Activa' : 'Inactiva'),
        render: (r) => <span className="pill">{r.activa ? 'Activa' : 'Inactiva'}</span>,
      },
      {
        key: 'accion',
        label: 'Acción',
        filterable: false,
        render: (r) => (
          <div className="actions inline">
            <button type="button" className="btn icon" onClick={() => setSelectedId(r.id_receta)}>
              Ver
            </button>
            {isAdmin ? (
              <>
                <button
                  type="button"
                  className="btn icon"
                  onClick={() => {
                    setFormInitial(r)
                    setFormOpen(true)
                  }}
                >
                  Editar
                </button>
                <button type="button" className="btn icon" onClick={() => onToggleActiva(r)}>
                  {r.activa ? 'Desactivar' : 'Activar'}
                </button>
                <button type="button" className="btn icon" onClick={() => onDelete(r)}>
                  Eliminar
                </button>
              </>
            ) : null}
          </div>
        ),
      },
    ],
    [isAdmin],
  )

  return (
    <section className="page">
      <header className="page-header">
        <h2>Recetas</h2>
      </header>

      <div className="page-body">
        {error ? <div className="form-error">{error}</div> : null}

        <div className="card">
          <div className="table-top">
            <div className="card-title" style={{ marginBottom: 0 }}>
              Gestión de recetas
            </div>
            {isAdmin ? (
              <button
                className="primary"
                type="button"
                onClick={() => {
                  setFormInitial(null)
                  setFormOpen(true)
                }}
              >
                + Nueva receta
              </button>
            ) : null}
          </div>

          <FilterableTable
            columns={columns}
            rows={recetas}
            isLoading={isLoading}
            emptyMessage="No hay recetas registradas."
            rowKey={(r) => r.id_receta}
          />
        </div>

        <DisponibilidadPanel receta={selectedReceta} />

        <div className="card">
          <div className="muted">
            Para ejecutar una fabricación con una receta activa, ve a{' '}
            <Link to="/app/logistica/creacion-fabricacion">Creación/Fabricación</Link>.
          </div>
        </div>
      </div>

      {formOpen ? (
        <RecetaFormModal
          ptOptions={productosTerminados}
          materiasPrimas={materiasPrimas}
          subensambles={subensambles}
          initial={formInitial}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false)
            setRefreshKey((k) => k + 1)
          }}
        />
      ) : null}
    </section>
  )
}
