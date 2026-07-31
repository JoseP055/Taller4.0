import { useEffect, useMemo, useState } from 'react'
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
const STORAGE_SESSION = 'ductos_inventory_supabase_session'
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

function authHeaders() {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY)
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

function isExpiredJwtErrorText(text) {
  const t = String(text || '')
  return (
    t.includes('"error_code":"bad_jwt"') &&
    (t.toLowerCase().includes('expired') || t.toLowerCase().includes('expir'))
  )
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
    if (detail && typeof detail === 'object') {
      return detail?.message || JSON.stringify(detail)
    }
    return String(detail)
  } catch {
    return text
  }
}

async function fetchJson(path, { signal } = {}) {
  const doFetch = async () => fetch(`${API_BASE}${path}`, { signal, headers: authHeaders() })
  const res = await doFetch()
  if (res.ok) return res.json()
  const text = await res.text().catch(() => '')
  if ((res.status === 401 || res.status === 403) && isExpiredJwtErrorText(text)) {
    const nextToken = await refreshAccessTokenFromSession()
    if (nextToken) {
      const retry = await doFetch()
      if (!retry.ok) throw new Error(await readApiError(retry))
      return retry.json()
    }
  }
  throw new Error(await readApiError(new Response(text, { status: res.status })))
}

async function fetchApi(path, { method = 'GET', body, signal } = {}) {
  const doFetch = async () =>
    fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : null),
        ...authHeaders(),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal,
    })
  const res = await doFetch()
  if (res.ok) {
    const contentType = res.headers.get('content-type') || ''
    if (contentType.includes('application/json')) return res.json()
    return null
  }
  const text = await res.text().catch(() => '')
  if ((res.status === 401 || res.status === 403) && isExpiredJwtErrorText(text)) {
    const nextToken = await refreshAccessTokenFromSession()
    if (nextToken) {
      const retry = await doFetch()
      if (!retry.ok) throw new Error(await readApiError(retry))
      const contentType = retry.headers.get('content-type') || ''
      if (contentType.includes('application/json')) return retry.json()
      return null
    }
  }
  throw new Error(await readApiError(new Response(text, { status: res.status })))
}

function formatNumber(n) {
  return new Intl.NumberFormat('es-ES').format(n)
}

function asNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function normalizeItems(data) {
  const rows = Array.isArray(data?.items) ? data.items : []
  return rows.map((x) => ({
    id: x.id,
    codigo: String(x.codigo ?? ''),
    nombre: x.nombre ?? '',
    subcategoria: x.subcategoria ?? '',
    medida: x.medida ?? '',
    cantidad: asNumber(x.cantidad, 0),
    unidad: x.unidad ?? '',
    minStock: asNumber(x.min_stock, 0),
    maxStock: asNumber(x.max_stock, 0),
    ubicacion: x.ubicacion ?? '',
    estado: x.estatus ?? 'Disponible',
  }))
}

function SuccessModal({ open, title, children, onAccept }) {
  if (!open) return null
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal" style={{ maxWidth: 860 }}>
        <div className="modal-head">
          <div className="modal-title">{title}</div>
          <button type="button" className="btn" onClick={onAccept}>
            Aceptar
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

function ItemInfo({ title, item }) {
  if (!item) {
    return (
      <div className="card">
        <div className="card-title">{title}</div>
        <div className="muted">Selecciona un artículo.</div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-title">{title}</div>
      <div className="kv">
        <div className="kv-row">
          <div className="kv-k">Código</div>
          <div className="kv-v mono">{item.codigo}</div>
        </div>
        <div className="kv-row">
          <div className="kv-k">Nombre</div>
          <div className="kv-v">{item.nombre}</div>
        </div>
        <div className="kv-row">
          <div className="kv-k">Subcategoría</div>
          <div className="kv-v">{item.subcategoria}</div>
        </div>
        <div className="kv-row">
          <div className="kv-k">Medida</div>
          <div className="kv-v">{item.medida || 'NO POSEE'}</div>
        </div>
        <div className="kv-row">
          <div className="kv-k">Ubicación</div>
          <div className="kv-v">{item.ubicacion}</div>
        </div>
        <div className="kv-row">
          <div className="kv-k">Existencia</div>
          <div className="kv-v">
            {formatNumber(item.cantidad)} {item.unidad}
          </div>
        </div>
        <div className="kv-row">
          <div className="kv-k">Mín</div>
          <div className="kv-v">{formatNumber(item.minStock)}</div>
        </div>
        <div className="kv-row">
          <div className="kv-k">Máx</div>
          <div className="kv-v">{formatNumber(item.maxStock)}</div>
        </div>
      </div>
    </div>
  )
}

export default function IngresoMateriasPrimas() {
  const [items, setItems] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [formError, setFormError] = useState('')
  const [result, setResult] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successOpen, setSuccessOpen] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    setIsLoading(true)
    setError('')

    const qs = new URLSearchParams({
      estatus: 'Todas',
      limit: '1000',
      offset: '0',
      search: '',
    })

    fetchJson(`/inventario/materias-primas/items?${qs.toString()}`, { signal: controller.signal })
      .then((data) => setItems(normalizeItems(data)))
      .catch((e) => {
        if (controller.signal.aborted) return
        setError(e?.message || 'No se pudo cargar el inventario de materias primas')
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })

    return () => controller.abort()
  }, [refreshKey])

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return items
    return items.filter((x) =>
      `${x.codigo} ${x.nombre} ${x.subcategoria} ${x.medida}`.toLowerCase().includes(term),
    )
  }, [items, search])

  const selectedItem = useMemo(
    () => items.find((x) => String(x.id) === String(selectedId)) || null,
    [items, selectedId],
  )

  function pickByCodigo(raw) {
    const code = String(raw || '').trim()
    if (!code) return
    const found = items.find((x) => String(x.codigo) === code) || null
    if (!found) {
      setFormError(`No se encontró materia prima con código ${code}.`)
      return
    }
    setFormError('')
    setSelectedId(String(found.id))
    setSearch('')
  }

  const qty = useMemo(() => {
    const n = Number(cantidad)
    return cantidad === '' ? null : Number.isNaN(n) ? NaN : n
  }, [cantidad])

  async function onSubmit(e) {
    e.preventDefault()
    setFormError('')
    setResult(null)

    if (!selectedItem) {
      setFormError('Selecciona una materia prima.')
      return
    }
    if (qty === null || Number.isNaN(qty) || qty <= 0) {
      setFormError('Ingresa una cantidad válida.')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetchApi('/logistica/ingreso-materia-prima', {
        method: 'POST',
        body: {
          id_articulo: selectedItem.id,
          cantidad: qty,
          referencia: 'INGRESO_MATERIA_PRIMA',
          observaciones: observaciones.trim() || null,
        },
      })
      setResult({ ...res, item: selectedItem })
      setSuccessOpen(true)
      setRefreshKey((k) => k + 1)
    } catch (e2) {
      setFormError(e2?.message || 'No se pudo registrar el ingreso')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <h2>Ingreso de Materias Primas</h2>
      </header>

      <div className="page-body">
        {error ? <div className="form-error">{error}</div> : null}

        <SuccessModal
          open={successOpen}
          title="Stock actualizado"
          onAccept={() => {
            setSuccessOpen(false)
            setResult(null)
            setSearch('')
            setSelectedId('')
            setCantidad('')
            setObservaciones('')
          }}
        >
          {result ? (
            <div className="kv">
              <div className="kv-row">
                <div className="kv-k">Materia prima</div>
                <div className="kv-v">
                  {result.item?.codigo} — {result.item?.nombre}
                </div>
              </div>
              <div className="kv-row">
                <div className="kv-k">Stock</div>
                <div className="kv-v">
                  {formatNumber(asNumber(result.antes, 0))} → {formatNumber(asNumber(result.despues, 0))}
                </div>
              </div>
            </div>
          ) : null}
        </SuccessModal>

        <div className="card">
          <div className="card-title">Registrar ingreso de materia prima</div>
          <form className="form-grid" onSubmit={onSubmit}>
            <label className="field" style={{ gridColumn: '1 / -1' }}>
              <span>Buscar materia prima</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  e.preventDefault()
                  pickByCodigo(search)
                }}
                placeholder="Escanear código o buscar por nombre, dimensión..."
                disabled={isLoading}
                autoFocus
              />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                {isLoading ? 'Cargando...' : `Mostrando ${filteredItems.length} materias primas.`}
              </div>
              <div style={{ marginTop: 10 }}>
                <ItemPicker
                  items={filteredItems}
                  selectedId={selectedId}
                  onPick={(id) => setSelectedId(id)}
                  disabled={isLoading}
                  pageSize={5}
                  resetKey={`mp:${search}`}
                  emptyText={!items.length ? 'No hay materias primas registradas.' : 'No hay resultados.'}
                />
              </div>
            </label>

            <label className="field">
              <span>Cantidad a ingresar</span>
              <input
                type="number"
                min="0"
                step="any"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                disabled={isLoading}
              />
            </label>

            <label className="field">
              <span>Observaciones (opcional)</span>
              <input
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Ej. factura, proveedor..."
                disabled={isLoading}
              />
            </label>

            {formError ? <div className="form-error">{formError}</div> : null}

            <div className="form-actions">
              <button
                className="btn primary"
                type="submit"
                disabled={isLoading || isSubmitting || !selectedItem}
              >
                {isSubmitting ? 'Procesando...' : 'Registrar ingreso'}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setSearch('')
                  setSelectedId('')
                  setCantidad('')
                  setObservaciones('')
                  setFormError('')
                }}
                disabled={isSubmitting}
              >
                Limpiar
              </button>
            </div>
          </form>
        </div>

        <ItemInfo title="Materia prima seleccionada" item={selectedItem} />
      </div>
    </section>
  )
}
