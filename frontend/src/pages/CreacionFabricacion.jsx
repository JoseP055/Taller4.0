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
  const [materiasPrimas, setMateriasPrimas] = useState([])
  const [productosTerminados, setProductosTerminados] = useState([])
  const [asociaciones, setAsociaciones] = useState([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [mode, setMode] = useState('receta')

  const [searchSub, setSearchSub] = useState('')
  const [idSub, setIdSub] = useState('')
  const [idPt, setIdPt] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [referencia, setReferencia] = useState('FABRICACION')
  const [observaciones, setObservaciones] = useState('')
  const [scanSubCodigo, setScanSubCodigo] = useState('')
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
    if (isZebra && mode !== 'receta') setMode('receta')
  }, [isZebra, mode])

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

    const requests = [
      fetchJson(`/inventario/subensambles/items?${qs.toString()}`, { signal: controller.signal }),
      fetchJson(`/inventario/productos-terminados/items?${qs.toString()}`, { signal: controller.signal }),
      fetchJson('/logistica/asociaciones', { signal: controller.signal }),
      ...(isAdmin ? [fetchJson(`/inventario/materias-primas/items?${qs.toString()}`, { signal: controller.signal })] : []),
    ]

    Promise.all(requests)
      .then(([subData, ptData, assocData, mpData]) => {
        setSubensambles(normalizeItems(subData))
        setMateriasPrimas(isAdmin && mpData ? normalizeItems(mpData) : [])
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
  }, [refreshKey, isAdmin])

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
    if (mode !== 'asociacion') return
    if (isAdmin) return
    if (idSub && !assocBySub.has(String(idSub))) {
      setIdSub('')
      setIdPt('')
    }
  }, [mode, idSub, assocBySub, isAdmin])

  useEffect(() => {
    if (mode !== 'asociacion') return
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
  }, [mode, assocBySub, idSub, idPt])

  const qty = useMemo(() => {
    const raw = String(cantidad).trim()
    if (!raw) return null
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? n : NaN
  }, [cantidad])

  const ptOptions = useMemo(() => productosTerminados, [productosTerminados])

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

    if (!selectedSub) return setError('Selecciona un subensamble.')
    if (!selectedPt) return setError('Selecciona un producto terminado.')
    const assoc = assocBySub.get(String(selectedSub.id))
    if (!assoc) return setError('Este subensamble no tiene asociación configurada.')
    if (String(assoc.id_producto_terminado) !== String(selectedPt.id))
      return setError('El producto terminado no corresponde a la asociación configurada.')
    if (qty === null) return setError('Ingresa una cantidad.')
    if (Number.isNaN(qty)) return setError('Cantidad inválida.')
    if (selectedSub.cantidad - qty < 0) return setError('No hay suficiente subensamble para fabricar esa cantidad.')

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
        {!isZebra ? (
          <div className="card" style={{ padding: 12 }}>
            <div className="segmented">
              <button type="button" className={mode === 'receta' ? 'seg active' : 'seg'} onClick={() => setMode('receta')}>
                Receta
              </button>
              <button
                type="button"
                className={mode === 'asociacion' ? 'seg active' : 'seg'}
                onClick={() => setMode('asociacion')}
              >
                Asociación
              </button>
            </div>
          </div>
        ) : null}
        <SuccessModal
          open={successOpen}
          title="Fabricación completada"
          onAccept={() => {
            setSuccessOpen(false)
            setSuccessResult(null)
            setResult(null)
            setSearchSub('')
            setIdSub('')
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
            {successResult?.receta ? (
              <div className="kv-row">
                <div className="kv-k">Receta</div>
                <div className="kv-v" style={{ fontWeight: 800 }}>
                  {successResult?.receta?.nombre} v{successResult?.receta?.version}
                </div>
              </div>
            ) : null}
            {Array.isArray(successResult?.componentes) ? (
              <div className="kv-row">
                <div className="kv-k">Componentes</div>
                <div className="kv-v">{formatNumber(successResult.componentes.length)}</div>
              </div>
            ) : null}
            {successResult?.subensamble ? (
              <div className="kv-row">
                <div className="kv-k">Subensamble</div>
                <div className="kv-v">
                  {formatNumber(asNumber(successResult?.subensamble?.antes, 0))} → {formatNumber(asNumber(successResult?.subensamble?.despues, 0))}
                </div>
              </div>
            ) : null}
            <div className="kv-row">
              <div className="kv-k">Producto terminado</div>
              <div className="kv-v">
                {formatNumber(asNumber(successResult?.producto_terminado?.antes, 0))} →{' '}
                {formatNumber(asNumber(successResult?.producto_terminado?.despues, 0))}
              </div>
            </div>
          </div>
        </SuccessModal>

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

        {mode === 'receta' ? (
          <div className="card">
            <div className="card-title">Producir desde receta</div>
            <form className="form-grid" onSubmit={onSubmitReceta}>
              <label className="field">
                <span>Producto terminado</span>
                <select value={recetaPtId} onChange={(e) => setRecetaPtId(e.target.value)}>
                  <option value="">Selecciona…</option>
                  {ptOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.codigo} — {p.nombre}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Receta</span>
                <select value={recetaId} onChange={(e) => setRecetaId(e.target.value)} disabled={!recetas.length}>
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
                  disabled={isRecetaSubmitting || recetaTieneFaltantes}
                >
                  {isRecetaSubmitting ? 'Procesando...' : 'Registrar fabricación'}
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {mode === 'asociacion' ? (
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
        ) : null}

        {!isZebra ? (
          mode === 'asociacion' ? (
            <div className="grid-2">
              <ItemInfo title="Subensamble" item={selectedSub} />
              <ItemInfo title="Producto terminado" item={selectedPt} />
            </div>
          ) : (
            <div className="grid-2">
              <ItemInfo
                title="Producto terminado"
                item={ptOptions.find((p) => String(p.id) === String(recetaPtId)) || null}
              />
              <div className="card">
                <div className="card-title">Receta</div>
                <div className="kv">
                  <div className="kv-row">
                    <div className="kv-k">Seleccionada</div>
                    <div className="kv-v">
                      {selectedReceta?.nombre || '-'}
                    </div>
                  </div>
                  <div className="kv-row">
                    <div className="kv-k">Insumos</div>
                    <div className="kv-v">
                      {formatNumber(Array.isArray(selectedReceta?.items) ? selectedReceta.items.length : 0)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        ) : null}

        {result && !isZebra ? (
          <div className="card">
            <div className="card-title">Resultado</div>
            <div className="kv">
              <div className="kv-row">
                <div className="kv-k">Cantidad</div>
                <div className="kv-v">{formatNumber(asNumber(result.cantidad, 0))}</div>
              </div>
              {result?.subensamble ? (
                <div className="kv-row">
                  <div className="kv-k">Subensamble después</div>
                  <div className="kv-v">{formatNumber(asNumber(result?.subensamble?.despues, 0))}</div>
                </div>
              ) : null}
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
            <div
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
            >
              <div className="card-title" style={{ marginBottom: 0 }}>
                Recetas
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
                    <select value={formPtId} onChange={(e) => setFormPtId(e.target.value)}>
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
                    <input value={formNombre} onChange={(e) => setFormNombre(e.target.value)} />
                  </label>

                  <div className="field" style={{ gridColumn: '1 / -1' }}>
                    <span>Insumos (materia prima o subensamble)</span>
                    {formItems.map((it, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                        <select
                          value={it.id_articulo}
                          onChange={(e) => {
                            const next = [...formItems]
                            next[idx] = { ...next[idx], id_articulo: e.target.value }
                            setFormItems(next)
                          }}
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
                        />
                        <button
                          type="button"
                          className="btn"
                          onClick={() => setFormItems(formItems.filter((_, i) => i !== idx))}
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
                  {allRecetas.map((r) => (
                    <div key={r.id_receta} className="kv-row">
                      <div className="kv-k">
                        {r.producto_terminado} — {r.nombre}
                      </div>
                      <div
                        className="kv-v"
                        style={{ display: 'flex', gap: 8, alignItems: 'center' }}
                      >
                        <span className="muted">
                          {Array.isArray(r.items) ? r.items.length : 0} insumo(s)
                          {r.activa ? '' : ' · inactiva'}
                        </span>
                        <button
                          className="btn"
                          onClick={async () => {
                            await fetchApi(`/logistica/recetas/${r.id_receta}/activa`, {
                              method: 'PATCH',
                              body: { activa: !r.activa },
                            })
                            setRefreshKey((k) => k + 1)
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
                            await fetchApi(`/logistica/recetas/${r.id_receta}`, {
                              method: 'DELETE',
                            })
                            setRefreshKey((k) => k + 1)
                          }}
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {isAdmin && mode === 'asociacion' ? (
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
