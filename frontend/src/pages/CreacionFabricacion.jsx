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
  const res = await fetch(`${API_BASE}${path}`, { signal, headers: authHeaders() })
  if (!res.ok) throw new Error(await readApiError(res))
  return res.json()
}

async function fetchApi(path, { method = 'GET', body, signal } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : null),
      ...authHeaders(),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal,
  })
  if (!res.ok) throw new Error(await readApiError(res))
  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('application/json')) return res.json()
  return null
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
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [subensambles, setSubensambles] = useState([])
  const [productosTerminados, setProductosTerminados] = useState([])
  const [asociaciones, setAsociaciones] = useState([])
  const [refreshKey, setRefreshKey] = useState(0)

  const [searchSub, setSearchSub] = useState('')
  const [searchPt, setSearchPt] = useState('')
  const [idSub, setIdSub] = useState('')
  const [idPt, setIdPt] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [referencia, setReferencia] = useState('FABRICACION')
  const [observaciones, setObservaciones] = useState('')

  const [assocError, setAssocError] = useState('')
  const [assocSubId, setAssocSubId] = useState('')
  const [assocPtId, setAssocPtId] = useState('')
  const [isAssocSubmitting, setIsAssocSubmitting] = useState(false)

  const [result, setResult] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    setIsLoading(true)
    setError('')
    setResult(null)

    const qs = new URLSearchParams({
      estatus: 'Todas',
      limit: '200',
      offset: '0',
      search: '',
    })

    Promise.all([
      fetchJson(`/inventario/subensambles/items?${qs.toString()}`, { signal: controller.signal }),
      fetchJson(`/inventario/productos-terminados/items?${qs.toString()}`, {
        signal: controller.signal,
      }),
      fetchJson('/logistica/asociaciones', { signal: controller.signal }),
    ])
      .then(([subData, ptData, assocData]) => {
        setSubensambles(normalizeItems(subData))
        setProductosTerminados(normalizeItems(ptData))
        setAsociaciones(Array.isArray(assocData?.asociaciones) ? assocData.asociaciones : [])
      })
      .catch((e) => {
        if (controller.signal.aborted) return
        setError(e?.message || 'No se pudo cargar inventario')
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })

    return () => controller.abort()
  }, [refreshKey])

  const filteredSub = useMemo(() => {
    const term = searchSub.trim().toUpperCase()
    if (!term) return subensambles
    return subensambles.filter((x) => {
      const hay =
        `${x.codigo} ${x.nombre} ${x.subcategoria} ${x.medida} ${x.ubicacion}`.toUpperCase()
      return hay.includes(term)
    })
  }, [subensambles, searchSub])

  const filteredPt = useMemo(() => {
    const term = searchPt.trim().toUpperCase()
    if (!term) return productosTerminados
    return productosTerminados.filter((x) => {
      const hay =
        `${x.codigo} ${x.nombre} ${x.subcategoria} ${x.medida} ${x.ubicacion}`.toUpperCase()
      return hay.includes(term)
    })
  }, [productosTerminados, searchPt])

  const selectedSub = useMemo(
    () => subensambles.find((x) => String(x.id) === String(idSub)) || null,
    [subensambles, idSub],
  )
  const selectedPt = useMemo(
    () => productosTerminados.find((x) => String(x.id) === String(idPt)) || null,
    [productosTerminados, idPt],
  )

  const assocBySub = useMemo(() => {
    const m = new Map()
    for (const a of asociaciones) {
      if (!a) continue
      m.set(String(a.id_subensamble), a)
    }
    return m
  }, [asociaciones])

  const isPtLocked = useMemo(() => assocBySub.has(String(idSub)), [assocBySub, idSub])

  useEffect(() => {
    if (!idSub) return
    const assoc = assocBySub.get(String(idSub))
    if (!assoc) return
    const mappedPt = String(assoc.id_producto_terminado)
    if (mappedPt && mappedPt !== String(idPt || '')) setIdPt(mappedPt)
  }, [assocBySub, idSub, idPt])

  const qty = useMemo(() => {
    const raw = String(cantidad).trim()
    if (!raw) return null
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? n : NaN
  }, [cantidad])

  const warnings = useMemo(() => {
    const w = []
    if (!selectedSub || !selectedPt) return w
    if (qty === null || Number.isNaN(qty)) return w

    const subAfter = selectedSub.cantidad - qty
    const ptAfter = selectedPt.cantidad + qty

    if (subAfter < 0) w.push('No hay suficiente subensamble para fabricar esa cantidad.')
    if (subAfter < selectedSub.minStock) w.push('El subensamble quedará por debajo del mínimo.')
    if (selectedPt.maxStock > 0 && ptAfter > selectedPt.maxStock)
      w.push('El producto terminado superará el máximo.')

    return w
  }, [selectedSub, selectedPt, qty])

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setResult(null)

    if (!selectedSub) {
      setError('Selecciona un subensamble.')
      return
    }
    if (!selectedPt) {
      setError('Selecciona un producto terminado.')
      return
    }
    const assoc = assocBySub.get(String(selectedSub.id))
    if (!assoc) {
      setError('Este subensamble no tiene asociación configurada.')
      return
    }
    if (String(assoc.id_producto_terminado) !== String(selectedPt.id)) {
      setError('El producto terminado no corresponde a la asociación configurada.')
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
    if (selectedSub.cantidad - qty < 0) {
      setError('No hay suficiente subensamble para fabricar esa cantidad.')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetchApi('/logistica/fabricacion', {
        method: 'POST',
        body: {
          id_subensamble: selectedSub.id,
          id_producto_terminado: selectedPt.id,
          cantidad: qty,
          referencia: String(referencia || 'FABRICACION').toUpperCase(),
          observaciones: observaciones ? String(observaciones).toUpperCase() : null,
        },
      })
      setResult(res)
      setCantidad('')
      setObservaciones('')
      setRefreshKey((k) => k + 1)
    } catch (e2) {
      setError(e2?.message || 'No se pudo registrar la fabricación')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function onSaveAssoc(e) {
    e.preventDefault()
    setAssocError('')
    const sub = Number(assocSubId)
    const pt = Number(assocPtId)
    if (!Number.isFinite(sub) || sub <= 0) {
      setAssocError('Selecciona un subensamble.')
      return
    }
    if (!Number.isFinite(pt) || pt <= 0) {
      setAssocError('Selecciona un producto terminado.')
      return
    }
    setIsAssocSubmitting(true)
    try {
      await fetchApi('/logistica/asociaciones', {
        method: 'POST',
        body: { id_subensamble: sub, id_producto_terminado: pt },
      })
      setAssocSubId('')
      setAssocPtId('')
      setRefreshKey((k) => k + 1)
    } catch (e2) {
      setAssocError(e2?.message || 'No se pudo guardar la asociación')
    } finally {
      setIsAssocSubmitting(false)
    }
  }

  async function onDeleteAssoc(id_subensamble) {
    setAssocError('')
    const sub = Number(id_subensamble)
    if (!Number.isFinite(sub) || sub <= 0) return
    setIsAssocSubmitting(true)
    try {
      await fetchApi(`/logistica/asociaciones/${sub}`, { method: 'DELETE' })
      if (String(idSub) === String(sub)) setIdPt('')
      setRefreshKey((k) => k + 1)
    } catch (e2) {
      setAssocError(e2?.message || 'No se pudo eliminar la asociación')
    } finally {
      setIsAssocSubmitting(false)
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <h2>Creación/Fabricación</h2>
      </header>

      <div className="page-body">
        {error ? <div className="form-error">{error}</div> : null}

        <div className="card">
          <div className="card-title">Convertir subensamble → producto terminado</div>
          <form className="form-grid" onSubmit={onSubmit}>
            <label className="field">
              <span>Buscar subensamble</span>
              <input
                value={searchSub}
                onChange={(e) => setSearchSub(e.target.value)}
                placeholder="Código / nombre / subcategoría"
              />
            </label>

            <label className="field">
              <span>Subensamble</span>
              <select value={idSub} onChange={(e) => setIdSub(e.target.value)} disabled={isLoading}>
                <option value="">Selecciona...</option>
                {filteredSub.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.codigo} — {x.nombre}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Buscar producto terminado</span>
              <input
                value={searchPt}
                onChange={(e) => setSearchPt(e.target.value)}
                placeholder="Código / nombre / subcategoría"
              />
            </label>

            <label className="field">
              <span>Producto terminado</span>
              <select
                value={idPt}
                onChange={(e) => setIdPt(e.target.value)}
                disabled={isLoading || isPtLocked}
              >
                <option value="">Selecciona...</option>
                {filteredPt.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.codigo} — {x.nombre}
                  </option>
                ))}
              </select>
              {isPtLocked ? (
                <div className="muted" style={{ fontSize: 12 }}>
                  Asociado automáticamente por configuración.
                </div>
              ) : null}
            </label>

            <label className="field">
              <span>Cantidad a fabricar</span>
              <input
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                inputMode="decimal"
                placeholder="0"
                disabled={isLoading}
              />
            </label>

            <label className="field">
              <span>Referencia</span>
              <input
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                placeholder="FABRICACION"
                disabled={isLoading}
              />
            </label>

            <label className="field" style={{ gridColumn: '1 / -1' }}>
              <span>Observaciones (opcional)</span>
              <input
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder=""
                disabled={isLoading}
              />
            </label>

            {warnings.length ? (
              <div className="form-warn" style={{ gridColumn: '1 / -1' }}>
                {warnings.map((w) => (
                  <div key={w}>{w}</div>
                ))}
              </div>
            ) : null}

            <div className="modal-actions" style={{ gridColumn: '1 / -1' }}>
              <button className="primary" type="submit" disabled={isLoading || isSubmitting}>
                {isSubmitting ? 'Procesando...' : 'Registrar fabricación'}
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

        {role === 'admin' ? (
          <div className="card">
            <div className="card-title">Preconfiguración de asociaciones</div>
            {assocError ? <div className="form-error">{assocError}</div> : null}
            <form className="form-grid" onSubmit={onSaveAssoc}>
              <label className="field">
                <span>Subensamble</span>
                <select
                  value={assocSubId}
                  onChange={(e) => setAssocSubId(e.target.value)}
                  disabled={isLoading || isAssocSubmitting}
                >
                  <option value="">Selecciona...</option>
                  {subensambles.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.codigo} — {x.nombre}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Producto terminado</span>
                <select
                  value={assocPtId}
                  onChange={(e) => setAssocPtId(e.target.value)}
                  disabled={isLoading || isAssocSubmitting}
                >
                  <option value="">Selecciona...</option>
                  {productosTerminados.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.codigo} — {x.nombre}
                    </option>
                  ))}
                </select>
              </label>

              <div className="modal-actions" style={{ gridColumn: '1 / -1' }}>
                <button className="primary" type="submit" disabled={isLoading || isAssocSubmitting}>
                  {isAssocSubmitting ? 'Guardando...' : 'Guardar asociación'}
                </button>
              </div>
            </form>

            <div className="table-wrap" style={{ marginTop: 14 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Subensamble</th>
                    <th>Producto terminado</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.isArray(asociaciones) && asociaciones.length ? (
                    asociaciones.map((a) => (
                      <tr key={a.id}>
                        <td className="mono">
                          {a.sub_codigo} — {a.sub_nombre}
                        </td>
                        <td className="mono">
                          {a.pt_codigo} — {a.pt_nombre}
                        </td>
                        <td>
                          <div className="actions inline">
                            <button
                              type="button"
                              className="btn icon"
                              onClick={() => onDeleteAssoc(a.id_subensamble)}
                              disabled={isAssocSubmitting}
                              title="Eliminar"
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="empty">
                        No hay asociaciones configuradas.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        <div className="grid-2">
          <ItemInfo title="Subensamble" item={selectedSub} />
          <ItemInfo title="Producto terminado" item={selectedPt} />
        </div>

        {result ? (
          <div className="card">
            <div className="card-title">Resultado</div>
            <div className="kv">
              <div className="kv-row">
                <div className="kv-k">Cantidad</div>
                <div className="kv-v">{formatNumber(asNumber(result.cantidad, 0))}</div>
              </div>
              <div className="kv-row">
                <div className="kv-k">Subensamble después</div>
                <div className="kv-v">
                  {formatNumber(asNumber(result?.subensamble?.despues, 0))}
                </div>
              </div>
              <div className="kv-row">
                <div className="kv-k">Producto terminado después</div>
                <div className="kv-v">
                  {formatNumber(asNumber(result?.producto_terminado?.despues, 0))}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}
