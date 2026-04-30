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
        return inner?.message || inner?.msg || inner?.error || detail
      } catch {
        return detail
      }
    }
    if (detail && typeof detail === 'object') {
      return detail?.message || detail?.msg || JSON.stringify(detail)
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
    subcategoria: x.subcategoria ?? '',
    medida: x.medida ?? '',
    cantidad: asNumber(x.cantidad, 0),
    unidad: x.unidad ?? '',
    ubicacion: x.ubicacion ?? '',
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

function ItemPicker({
  items,
  selectedId,
  onPick,
  disabled,
  emptyText,
  pageSize = 5,
  resetKey = '',
}) {
  const rows = Array.isArray(items) ? items : []
  const size = Math.max(Number(pageSize) || 5, 1)
  const total = rows.length
  const totalPages = Math.max(Math.ceil(total / size), 1)
  const [page, setPage] = useState(0)

  useEffect(() => {
    setPage(0)
  }, [resetKey])

  useEffect(() => {
    if (page > totalPages - 1) setPage(Math.max(totalPages - 1, 0))
  }, [page, totalPages])

  const start = page * size
  const pageRows = rows.slice(start, start + size)

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 10,
        overflow: 'hidden',
        background: 'var(--panel)',
      }}
    >
      <div>
        {pageRows.length ? (
          pageRows.map((x) => {
            const isSelected = String(selectedId || '') === String(x.id)
            return (
              <div
                key={x.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '10px 10px',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {x.codigo} — {x.nombre}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {x.subcategoria}
                    {x.medida ? ` • ${x.medida}` : ''}
                    {x.ubicacion ? ` • ${x.ubicacion}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  className={isSelected ? 'primary' : 'btn'}
                  onClick={() => onPick(String(x.id))}
                  disabled={disabled}
                >
                  {isSelected ? 'Seleccionado' : 'Elegir'}
                </button>
              </div>
            )
          })
        ) : (
          <div className="muted" style={{ padding: 12, fontSize: 13 }}>
            {emptyText || 'No hay resultados.'}
          </div>
        )}
      </div>
      {rows.length > size ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            padding: 10,
            borderTop: '1px solid var(--border)',
          }}
        >
          <button
            type="button"
            className="btn"
            onClick={() => setPage((p) => Math.max(p - 1, 0))}
            disabled={disabled || page <= 0}
          >
            Anterior
          </button>
          <div className="muted" style={{ fontSize: 12 }}>
            Página {page + 1} de {totalPages}
          </div>
          <button
            type="button"
            className="btn"
            onClick={() => setPage((p) => Math.min(p + 1, totalPages - 1))}
            disabled={disabled || page >= totalPages - 1}
          >
            Siguiente
          </button>
        </div>
      ) : null}
    </div>
  )
}

export default function Movimientos() {
  const { role } = useAuth()
  const isZebra = role === 'zebra'
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [items, setItems] = useState([])
  const [refreshKey, setRefreshKey] = useState(0)

  const [modo, setModo] = useState('SALIDA_PROYECTO')
  const [search, setSearch] = useState('')
  const [idPt, setIdPt] = useState('')
  const [scanCodigo, setScanCodigo] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [referencia, setReferencia] = useState('PROYECTO')
  const [observaciones, setObservaciones] = useState('')

  const [result, setResult] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [estado, setEstado] = useState(null)
  const [estadoError, setEstadoError] = useState('')
  const [isLoadingEstado, setIsLoadingEstado] = useState(false)
  const [successOpen, setSuccessOpen] = useState(false)
  const [successResult, setSuccessResult] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    setIsLoading(true)
    setError('')
    setResult(null)
    const qs = new URLSearchParams({ estatus: 'Todas', limit: '200', offset: '0', search: '' })
    fetchJson(`/inventario/productos-terminados/items?${qs.toString()}`, {
      signal: controller.signal,
    })
      .then((data) => setItems(normalizeItems(data)))
      .catch((e) => {
        if (controller.signal.aborted) return
        setItems([])
        setError(e?.message || 'No se pudo cargar productos terminados')
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })
    return () => controller.abort()
  }, [refreshKey])

  const filtered = useMemo(() => {
    const term = search.trim().toUpperCase()
    if (!term) return items
    return items.filter((x) => {
      const hay = `${x.codigo} ${x.nombre} ${x.subcategoria} ${x.medida}`.toUpperCase()
      return hay.includes(term)
    })
  }, [items, search])

  const selected = useMemo(
    () => items.find((x) => String(x.id) === String(idPt)) || null,
    [items, idPt],
  )

  useEffect(() => {
    const controller = new AbortController()
    setEstado(null)
    setEstadoError('')
    if (!selected?.id) return () => controller.abort()

    setIsLoadingEstado(true)
    fetchJson(`/logistica/movimientos/estado?id_producto_terminado=${encodeURIComponent(selected.id)}`, {
      signal: controller.signal,
    })
      .then((data) => setEstado(data))
      .catch((e) => {
        if (controller.signal.aborted) return
        setEstado(null)
        setEstadoError(e?.message || 'No se pudo cargar estado')
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingEstado(false)
      })

    return () => controller.abort()
  }, [selected?.id])

  function pickByCodigo(raw) {
    const code = String(raw || '').trim()
    if (!code) return
    const found = filtered.find((x) => String(x.codigo) === code) || null
    if (!found) {
      setError(`No se encontró producto terminado con código ${code}.`)
      return
    }
    setError('')
    setIdPt(String(found.id))
  }

  const qty = useMemo(() => {
    const raw = String(cantidad).trim()
    if (!raw) return null
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? n : NaN
  }, [cantidad])

  const stockActual = useMemo(() => asNumber(estado?.stock?.cantidad, NaN), [estado])
  const proyectoActual = useMemo(() => asNumber(estado?.proyecto?.cantidad, NaN), [estado])

  const feasibility = useMemo(() => {
    if (!selected) return { ok: false, msg: 'Selecciona un producto terminado.' }
    if (qty === null) return { ok: false, msg: 'Ingresa una cantidad.' }
    if (Number.isNaN(qty)) return { ok: false, msg: 'Cantidad inválida.' }
    if (isLoadingEstado) return { ok: false, msg: 'Cargando existencias...' }
    if (!estado || !estado.ok) return { ok: false, msg: estadoError || 'No se pudo validar existencias.' }
    if (!Number.isFinite(stockActual) || !Number.isFinite(proyectoActual))
      return { ok: false, msg: 'No se pudo validar existencias.' }

    if (modo === 'SALIDA_PROYECTO') {
      if (stockActual < qty) {
        return {
          ok: false,
          msg: `No se puede: en STOCK hay ${formatNumber(stockActual)} y estás intentando sacar ${formatNumber(qty)}.`,
        }
      }
      return { ok: true, msg: `OK: STOCK ${formatNumber(stockActual)} → ${formatNumber(stockActual - qty)}.` }
    }

    if (proyectoActual < qty) {
      return {
        ok: false,
        msg: `No se puede: en PROYECTO hay ${formatNumber(proyectoActual)} y estás intentando devolver ${formatNumber(qty)}.`,
      }
    }
    return { ok: true, msg: `OK: PROYECTO ${formatNumber(proyectoActual)} → ${formatNumber(proyectoActual - qty)}.` }
  }, [selected, qty, isLoadingEstado, estado, estadoError, stockActual, proyectoActual, modo])

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setResult(null)
    if (!selected) {
      setError('Selecciona un producto terminado.')
      return
    }
    if (qty === null) {
      setError('Ingresa una cantidad.')
      return
    }
    if (Number.isNaN(qty)) {
      setError('Cantidad inválida.')
      return
    }
    if (!feasibility.ok) {
      setError(feasibility.msg || 'Movimiento no permitido.')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetchApi('/logistica/movimientos', {
        method: 'POST',
        body: {
          tipo: modo,
          id_producto_terminado: selected.id,
          cantidad: qty,
          referencia: String(referencia || 'PROYECTO').toUpperCase(),
          observaciones: observaciones ? String(observaciones).toUpperCase() : null,
        },
      })
      setResult(res)
      setSuccessResult(res)
      setSuccessOpen(true)
      setRefreshKey((k) => k + 1)
      try {
        const nextEstado = await fetchJson(
          `/logistica/movimientos/estado?id_producto_terminado=${encodeURIComponent(selected.id)}`,
        )
        setEstado(nextEstado)
        setEstadoError('')
      } catch {
        setEstado(null)
      }
    } catch (e2) {
      setError(e2?.message || 'No se pudo registrar el movimiento')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <h2>Movimientos</h2>
      </header>

      <div className="page-body">
        {error ? <div className="form-error">{error}</div> : null}
        <SuccessModal
          open={successOpen}
          title={modo === 'SALIDA_PROYECTO' ? 'Movimiento completado (salida)' : 'Movimiento completado (devolución)'}
          onAccept={() => {
            setSuccessOpen(false)
            setSuccessResult(null)
            setResult(null)
            setSearch('')
            setIdPt('')
            setScanCodigo('')
            setCantidad('')
            setObservaciones('')
          }}
        >
          <div className="kv">
            <div className="kv-row">
              <div className="kv-k">Cantidad</div>
              <div className="kv-v">{formatNumber(asNumber(successResult?.cantidad, 0))}</div>
            </div>
            <div className="kv-row">
              <div className="kv-k">Stock</div>
              <div className="kv-v">
                {formatNumber(asNumber(successResult?.stock?.antes, 0))} → {formatNumber(asNumber(successResult?.stock?.despues, 0))}
              </div>
            </div>
            <div className="kv-row">
              <div className="kv-k">Proyecto</div>
              <div className="kv-v">
                {formatNumber(asNumber(successResult?.proyecto?.antes, 0))} → {formatNumber(asNumber(successResult?.proyecto?.despues, 0))}
              </div>
            </div>
          </div>
        </SuccessModal>

        <div className="card">
          <div className="card-title">Producto terminado ↔ Proyecto</div>
          <form className="form-grid" onSubmit={onSubmit}>
            <label className="field">
              <span>Tipo</span>
              <div className="segmented" style={{ width: '100%' }}>
                <button
                  type="button"
                  className={modo === 'SALIDA_PROYECTO' ? 'seg active' : 'seg'}
                  onClick={() => setModo('SALIDA_PROYECTO')}
                  disabled={isSubmitting}
                >
                  Salida a proyecto
                </button>
                <button
                  type="button"
                  className={modo === 'DEVOLUCION_PROYECTO' ? 'seg active' : 'seg'}
                  onClick={() => setModo('DEVOLUCION_PROYECTO')}
                  disabled={isSubmitting}
                >
                  Devolución
                </button>
              </div>
            </label>

            <label className="field">
              <span>Producto terminado</span>
              <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                <input
                  value={scanCodigo}
                  onChange={(e) => setScanCodigo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return
                    e.preventDefault()
                    const v = String(scanCodigo || '').trim()
                    if (!v) return
                    pickByCodigo(v)
                    setScanCodigo('')
                  }}
                  placeholder={
                    isZebra
                      ? 'Escanear QR (código) del producto terminado'
                      : 'Escanear/pegar código del producto terminado'
                  }
                  inputMode="numeric"
                  disabled={isLoading}
                  autoFocus={isZebra}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    pickByCodigo(scanCodigo)
                    setScanCodigo('')
                  }}
                  disabled={isLoading || !String(scanCodigo || '').trim()}
                >
                  Buscar
                </button>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por código, nombre, subcategoría..."
                  disabled={isLoading}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setIdPt('')
                    setSearch('')
                  }}
                  disabled={isLoading || !idPt}
                >
                  Limpiar
                </button>
              </div>

              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                {isLoading ? 'Cargando...' : `Mostrando ${filtered.length} productos.`}
              </div>

              <div style={{ marginTop: 10 }}>
                <ItemPicker
                  items={filtered}
                  selectedId={idPt}
                  onPick={(next) => setIdPt(next)}
                  disabled={isLoading}
                  pageSize={5}
                  resetKey={`pt:${search}`}
                  emptyText={!items.length ? 'No hay productos terminados registrados.' : 'No hay resultados.'}
                />
              </div>
            </label>

            <label className="field">
              <span>Cantidad</span>
              <input
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                inputMode="decimal"
                placeholder="0"
                disabled={isLoading}
              />
              {selected ? (
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                  {isLoadingEstado
                    ? 'Cargando existencias...'
                    : estadoError
                      ? estadoError
                      : estado && estado.ok
                        ? `STOCK: ${formatNumber(asNumber(estado?.stock?.cantidad, 0))} · PROYECTO: ${formatNumber(
                            asNumber(estado?.proyecto?.cantidad, 0),
                          )}`
                        : ''}
                </div>
              ) : null}
              {selected && qty != null && !Number.isNaN(qty) ? (
                feasibility.ok ? (
                  <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                    {feasibility.msg}
                  </div>
                ) : (
                  <div className="form-warn" style={{ marginTop: 10 }}>
                    {feasibility.msg}
                  </div>
                )
              ) : null}
            </label>

            {!isZebra ? (
              <label className="field">
                <span>Referencia</span>
                <input
                  value={referencia}
                  onChange={(e) => setReferencia(e.target.value)}
                  placeholder="PROYECTO"
                  disabled={isLoading}
                />
              </label>
            ) : null}

            {!isZebra ? (
              <label className="field" style={{ gridColumn: '1 / -1' }}>
                <span>Observaciones (opcional)</span>
                <input
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  placeholder=""
                  disabled={isLoading}
                />
              </label>
            ) : null}

            <div className="modal-actions" style={{ gridColumn: '1 / -1' }}>
              <button
                className="primary"
                type="submit"
                disabled={isLoading || isSubmitting || !feasibility.ok}
              >
                {isSubmitting ? 'Procesando...' : 'Registrar movimiento'}
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => setRefreshKey((k) => k + 1)}
                disabled={isSubmitting}
              >
                Recargar
              </button>
            </div>
          </form>
        </div>

        {!isZebra && selected ? (
          <div className="card">
            <div className="card-title">Seleccionado</div>
            <div className="kv">
              <div className="kv-row">
                <div className="kv-k">Código</div>
                <div className="kv-v mono">{selected.codigo}</div>
              </div>
              <div className="kv-row">
                <div className="kv-k">Nombre</div>
                <div className="kv-v">{selected.nombre}</div>
              </div>
              <div className="kv-row">
                <div className="kv-k">Ubicación</div>
                <div className="kv-v">{selected.ubicacion}</div>
              </div>
              {estado && estado.ok ? (
                <>
                  <div className="kv-row">
                    <div className="kv-k">STOCK</div>
                    <div className="kv-v">{formatNumber(asNumber(estado?.stock?.cantidad, 0))}</div>
                  </div>
                  <div className="kv-row">
                    <div className="kv-k">PROYECTO</div>
                    <div className="kv-v">{formatNumber(asNumber(estado?.proyecto?.cantidad, 0))}</div>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        ) : null}

        {result ? (
          <div className="card">
            <div className="card-title">Resultado</div>
            <div className="kv">
              <div className="kv-row">
                <div className="kv-k">Cantidad</div>
                <div className="kv-v">{String(result?.cantidad ?? '')}</div>
              </div>
              <div className="kv-row">
                <div className="kv-k">Stock</div>
                <div className="kv-v">
                  {String(result?.stock?.antes ?? '')} → {String(result?.stock?.despues ?? '')}
                </div>
              </div>
              <div className="kv-row">
                <div className="kv-k">Proyecto</div>
                <div className="kv-v">
                  {String(result?.proyecto?.antes ?? '')} → {String(result?.proyecto?.despues ?? '')}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}
