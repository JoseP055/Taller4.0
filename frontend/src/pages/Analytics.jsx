import { useEffect, useMemo, useState } from 'react'

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

function formatNumber(n) {
  return new Intl.NumberFormat('es-ES').format(n)
}

function asNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function normalizeItems(kind, data) {
  const rows = Array.isArray(data?.items) ? data.items : []
  return rows.map((x) => ({
    kind,
    id: x.id,
    codigo: String(x.codigo ?? ''),
    nombre: String(x.nombre ?? ''),
    medida: String(x.medida ?? ''),
    cantidad: asNumber(x.cantidad, 0),
    unidad: String(x.unidad ?? ''),
    minStock: asNumber(x.min_stock, 0),
    maxStock: asNumber(x.max_stock, 0),
    puntoReorden: asNumber(x.punto_reorden, 0),
    ubicacion: String(x.ubicacion ?? ''),
  }))
}

function normalizeGroupKey(nombre) {
  return String(nombre || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
}

function buildGroups(items) {
  const groups = new Map()
  for (const it of items) {
    const key = normalizeGroupKey(it.nombre)
    if (!key) continue
    const dim = String(it.medida || '').trim() || 'NO POSEE'
    const g = groups.get(key) || {
      key,
      nombre: key,
      totalCantidad: 0,
      unidad: it.unidad || '',
      variants: new Map(),
      alerts: 0,
      sobreMax: 0,
    }
    g.totalCantidad += asNumber(it.cantidad, 0)
    if (!g.unidad) g.unidad = it.unidad || ''

    const vKey = String(dim).toUpperCase()
    const v = g.variants.get(vKey) || {
      medida: vKey,
      cantidad: 0,
      min: null,
      max: null,
      reorder: null,
      alert: false,
      over: false,
      examples: [],
    }
    v.cantidad += asNumber(it.cantidad, 0)
    v.min = v.min === null ? it.minStock : Math.max(v.min, it.minStock)
    v.max = v.max === null ? it.maxStock : Math.max(v.max, it.maxStock)
    v.reorder = v.reorder === null ? it.puntoReorden : Math.max(v.reorder, it.puntoReorden)
    v.alert = v.alert || (it.minStock > 0 && it.cantidad < it.minStock)
    v.over = v.over || (it.maxStock > 0 && it.cantidad > it.maxStock)
    if (v.examples.length < 3) v.examples.push(it.codigo)
    g.variants.set(vKey, v)

    if (it.minStock > 0 && it.cantidad < it.minStock) g.alerts += 1
    if (it.maxStock > 0 && it.cantidad > it.maxStock) g.sobreMax += 1
    groups.set(key, g)
  }

  return Array.from(groups.values()).map((g) => ({
    ...g,
    variants: Array.from(g.variants.values()).sort((a, b) => a.medida.localeCompare(b.medida)),
  }))
}

function kindLabel(kind) {
  if (kind === 'materias-primas') return 'Materia Prima'
  if (kind === 'subensambles') return 'Subensambles'
  if (kind === 'productos-terminados') return 'Productos Terminados'
  return kind
}

function useLocalStorageState(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return initialValue
      return JSON.parse(raw)
    } catch {
      return initialValue
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      return
    }
  }, [key, value])

  return [value, setValue]
}

function Bars({ title, series, onSelectLabel }) {
  const max = useMemo(() => {
    let m = 0
    for (const item of series) m = Math.max(m, item.value)
    return m || 1
  }, [series])

  return (
    <div className="card">
      <div className="card-title">{title}</div>
      <div className="bars">
        {series.map((x) => (
          <button
            type="button"
            className="bar-row"
            key={x.label}
            onClick={() => onSelectLabel?.(x.label)}
            style={{
              border: 'none',
              background: 'transparent',
              padding: 0,
              textAlign: 'left',
              cursor: onSelectLabel ? 'pointer' : 'default',
            }}
            title={x.hint || ''}
          >
            <div className="bar-label" title={x.label}>
              {x.label}
            </div>
            <div className="bar-track" aria-hidden="true">
              <div className="bar-fill" style={{ width: `${(x.value / max) * 100}%` }} />
            </div>
            <div className="bar-value">{formatNumber(x.value)}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

function StackedBars({ title, rows, series, enabledMap, onToggleSeries, valueFormatter }) {
  const max = useMemo(() => {
    let m = 0
    for (const r of rows) {
      let t = 0
      for (const s of series) {
        if (!enabledMap[s.key]) continue
        t += asNumber(r[s.key], 0)
      }
      m = Math.max(m, t)
    }
    return m || 1
  }, [rows, series, enabledMap])

  return (
    <div className="card">
      <div className="card-title">{title}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {series.map((s) => (
          <button
            key={s.key}
            type="button"
            className={enabledMap[s.key] ? 'btn' : 'btn danger'}
            onClick={() => onToggleSeries(s.key)}
            style={{ borderColor: enabledMap[s.key] ? 'var(--border)' : 'rgba(100,116,139,0.35)' }}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="bars">
        {rows.map((r) => {
          let total = 0
          for (const s of series) if (enabledMap[s.key]) total += asNumber(r[s.key], 0)
          const scaledPct = (total / max) * 100
          return (
            <div key={r.label} className="bar-row" title={r.label} style={{ cursor: 'default' }}>
              <div className="bar-label">{r.label}</div>
              <div className="bar-track" aria-hidden="true" style={{ display: 'flex' }}>
                <div style={{ width: `${scaledPct}%`, display: 'flex', height: '100%' }}>
                  {series.map((s) => {
                    if (!enabledMap[s.key]) return null
                    const v = asNumber(r[s.key], 0)
                    const pct = total > 0 ? (v / total) * 100 : 0
                    return (
                      <div
                        key={s.key}
                        style={{
                          width: `${pct}%`,
                          background: s.color,
                          height: '100%',
                        }}
                        title={`${s.label}: ${valueFormatter(v)}`}
                      />
                    )
                  })}
                </div>
              </div>
              <div className="bar-value">{valueFormatter(total)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function GroupModal({ group, onClose }) {
  if (!group) return null
  const reorder = group.variants.reduce((acc, v) => {
    const vMin = asNumber(v.min, 0)
    const vQty = asNumber(v.cantidad, 0)
    if (vMin > 0 && vQty < vMin) return acc + (vMin - vQty)
    return acc
  }, 0)
  const exceso = group.variants.reduce((acc, v) => {
    const vMax = asNumber(v.max, 0)
    const vQty = asNumber(v.cantidad, 0)
    if (vMax > 0 && vQty > vMax) return acc + (vQty - vMax)
    return acc
  }, 0)

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal" style={{ maxWidth: 980 }}>
        <div className="modal-head">
          <div className="modal-title">Grupo: {group.nombre}</div>
          <button type="button" className="btn" onClick={onClose}>
            Cerrar
          </button>
        </div>
        <div className="modal-body">
          <div className="stats" style={{ marginTop: 0 }}>
            <div className="stat-card">
              <div className="stat-label">Existencia</div>
              <div className="stat-value">{formatNumber(Math.round(group.totalCantidad))}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Variantes</div>
              <div className="stat-value">{formatNumber(group.variants.length)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Reorden sugerido</div>
              <div className="stat-value">{formatNumber(Math.round(reorder))}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Exceso</div>
              <div className="stat-value">{formatNumber(Math.round(exceso))}</div>
            </div>
          </div>

          <div className="table-wrap">
            <table className="table" style={{ minWidth: 820 }}>
              <thead>
                <tr>
                  <th>Medida</th>
                  <th className="num">Stock</th>
                  <th className="num">Mín</th>
                  <th className="num">Máx</th>
                  <th className="num">Reorden</th>
                  <th>Ejemplos</th>
                </tr>
              </thead>
              <tbody>
                {group.variants.map((v) => (
                  <tr key={v.medida}>
                    <td>{v.medida}</td>
                    <td className="num">{formatNumber(Math.round(asNumber(v.cantidad, 0)))}</td>
                    <td className="num">{formatNumber(asNumber(v.min, 0))}</td>
                    <td className="num">{formatNumber(asNumber(v.max, 0))}</td>
                    <td className="num">{formatNumber(asNumber(v.reorder, 0))}</td>
                    <td className="mono">{(v.examples || []).join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Analytics() {
  const [kind, setKind] = useLocalStorageState('an:kind', 'productos-terminados')
  const [search, setSearch] = useLocalStorageState('an:search', '')
  const [dim, setDim] = useLocalStorageState('an:dim', '')
  const [status, setStatus] = useLocalStorageState('an:status', 'all')
  const [qtyMin, setQtyMin] = useLocalStorageState('an:qtyMin', '')
  const [qtyMax, setQtyMax] = useLocalStorageState('an:qtyMax', '')
  const [sort, setSort] = useLocalStorageState('an:sort', 'cantidad')
  const [days, setDays] = useLocalStorageState('an:days', 30)
  const [movementEnabled, setMovementEnabled] = useLocalStorageState('an:movEnabled', {
    pt_salida_proy: true,
    pt_devol_proy: true,
    fab_entrada: true,
    fab_salida: true,
  })
  const [selectedGroupKey, setSelectedGroupKey] = useState('')
  const [isFiltersOpen, setIsFiltersOpen] = useState(true)

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [items, setItems] = useState([])
  const [daily, setDaily] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setIsLoading(true)
    setError('')
    setDaily(null)

    const qs = new URLSearchParams({ estatus: 'Todas', limit: '1000', offset: '0', search: '' })

    Promise.all([
      fetchJson(`/inventario/${kind}/items?${qs.toString()}`, { signal: controller.signal }).then((d) =>
        normalizeItems(kind, d),
      ),
      fetchJson(`/analytics/movimientos/daily?days=${encodeURIComponent(String(days))}`, {
        signal: controller.signal,
      }).catch(() => null),
    ])
      .then(([rows, dailyData]) => {
        setItems(rows)
        setDaily(dailyData)
      })
      .catch((e) => {
        if (controller.signal.aborted) return
        setItems([])
        setError(e?.message || 'No se pudo cargar analytics')
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })

    return () => controller.abort()
  }, [kind, days, refreshKey])

  const filteredItems = useMemo(() => {
    const term = String(search || '').trim().toUpperCase()
    const d = String(dim || '').trim().toUpperCase()
    const min = String(qtyMin || '').trim()
    const max = String(qtyMax || '').trim()
    const minN = min ? Number(min) : null
    const maxN = max ? Number(max) : null

    let rows = items
    if (term) {
      rows = rows.filter((x) => {
        const hay = `${x.codigo} ${x.nombre} ${x.medida}`.toUpperCase()
        return hay.includes(term)
      })
    }
    if (d) rows = rows.filter((x) => String(x.medida || '').toUpperCase().includes(d))
    if (status === 'below_min') rows = rows.filter((x) => x.minStock > 0 && x.cantidad < x.minStock)
    if (status === 'over_max') rows = rows.filter((x) => x.maxStock > 0 && x.cantidad > x.maxStock)
    if (status === 'zero') rows = rows.filter((x) => asNumber(x.cantidad, 0) === 0)
    if (status === 'healthy')
      rows = rows.filter((x) => !(x.minStock > 0 && x.cantidad < x.minStock) && !(x.maxStock > 0 && x.cantidad > x.maxStock))
    if (minN !== null && Number.isFinite(minN)) rows = rows.filter((x) => x.cantidad >= minN)
    if (maxN !== null && Number.isFinite(maxN)) rows = rows.filter((x) => x.cantidad <= maxN)
    return rows
  }, [items, search, dim, status, qtyMin, qtyMax])

  const groups = useMemo(() => {
    const g = buildGroups(filteredItems)
    if (sort === 'alertas') g.sort((a, b) => b.alerts - a.alerts || b.totalCantidad - a.totalCantidad)
    else if (sort === 'sobremax') g.sort((a, b) => b.sobreMax - a.sobreMax || b.totalCantidad - a.totalCantidad)
    else g.sort((a, b) => b.totalCantidad - a.totalCantidad)
    return g
  }, [filteredItems, sort])

  const dailyRows = useMemo(() => {
    const rows = Array.isArray(daily?.rows) ? daily.rows : []
    return rows.map((r) => ({
      label: String(r.dia),
      pt_salida_proy: asNumber(r.pt_salida_proy, 0),
      pt_devol_proy: asNumber(r.pt_devol_proy, 0),
      fab_entrada: asNumber(r.fab_entrada, 0),
      fab_salida: asNumber(r.fab_salida, 0),
    }))
  }, [daily])

  const movementSeriesSpec = useMemo(
    () => [
      { key: 'pt_salida_proy', label: 'PT salida', color: 'rgba(37, 99, 235, 0.75)' },
      { key: 'pt_devol_proy', label: 'PT devolución', color: 'rgba(16, 185, 129, 0.75)' },
      { key: 'fab_entrada', label: 'Fab entrada', color: 'rgba(245, 158, 11, 0.75)' },
      { key: 'fab_salida', label: 'Fab salida', color: 'rgba(239, 68, 68, 0.65)' },
    ],
    [],
  )

  const dailyKpis = useMemo(() => {
    let ptSalida = 0
    let ptDevol = 0
    let fabIn = 0
    let fabOut = 0
    for (const r of dailyRows) {
      ptSalida += asNumber(r.pt_salida_proy, 0)
      ptDevol += asNumber(r.pt_devol_proy, 0)
      fabIn += asNumber(r.fab_entrada, 0)
      fabOut += asNumber(r.fab_salida, 0)
    }
    return { ptSalida, ptDevol, fabIn, fabOut }
  }, [dailyRows])

  const invKpis = useMemo(() => {
    const totalItems = filteredItems.length
    const totalCantidad = filteredItems.reduce((acc, x) => acc + asNumber(x.cantidad, 0), 0)
    const alertas = filteredItems.filter((x) => x.minStock > 0 && x.cantidad < x.minStock).length
    const sobreMax = filteredItems.filter((x) => x.maxStock > 0 && x.cantidad > x.maxStock).length
    const reorderSuggested = filteredItems.reduce((acc, x) => {
      if (x.minStock > 0 && x.cantidad < x.minStock) return acc + (x.minStock - x.cantidad)
      return acc
    }, 0)
    return { totalItems, totalCantidad, alertas, sobreMax, reorderSuggested }
  }, [filteredItems])

  const paretoSeries = useMemo(() => {
    const total = groups.reduce((acc, g) => acc + asNumber(g.totalCantidad, 0), 0) || 1
    let cumulative = 0
    return groups.slice(0, 12).map((g) => {
      cumulative += asNumber(g.totalCantidad, 0)
      const pct = Math.round((cumulative / total) * 100)
      return {
        label: g.nombre,
        value: Math.round(asNumber(g.totalCantidad, 0)),
        hint: `Acumulado: ${pct}%`,
      }
    })
  }, [groups])

  const selectedGroup = useMemo(() => {
    if (!selectedGroupKey) return null
    return groups.find((g) => g.key === selectedGroupKey) || null
  }, [groups, selectedGroupKey])

  return (
    <section className="page">
      <header className="page-header">
        <h2>Analytics</h2>
      </header>

      <div className="page-body">
        {error ? <div className="form-error">{error}</div> : null}

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>
              Vista analítica (BI)
            </div>
            <button type="button" className="btn" onClick={() => setIsFiltersOpen((v) => !v)}>
              {isFiltersOpen ? 'Ocultar filtros' : 'Mostrar filtros'}
            </button>
          </div>

          {isFiltersOpen ? (
            <div className="form-grid" style={{ marginTop: 12 }}>
            <label className="field">
              <span>Área</span>
              <select value={kind} onChange={(e) => setKind(e.target.value)} disabled={isLoading}>
                <option value="materias-primas">Materia Prima</option>
                <option value="subensambles">Subensambles</option>
                <option value="productos-terminados">Productos Terminados</option>
              </select>
            </label>
            <label className="field">
              <span>Ordenar grupos por</span>
              <select value={sort} onChange={(e) => setSort(e.target.value)} disabled={isLoading}>
                <option value="cantidad">Existencia</option>
                <option value="alertas">Alertas</option>
                <option value="sobremax">Sobre máximo</option>
              </select>
            </label>
            <label className="field">
              <span>Movimientos (días)</span>
              <select value={String(days)} onChange={(e) => setDays(Number(e.target.value))} disabled={isLoading}>
                <option value="7">7</option>
                <option value="14">14</option>
                <option value="30">30</option>
                <option value="90">90</option>
                <option value="180">180</option>
              </select>
            </label>
            <label className="field" style={{ gridColumn: '1 / -1' }}>
              <span>Buscar</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ej: CODO 4, COUPLING, TRANSICION..."
                disabled={isLoading}
              />
            </label>
            <label className="field">
              <span>Filtrar por medida</span>
              <input value={dim} onChange={(e) => setDim(e.target.value)} placeholder='Ej: "4", "PULG"' disabled={isLoading} />
            </label>
            <label className="field">
              <span>Estado</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)} disabled={isLoading}>
                <option value="all">Todos</option>
                <option value="below_min">Bajo mínimo</option>
                <option value="over_max">Sobre máximo</option>
                <option value="zero">Cero stock</option>
                <option value="healthy">Saludable</option>
              </select>
            </label>
            <label className="field">
              <span>Stock mín. (≥)</span>
              <input value={qtyMin} onChange={(e) => setQtyMin(e.target.value)} inputMode="decimal" placeholder="0" />
            </label>
            <label className="field">
              <span>Stock máx. (≤)</span>
              <input value={qtyMax} onChange={(e) => setQtyMax(e.target.value)} inputMode="decimal" placeholder="" />
            </label>
            <div className="modal-actions" style={{ gridColumn: '1 / -1' }}>
              <button className="btn" type="button" onClick={() => setRefreshKey((k) => k + 1)} disabled={isLoading}>
                Recargar
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => {
                  setSearch('')
                  setDim('')
                  setStatus('all')
                  setQtyMin('')
                  setQtyMax('')
                  setSelectedGroupKey('')
                }}
                disabled={isLoading}
              >
                Limpiar filtros
              </button>
            </div>
            </div>
          ) : null}
          <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            Área: {kindLabel(kind)} · Filas: {formatNumber(filteredItems.length)} (límite 1000) · Grupos: {formatNumber(groups.length)}
          </div>
        </div>

        <div className="stats">
          <div className="stat-card">
            <div className="stat-label">Artículos</div>
            <div className="stat-value">{isLoading ? '-' : formatNumber(invKpis.totalItems)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Existencia total</div>
            <div className="stat-value">{isLoading ? '-' : formatNumber(Math.round(invKpis.totalCantidad))}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Bajo mínimo</div>
            <div className="stat-value">{isLoading ? '-' : formatNumber(invKpis.alertas)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Sobre máximo</div>
            <div className="stat-value">{isLoading ? '-' : formatNumber(invKpis.sobreMax)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Reorden sugerido</div>
            <div className="stat-value">{isLoading ? '-' : formatNumber(Math.round(invKpis.reorderSuggested))}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Net PT→Proyecto</div>
            <div className="stat-value">
              {isLoading ? '-' : formatNumber(Math.round(dailyKpis.ptSalida - dailyKpis.ptDevol))}
            </div>
          </div>
        </div>

        <div className="grid-2">
          <StackedBars
            title="Movimientos (stacked por día)"
            rows={dailyRows}
            series={movementSeriesSpec}
            enabledMap={movementEnabled}
            onToggleSeries={(key) => setMovementEnabled((m) => ({ ...m, [key]: !m[key] }))}
            valueFormatter={(n) => formatNumber(Math.round(n))}
          />
          <Bars
            title="Pareto (top grupos por existencia)"
            series={paretoSeries}
            onSelectLabel={(label) => setSelectedGroupKey(normalizeGroupKey(label))}
          />
        </div>

        <div className="card">
          <div className="card-title">Grupos y variantes (clic para ver detalle)</div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Nombre común</th>
                  <th className="num">Existencia</th>
                  <th className="num">Alertas</th>
                  <th className="num">Sobre máx.</th>
                  <th>Variantes (medidas)</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="empty">
                      Cargando...
                    </td>
                  </tr>
                ) : groups.length ? (
                  groups.slice(0, 80).map((g) => (
                    <tr
                      key={g.key}
                      onClick={() => setSelectedGroupKey(g.key)}
                      style={{ cursor: 'pointer' }}
                      title="Click para ver detalle"
                    >
                      <td className="mono">{g.nombre}</td>
                      <td className="num">{formatNumber(Math.round(g.totalCantidad))}</td>
                      <td className="num">{formatNumber(g.alerts)}</td>
                      <td className="num">{formatNumber(g.sobreMax)}</td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {g.variants.slice(0, 5).map((v) => (
                            <div key={v.medida} className="muted" style={{ fontSize: 13 }}>
                              {v.medida}: {formatNumber(Math.round(v.cantidad))} {g.unidad || ''}{' '}
                              {v.alert ? '· BAJO MIN' : ''} {v.over ? '· SOBRE MAX' : ''}{' '}
                              {v.examples.length ? `· ej: ${v.examples.join(', ')}` : ''}
                            </div>
                          ))}
                          {g.variants.length > 5 ? (
                            <div className="muted" style={{ fontSize: 12 }}>
                              (+{g.variants.length - 5} variantes)
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="empty">
                      Sin resultados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {!isLoading && groups.length > 80 ? (
            <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
              Mostrando 80 de {groups.length}. Usa el buscador para refinar.
            </div>
          ) : null}
        </div>
        <GroupModal group={selectedGroup} onClose={() => setSelectedGroupKey('')} />
      </div>
    </section>
  )
}
