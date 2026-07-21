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
    puntoReorden: asNumber(x.punto_reorden, 0),
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

export default function CreacionFabricacion() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [subensambles, setSubensambles] = useState([])
  const [materiasPrimas, setMateriasPrimas] = useState([])
  const [productosTerminados, setProductosTerminados] = useState([])
  const [refreshKey, setRefreshKey] = useState(0)

  const [recetaPtId, setRecetaPtId] = useState('')
  const [recetas, setRecetas] = useState([])
  const [recetaId, setRecetaId] = useState('')
  const [recetaCantidad, setRecetaCantidad] = useState('')
  const [recetaError, setRecetaError] = useState('')
  const [recetaResult, setRecetaResult] = useState(null)
  const [isRecetaSubmitting, setIsRecetaSubmitting] = useState(false)
  const [recetaSuccessOpen, setRecetaSuccessOpen] = useState(false)

  const [isRecetaAdminOpen, setIsRecetaAdminOpen] = useState(false)
  const [allRecetas, setAllRecetas] = useState([])
  const [formPtId, setFormPtId] = useState('')
  const [formNombre, setFormNombre] = useState('')
  const [formItems, setFormItems] = useState([{ id_articulo: '', cantidad_por_unidad: '' }])
  const [formEditingId, setFormEditingId] = useState(null)
  const [formError, setFormError] = useState('')
  const [isFormSubmitting, setIsFormSubmitting] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    setIsLoading(true)
    setError('')

    const qs = new URLSearchParams({
      estatus: 'Todas',
      limit: '200',
      offset: '0',
      search: '',
    })

    const requests = [
      fetchJson(`/inventario/productos-terminados/items?${qs.toString()}`, { signal: controller.signal }),
      fetchJson(`/inventario/subensambles/items?${qs.toString()}`, { signal: controller.signal }),
      ...(isAdmin ? [fetchJson(`/inventario/materias-primas/items?${qs.toString()}`, { signal: controller.signal })] : []),
    ]

    Promise.all(requests)
      .then(([ptData, subData, mpData]) => {
        setProductosTerminados(normalizeItems(ptData))
        setSubensambles(normalizeItems(subData))
        setMateriasPrimas(isAdmin && mpData ? normalizeItems(mpData) : [])
      })
      .catch((e) => {
        if (controller.signal.aborted) return
        setError(e?.message || 'No se pudo cargar inventario')
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })

    return () => controller.abort()
  }, [refreshKey, isAdmin])

  const ptOptions = useMemo(() => productosTerminados, [productosTerminados])
  const selectedProductoReceta = useMemo(
    () => ptOptions.find((p) => String(p.id) === String(recetaPtId)) || null,
    [ptOptions, recetaPtId],
  )

  const insumoOptions = useMemo(
    () =>
      [...materiasPrimas, ...subensambles].sort((a, b) =>
        `${a.nombre}`.localeCompare(`${b.nombre}`),
      ),
    [materiasPrimas, subensambles],
  )

  useEffect(() => {
    if (!recetaPtId) {
      setRecetas([])
      setRecetaId('')
      return
    }
    const controller = new AbortController()
    setRecetaError('')
    fetchApi(`/logistica/recetas?id_producto_terminado=${encodeURIComponent(recetaPtId)}`, {
      signal: controller.signal,
    })
      .then((data) => {
        const rows = Array.isArray(data) ? data : []
        const activas = rows.filter((r) => r.activa)
        setRecetas(activas)
        setRecetaId(activas[0]?.id_receta ? String(activas[0].id_receta) : '')
      })
      .catch((e) => {
        if (controller.signal.aborted) return
        setRecetaError(e?.message || 'No se pudieron cargar las recetas')
      })
    return () => controller.abort()
  }, [recetaPtId, refreshKey])

  const selectedReceta = useMemo(
    () => recetas.find((r) => String(r.id_receta) === String(recetaId)) || null,
    [recetas, recetaId],
  )

  const recetaQty = useMemo(() => {
    const n = Number(recetaCantidad)
    return recetaCantidad === '' ? null : Number.isNaN(n) ? NaN : n
  }, [recetaCantidad])

  const recetaPreview = useMemo(() => {
    if (!selectedReceta || recetaQty === null || Number.isNaN(recetaQty)) return []
    return (selectedReceta.items || []).map((it) => {
      const necesario = asNumber(it.cantidad_por_unidad, 0) * recetaQty
      const restante = asNumber(it.stock_actual, 0) - necesario
      return { ...it, necesario, restante, insuficiente: restante < 0 }
    })
  }, [selectedReceta, recetaQty])

  const recetaTieneFaltantes = recetaPreview.some((it) => it.insuficiente)

  useEffect(() => {
    if (!isAdmin || !isRecetaAdminOpen) return
    fetchApi('/logistica/recetas')
      .then((data) => setAllRecetas(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [isAdmin, isRecetaAdminOpen, refreshKey])

  async function onSubmitReceta(e) {
    e.preventDefault()
    setRecetaError('')
    setRecetaResult(null)

    if (!selectedReceta) {
      setRecetaError('Selecciona una receta.')
      return
    }
    if (recetaQty === null || Number.isNaN(recetaQty) || recetaQty <= 0) {
      setRecetaError('Ingresa una cantidad válida.')
      return
    }
    if (recetaTieneFaltantes) {
      setRecetaError('No hay suficiente stock de uno o más insumos para esta cantidad.')
      return
    }

    setIsRecetaSubmitting(true)
    try {
      const res = await fetchApi('/logistica/fabricacion-receta', {
        method: 'POST',
        body: {
          id_receta: selectedReceta.id_receta,
          cantidad: recetaQty,
          referencia: 'FABRICACION',
        },
      })
      setRecetaResult(res)
      setRecetaSuccessOpen(true)
      setRefreshKey((k) => k + 1)
    } catch (e2) {
      setRecetaError(e2?.message || 'No se pudo registrar la fabricación')
    } finally {
      setIsRecetaSubmitting(false)
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <h2>Creación/Fabricación</h2>
      </header>

      <div className="page-body">
        {error ? <div className="form-error">{error}</div> : null}

        <SuccessModal
          open={recetaSuccessOpen}
          title="Fabricación registrada"
          onAccept={() => {
            setRecetaSuccessOpen(false)
            setRecetaResult(null)
            setRecetaCantidad('')
          }}
        >
          {recetaResult ? (
            <div className="kv">
              {(Array.isArray(recetaResult.consumo) ? recetaResult.consumo : []).map((c) => (
                <div className="kv-row" key={c.id_articulo}>
                  <div className="kv-k">{c.nombre}</div>
                  <div className="kv-v">
                    {formatNumber(asNumber(c.antes, 0))} → {formatNumber(asNumber(c.despues, 0))}
                  </div>
                </div>
              ))}
              <div className="kv-row">
                <div className="kv-k">Producto terminado</div>
                <div className="kv-v">
                  {formatNumber(asNumber(recetaResult?.producto_terminado?.antes, 0))} →{' '}
                  {formatNumber(asNumber(recetaResult?.producto_terminado?.despues, 0))}
                </div>
              </div>
            </div>
          ) : null}
        </SuccessModal>

        <div className="card">
          <div className="card-title">Crear producto terminado a partir de recetas</div>
          <form className="form-grid" onSubmit={onSubmitReceta}>
            <label className="field">
              <span>Producto terminado</span>
              <select value={recetaPtId} onChange={(e) => setRecetaPtId(e.target.value)} disabled={isLoading}>
                <option value="">Selecciona…</option>
                {ptOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.codigo} — {p.nombre}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Receta activa</span>
              <select
                value={recetaId}
                onChange={(e) => setRecetaId(e.target.value)}
                disabled={isLoading || !recetas.length}
              >
                {!recetas.length ? (
                  <option value="">Sin recetas activas para este producto</option>
                ) : (
                  recetas.map((r) => (
                    <option key={r.id_receta} value={r.id_receta}>
                      {r.nombre}
                    </option>
                  ))
                )}
              </select>
            </label>

            <label className="field">
              <span>Cantidad a producir</span>
              <input
                type="number"
                min="0"
                step="any"
                value={recetaCantidad}
                onChange={(e) => setRecetaCantidad(e.target.value)}
                disabled={isLoading}
              />
            </label>

            {recetaPreview.length > 0 ? (
              <div className="kv" style={{ gridColumn: '1 / -1' }}>
                {recetaPreview.map((it) => (
                  <div className="kv-row" key={it.id_articulo}>
                    <div className="kv-k">{it.nombre}</div>
                    <div
                      className="kv-v"
                      style={it.insuficiente ? { color: 'var(--danger, #c0392b)' } : undefined}
                    >
                      necesita {formatNumber(asNumber(it.necesario, 0))} {it.unidad_medida} · disponible{' '}
                      {formatNumber(asNumber(it.stock_actual, 0))}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {recetaError ? <div className="form-error">{recetaError}</div> : null}

            <div className="form-actions">
              <button
                className="btn primary"
                type="submit"
                disabled={isLoading || isRecetaSubmitting || recetaTieneFaltantes}
              >
                {isRecetaSubmitting ? 'Procesando...' : 'Registrar fabricación'}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setRefreshKey((k) => k + 1)}
                disabled={isRecetaSubmitting}
              >
                Recargar datos
              </button>
            </div>
          </form>
        </div>

        <div className="grid-2">
          <ItemInfo title="Producto terminado" item={selectedProductoReceta} />
          <div className="card">
            <div className="card-title">Receta seleccionada</div>
            <div className="kv">
              <div className="kv-row">
                <div className="kv-k">Nombre</div>
                <div className="kv-v">{selectedReceta?.nombre || '-'}</div>
              </div>
              <div className="kv-row">
                <div className="kv-k">Insumos</div>
                <div className="kv-v">
                  {formatNumber(Array.isArray(selectedReceta?.items) ? selectedReceta.items.length : 0)}
                </div>
              </div>
              <div className="kv-row">
                <div className="kv-k">Estado</div>
                <div className="kv-v">{selectedReceta ? 'Lista para fabricar' : 'Selecciona una receta'}</div>
              </div>
            </div>
          </div>
        </div>

        {isAdmin ? (
          <div className="card">
            <div
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
            >
              <div className="card-title" style={{ marginBottom: 0 }}>
                Asociar recetas a productos terminados
              </div>
              <button
                type="button"
                className="btn"
                onClick={() => setIsRecetaAdminOpen((v) => !v)}
              >
                {isRecetaAdminOpen ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>

            {isRecetaAdminOpen ? (
              <>
                <div className="muted" style={{ marginTop: 12 }}>
                  Crea, edita, activa o elimina recetas que definan los insumos requeridos por cada producto terminado.
                </div>
                <form
                  className="form-grid"
                  onSubmit={async (e) => {
                    e.preventDefault()
                    setFormError('')
                    const items = formItems
                      .filter((it) => it.id_articulo && it.cantidad_por_unidad)
                      .map((it) => ({
                        id_articulo: Number(it.id_articulo),
                        cantidad_por_unidad: Number(it.cantidad_por_unidad),
                      }))
                    if (!formPtId || !formNombre.trim() || items.length === 0) {
                      setFormError('Completa producto terminado, nombre y al menos un insumo.')
                      return
                    }
                    setIsFormSubmitting(true)
                    try {
                      const body = {
                        id_producto_terminado: Number(formPtId),
                        nombre: formNombre.toUpperCase(),
                        items,
                      }
                      if (formEditingId) {
                        await fetchApi(`/logistica/recetas/${formEditingId}`, { method: 'PATCH', body })
                      } else {
                        await fetchApi('/logistica/recetas', { method: 'POST', body })
                      }
                      setFormPtId('')
                      setFormNombre('')
                      setFormItems([{ id_articulo: '', cantidad_por_unidad: '' }])
                      setFormEditingId(null)
                      setRefreshKey((k) => k + 1)
                    } catch (e2) {
                      setFormError(e2?.message || 'No se pudo guardar la receta')
                    } finally {
                      setIsFormSubmitting(false)
                    }
                  }}
                >
                  <label className="field">
                    <span>Producto terminado</span>
                    <select value={formPtId} onChange={(e) => setFormPtId(e.target.value)} disabled={isFormSubmitting}>
                      <option value="">Selecciona…</option>
                      {ptOptions.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.codigo} — {p.nombre}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span>Nombre de la receta</span>
                    <input
                      value={formNombre}
                      onChange={(e) => setFormNombre(e.target.value)}
                      disabled={isFormSubmitting}
                    />
                  </label>

                  <div className="field" style={{ gridColumn: '1 / -1' }}>
                    <span>Insumos de la receta</span>
                    {formItems.map((it, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                        <select
                          value={it.id_articulo}
                          onChange={(e) => {
                            const next = [...formItems]
                            next[idx] = { ...next[idx], id_articulo: e.target.value }
                            setFormItems(next)
                          }}
                          disabled={isFormSubmitting}
                        >
                          <option value="">Selecciona insumo…</option>
                          {insumoOptions.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.codigo} — {a.nombre}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          placeholder="cantidad por unidad"
                          value={it.cantidad_por_unidad}
                          onChange={(e) => {
                            const next = [...formItems]
                            next[idx] = { ...next[idx], cantidad_por_unidad: e.target.value }
                            setFormItems(next)
                          }}
                          disabled={isFormSubmitting}
                        />
                        <button
                          type="button"
                          className="btn"
                          onClick={() => setFormItems(formItems.filter((_, i) => i !== idx))}
                          disabled={isFormSubmitting || formItems.length === 1}
                        >
                          Quitar
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="btn"
                      style={{ marginTop: 8 }}
                      onClick={() =>
                        setFormItems([
                          ...formItems,
                          { id_articulo: '', cantidad_por_unidad: '' },
                        ])
                      }
                      disabled={isFormSubmitting}
                    >
                      + Agregar insumo
                    </button>
                  </div>

                  {formError ? <div className="form-error">{formError}</div> : null}

                  <div className="form-actions">
                    <button className="btn primary" type="submit" disabled={isFormSubmitting}>
                      {formEditingId ? 'Guardar cambios' : 'Crear receta'}
                    </button>
                    {formEditingId ? (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => {
                          setFormEditingId(null)
                          setFormPtId('')
                          setFormNombre('')
                          setFormItems([{ id_articulo: '', cantidad_por_unidad: '' }])
                        }}
                      >
                        Cancelar edición
                      </button>
                    ) : null}
                  </div>
                </form>

                <div className="table" style={{ marginTop: 16 }}>
                  {allRecetas.length ? (
                    allRecetas.map((r) => (
                      <div key={r.id_receta} className="kv-row">
                        <div className="kv-k">
                          {r.producto_terminado} — {r.nombre}
                        </div>
                        <div
                          className="kv-v"
                          style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
                        >
                          <span className="muted">
                            {Array.isArray(r.items) ? r.items.length : 0} insumo(s)
                            {r.activa ? '' : ' · inactiva'}
                          </span>
                          <button
                            className="btn"
                            onClick={async () => {
                              try {
                                await fetchApi(`/logistica/recetas/${r.id_receta}/activa`, {
                                  method: 'PATCH',
                                  body: { activa: !r.activa },
                                })
                                setRefreshKey((k) => k + 1)
                              } catch (e2) {
                                setFormError(e2?.message || 'No se pudo cambiar el estado de la receta')
                              }
                            }}
                          >
                            {r.activa ? 'Desactivar' : 'Activar'}
                          </button>
                          <button
                            className="btn"
                            onClick={() => {
                              setFormEditingId(r.id_receta)
                              setFormPtId(String(r.id_producto_terminado))
                              setFormNombre(r.nombre)
                              setFormItems(
                                (r.items || []).map((it) => ({
                                  id_articulo: String(it.id_articulo),
                                  cantidad_por_unidad: String(it.cantidad_por_unidad),
                                })),
                              )
                            }}
                          >
                            Editar
                          </button>
                          <button
                            className="btn"
                            onClick={async () => {
                              try {
                                await fetchApi(`/logistica/recetas/${r.id_receta}`, {
                                  method: 'DELETE',
                                })
                                setRefreshKey((k) => k + 1)
                              } catch (e2) {
                                setFormError(e2?.message || 'No se pudo eliminar la receta')
                              }
                            }}
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="muted">No hay recetas registradas.</div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}
