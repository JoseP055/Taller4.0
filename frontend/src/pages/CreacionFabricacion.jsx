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

function ItemPicker({
  items,
  selectedId,
  onPick,
  disabled,
  emptyText,
  showQty = true,
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
                  <div
                    className="muted"
                    style={{
                      fontSize: 12,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={`${x.subcategoria}${x.medida ? ` • ${x.medida}` : ''} • ${x.ubicacion}${
                      showQty ? ` • ${formatNumber(x.cantidad)} ${x.unidad}` : ''
                    }`}
                  >
                    {x.subcategoria}
                    {x.medida ? ` • ${x.medida}` : ''}
                    {x.ubicacion ? ` • ${x.ubicacion}` : ''}
                    {showQty ? ` • ${formatNumber(x.cantidad)} ${x.unidad}` : ''}
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

export default function CreacionFabricacion() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const isZebra = role === 'zebra'
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [subensambles, setSubensambles] = useState([])
  const [productosTerminados, setProductosTerminados] = useState([])
  const [asociaciones, setAsociaciones] = useState([])
  const [refreshKey, setRefreshKey] = useState(0)

  const [searchSub, setSearchSub] = useState('')
  const [idSub, setIdSub] = useState('')
  const [idPt, setIdPt] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [referencia, setReferencia] = useState('FABRICACION')
  const [observaciones, setObservaciones] = useState('')
  const [scanSubCodigo, setScanSubCodigo] = useState('')

  const [assocError, setAssocError] = useState('')
  const [assocSubId, setAssocSubId] = useState('')
  const [assocPtId, setAssocPtId] = useState('')
  const [assocSearchSub, setAssocSearchSub] = useState('')
  const [assocSearchPt, setAssocSearchPt] = useState('')
  const [isAssocSubmitting, setIsAssocSubmitting] = useState(false)
  const [isAssocOpen, setIsAssocOpen] = useState(() => {
    try {
      const raw = localStorage.getItem('cf_assoc_open')
      if (!raw) return true
      return raw === '1'
    } catch {
      return true
    }
  })

  const [result, setResult] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successOpen, setSuccessOpen] = useState(false)
  const [successResult, setSuccessResult] = useState(null)

  useEffect(() => {
    try {
      localStorage.setItem('cf_assoc_open', isAssocOpen ? '1' : '0')
    } catch {
      return
    }
  }, [isAssocOpen])

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

  const selectedAssoc = useMemo(() => {
    if (!idSub) return null
    return assocBySub.get(String(idSub)) || null
  }, [assocBySub, idSub])

  const subOptionsForFabricacion = useMemo(() => {
    if (isAdmin) return filteredSub
    return filteredSub.filter((x) => assocBySub.has(String(x.id)))
  }, [filteredSub, isAdmin, assocBySub])

  const assocUsed = useMemo(() => {
    const usedSubIds = new Set()
    const usedPtIds = new Set()
    for (const a of asociaciones) {
      if (!a) continue
      if (a.id_subensamble != null) usedSubIds.add(String(a.id_subensamble))
      if (a.id_producto_terminado != null) usedPtIds.add(String(a.id_producto_terminado))
    }
    return { usedSubIds, usedPtIds }
  }, [asociaciones])

  const assocSubOptions = useMemo(() => {
    if (!Array.isArray(subensambles) || !subensambles.length) return []
    return subensambles.filter((x) => !assocUsed.usedSubIds.has(String(x.id)))
  }, [subensambles, assocUsed])

  const assocPtOptions = useMemo(() => {
    if (!Array.isArray(productosTerminados) || !productosTerminados.length) return []
    return productosTerminados.filter((x) => !assocUsed.usedPtIds.has(String(x.id)))
  }, [productosTerminados, assocUsed])

  const filteredAssocSubOptions = useMemo(() => {
    const term = assocSearchSub.trim().toUpperCase()
    if (!term) return assocSubOptions
    return assocSubOptions.filter((x) => {
      const hay = `${x.codigo} ${x.nombre} ${x.subcategoria} ${x.medida} ${x.ubicacion}`.toUpperCase()
      return hay.includes(term)
    })
  }, [assocSubOptions, assocSearchSub])

  const filteredAssocPtOptions = useMemo(() => {
    const term = assocSearchPt.trim().toUpperCase()
    if (!term) return assocPtOptions
    return assocPtOptions.filter((x) => {
      const hay = `${x.codigo} ${x.nombre} ${x.subcategoria} ${x.medida} ${x.ubicacion}`.toUpperCase()
      return hay.includes(term)
    })
  }, [assocPtOptions, assocSearchPt])

  useEffect(() => {
    if (assocSubId && assocUsed.usedSubIds.has(String(assocSubId))) setAssocSubId('')
    if (assocPtId && assocUsed.usedPtIds.has(String(assocPtId))) setAssocPtId('')
  }, [assocSubId, assocPtId, assocUsed])

  const isPtLocked = useMemo(() => assocBySub.has(String(idSub)), [assocBySub, idSub])

  useEffect(() => {
    if (isAdmin) return
    if (idSub && !assocBySub.has(String(idSub))) {
      setIdSub('')
      setIdPt('')
    }
  }, [idSub, assocBySub, isAdmin])

  useEffect(() => {
    if (!idSub) {
      setIdPt('')
      return
    }
    const assoc = assocBySub.get(String(idSub))
    if (!assoc) {
      setIdPt('')
      return
    }
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

  const hasAssociationForSelectedSub = useMemo(() => {
    if (!selectedSub) return false
    return assocBySub.has(String(selectedSub.id))
  }, [assocBySub, selectedSub])

  function pickSubensambleByCodigo(raw) {
    const code = String(raw || '').trim()
    if (!code) return
    const found = subOptionsForFabricacion.find((x) => String(x.codigo) === code) || null
    if (!found) {
      setError(`No se encontró subensamble con código ${code}.`)
      return
    }
    setError('')
    setIdSub(String(found.id))
  }

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
      setSuccessResult(res)
      setSuccessOpen(true)
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
        <SuccessModal
          open={successOpen}
          title="Fabricación completada"
          onAccept={() => {
            setSuccessOpen(false)
            setSuccessResult(null)
            setResult(null)
            setSearchSub('')
            setIdSub('')
            setIdPt('')
            setScanSubCodigo('')
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
              <div className="kv-k">Subensamble</div>
              <div className="kv-v">
                {formatNumber(asNumber(successResult?.subensamble?.antes, 0))} → {formatNumber(asNumber(successResult?.subensamble?.despues, 0))}
              </div>
            </div>
            <div className="kv-row">
              <div className="kv-k">Producto terminado</div>
              <div className="kv-v">
                {formatNumber(asNumber(successResult?.producto_terminado?.antes, 0))} →{' '}
                {formatNumber(asNumber(successResult?.producto_terminado?.despues, 0))}
              </div>
            </div>
          </div>
        </SuccessModal>

        <div className="card">
          <div className="card-title">Convertir subensamble → producto terminado</div>
          <form className="form-grid" onSubmit={onSubmit}>
            <label className="field">
              <span>Subensamble</span>
              {isZebra ? (
                <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                  <input
                    value={scanSubCodigo}
                    onChange={(e) => setScanSubCodigo(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return
                      e.preventDefault()
                      const v = String(scanSubCodigo || '').trim()
                      if (!v) return
                      pickSubensambleByCodigo(v)
                      setScanSubCodigo('')
                    }}
                    placeholder="Escanear QR (código) del subensamble"
                    inputMode="numeric"
                    disabled={isLoading}
                    autoFocus
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      pickSubensambleByCodigo(scanSubCodigo)
                      setScanSubCodigo('')
                    }}
                    disabled={isLoading || !String(scanSubCodigo || '').trim()}
                  >
                    Buscar
                  </button>
                </div>
              ) : null}
              <div style={{ display: 'flex', gap: 10 }}>
                <input
                  value={searchSub}
                  onChange={(e) => setSearchSub(e.target.value)}
                  placeholder="Buscar por código, nombre, subcategoría..."
                  disabled={isLoading}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setIdSub('')
                    setSearchSub('')
                  }}
                  disabled={isLoading || !idSub}
                >
                  Limpiar
                </button>
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                {isLoading
                  ? 'Cargando...'
                  : !isAdmin
                    ? `Mostrando ${subOptionsForFabricacion.length} subensambles (solo asociados).`
                    : `Mostrando ${subOptionsForFabricacion.length} subensambles.`}
              </div>
              <div style={{ marginTop: 10 }}>
                <ItemPicker
                  items={subOptionsForFabricacion}
                  selectedId={idSub}
                  onPick={(next) => setIdSub(next)}
                  disabled={isLoading}
                  pageSize={5}
                  resetKey={`sub:${searchSub}`}
                  emptyText={
                    !subensambles.length
                      ? 'No hay subensambles registrados.'
                      : !isAdmin
                        ? 'No hay subensambles disponibles para fabricar (requieren asociación).'
                        : 'No hay resultados con ese filtro.'
                  }
                />
              </div>
            </label>

            <label className="field">
              <span>Producto terminado</span>
              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: 12,
                  background: 'var(--panel)',
                }}
              >
                {selectedPt ? (
                  <>
                    <div className="mono">
                      {selectedPt.codigo} — {selectedPt.nombre}
                    </div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                      {selectedPt.subcategoria}
                      {selectedPt.medida ? ` • ${selectedPt.medida}` : ''}
                      {selectedPt.ubicacion ? ` • ${selectedPt.ubicacion}` : ''}
                    </div>
                  </>
                ) : (
                  <div className="muted" style={{ fontSize: 13 }}>
                    {idSub
                      ? 'Este subensamble no tiene un producto terminado asociado.'
                      : 'Selecciona un subensamble para asignar automáticamente el producto.'}
                  </div>
                )}
              </div>
              {idSub && !selectedAssoc ? (
                <div className="form-warn" style={{ marginTop: 12 }}>
                  Este subensamble no tiene un producto terminado asociado. Habla con un administrador.
                </div>
              ) : null}
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                Asociado automáticamente por configuración.
              </div>
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

            {!isZebra ? (
              <label className="field">
                <span>Referencia</span>
                <input
                  value={referencia}
                  onChange={(e) => setReferencia(e.target.value)}
                  placeholder="FABRICACION"
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

            {warnings.length ? (
              <div className="form-warn" style={{ gridColumn: '1 / -1' }}>
                {warnings.map((w) => (
                  <div key={w}>{w}</div>
                ))}
              </div>
            ) : null}

            <div className="modal-actions" style={{ gridColumn: '1 / -1' }}>
              <button
                className="primary"
                type="submit"
                disabled={isLoading || isSubmitting || (!isAdmin && !hasAssociationForSelectedSub)}
              >
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
          {!isAdmin && idSub && !hasAssociationForSelectedSub ? (
            <div className="form-warn" style={{ marginTop: 12 }}>
              No hay una asociación configurada para este subensamble. Contacta a un administrador.
            </div>
          ) : null}
        </div>

        {!isZebra ? (
          <div className="grid-2">
            <ItemInfo title="Subensamble" item={selectedSub} />
            <ItemInfo title="Producto terminado" item={selectedPt} />
          </div>
        ) : null}

        {result && !isZebra ? (
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

        {isAdmin ? (
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div className="card-title" style={{ marginBottom: 0 }}>
                Preconfiguración de asociaciones
              </div>
              <button type="button" className="btn" onClick={() => setIsAssocOpen((v) => !v)}>
                {isAssocOpen ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>

            {isAssocOpen ? (
              <>
                {assocError ? <div className="form-error" style={{ marginTop: 12 }}>{assocError}</div> : null}
                <form className="form-grid" onSubmit={onSaveAssoc} style={{ marginTop: 12 }}>
                  <label className="field">
                    <span>Subensamble</span>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <input
                        value={assocSearchSub}
                        onChange={(e) => setAssocSearchSub(e.target.value)}
                        placeholder="Buscar subensamble..."
                        disabled={isLoading || isAssocSubmitting}
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        className="btn"
                        onClick={() => {
                          setAssocSubId('')
                          setAssocSearchSub('')
                        }}
                        disabled={isLoading || isAssocSubmitting || !assocSubId}
                      >
                        Limpiar
                      </button>
                    </div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                      {isLoading ? 'Cargando...' : `Disponibles: ${filteredAssocSubOptions.length}`}
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <ItemPicker
                        items={filteredAssocSubOptions}
                        selectedId={assocSubId}
                        onPick={(next) => setAssocSubId(next)}
                        disabled={isLoading || isAssocSubmitting}
                        pageSize={5}
                        resetKey={`assocSub:${assocSearchSub}`}
                        emptyText={
                          !subensambles.length
                            ? 'No hay subensambles registrados.'
                            : !assocSubOptions.length
                              ? 'No hay subensambles disponibles (ya están asociados).'
                              : 'No hay resultados con ese filtro.'
                        }
                        showQty={false}
                      />
                    </div>
                  </label>

                  <label className="field">
                    <span>Producto terminado</span>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <input
                        value={assocSearchPt}
                        onChange={(e) => setAssocSearchPt(e.target.value)}
                        placeholder="Buscar producto terminado..."
                        disabled={isLoading || isAssocSubmitting}
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        className="btn"
                        onClick={() => {
                          setAssocPtId('')
                          setAssocSearchPt('')
                        }}
                        disabled={isLoading || isAssocSubmitting || !assocPtId}
                      >
                        Limpiar
                      </button>
                    </div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                      {isLoading ? 'Cargando...' : `Disponibles: ${filteredAssocPtOptions.length}`}
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <ItemPicker
                        items={filteredAssocPtOptions}
                        selectedId={assocPtId}
                        onPick={(next) => setAssocPtId(next)}
                        disabled={isLoading || isAssocSubmitting}
                        pageSize={5}
                        resetKey={`assocPt:${assocSearchPt}`}
                        emptyText={
                          !productosTerminados.length
                            ? 'No hay productos terminados registrados.'
                            : !assocPtOptions.length
                              ? 'No hay productos terminados disponibles (ya están asociados).'
                              : 'No hay resultados con ese filtro.'
                        }
                        showQty={false}
                      />
                    </div>
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
              </>
            ) : (
              <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
                {Array.isArray(asociaciones) && asociaciones.length
                  ? `Asociaciones configuradas: ${asociaciones.length}.`
                  : 'Sin asociaciones configuradas.'}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </section>
  )
}
