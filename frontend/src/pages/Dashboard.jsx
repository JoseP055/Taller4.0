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
    subcategoria: String(x.subcategoria ?? ''),
    medida: String(x.medida ?? ''),
    cantidad: asNumber(x.cantidad, 0),
    unidad: String(x.unidad ?? ''),
    minStock: asNumber(x.min_stock, 0),
    maxStock: asNumber(x.max_stock, 0),
    puntoReorden: asNumber(x.punto_reorden, 0),
    ubicacion: String(x.ubicacion ?? ''),
  }))
}

function StatCard({ label, value, sublabel }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sublabel ? <div className="stat-sublabel">{sublabel}</div> : null}
    </div>
  )
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

function StackedBars({
  title,
  rows,
  series,
  enabledMap,
  onToggleSeries,
  onSelectLabel,
  valueFormatter,
}) {
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
            <button
              type="button"
              key={r.label}
              onClick={() => onSelectLabel?.(r.label)}
              className="bar-row"
              style={{
                border: 'none',
                background: 'transparent',
                padding: 0,
                textAlign: 'left',
                cursor: onSelectLabel ? 'pointer' : 'default',
              }}
              title={
                series
                  .filter((s) => enabledMap[s.key])
                  .map((s) => `${s.label}: ${valueFormatter(asNumber(r[s.key], 0))}`)
                  .join('\n') || ''
              }
            >
              <div className="bar-label" title={r.label}>
                {r.label}
              </div>
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
                      />
                    )
                  })}
                </div>
              </div>
              <div className="bar-value">{valueFormatter(total)}</div>
            </button>
          )
        })}
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
        Tip: toca una fila para filtrar por etiqueta.
      </div>
    </div>
  )
}

function normalizeGroupKey(nombre) {
  return String(nombre || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
}

function groupByNombre(items) {
  const groups = new Map()
  for (const it of items) {
    const key = normalizeGroupKey(it.nombre)
    if (!key) continue
    const dim = String(it.medida || '').trim() || 'NO POSEE'
    let g = groups.get(key)
    if (!g) {
      g = {
        key,
        nombre: key,
        totalCantidad: 0,
        unidad: it.unidad || '',
        variants: new Map(),
        alerts: 0,
      }
      groups.set(key, g)
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
      items: [],
    }
    v.cantidad += asNumber(it.cantidad, 0)
    v.min = v.min === null ? it.minStock : Math.max(v.min, it.minStock)
    v.max = v.max === null ? it.maxStock : Math.max(v.max, it.maxStock)
    v.reorder = v.reorder === null ? it.puntoReorden : Math.max(v.reorder, it.puntoReorden)
    v.items.push(it)
    g.variants.set(vKey, v)

    if (it.minStock > 0 && it.cantidad < it.minStock) g.alerts += 1
  }

  const out = Array.from(groups.values()).map((g) => ({
    ...g,
    variants: Array.from(g.variants.values()).sort((a, b) => a.medida.localeCompare(b.medida)),
  }))
  out.sort((a, b) => b.totalCantidad - a.totalCantidad)
  return out
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

function GroupModal({ group, onClose }) {
  if (!group) return null
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal" style={{ maxWidth: 900 }}>
        <div className="modal-head">
          <div className="modal-title">{group.nombre}</div>
          <button type="button" className="btn" onClick={onClose}>
            Cerrar
          </button>
        </div>
        <div className="modal-body">
          <div className="kv">
            <div className="kv-row">
              <div className="kv-k">Existencia total</div>
              <div className="kv-v">
                {formatNumber(Math.round(group.totalCantidad))} {group.unidad || ''}
              </div>
            </div>
            <div className="kv-row">
              <div className="kv-k">Variantes</div>
              <div className="kv-v">{formatNumber(group.variants.length)}</div>
            </div>
          </div>
          <div className="table-wrap">
            <table className="table" style={{ minWidth: 740 }}>
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
                    <td className="num">{formatNumber(Math.round(v.cantidad))}</td>
                    <td className="num">{formatNumber(asNumber(v.min, 0))}</td>
                    <td className="num">{formatNumber(asNumber(v.max, 0))}</td>
                    <td className="num">{formatNumber(asNumber(v.reorder, 0))}</td>
                    <td className="mono">
                      {v.items
                        .slice(0, 4)
                        .map((x) => x.codigo)
                        .join(', ')}
                      {v.items.length > 4 ? ` (+${v.items.length - 4})` : ''}
                    </td>
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

export default function Dashboard() {
  const [kinds, setKinds] = useLocalStorageState('dash:kinds', [
    'materias-primas',
    'subensambles',
    'productos-terminados',
  ])
  const [days, setDays] = useLocalStorageState('dash:days', 30)
  const [search, setSearch] = useLocalStorageState('dash:search', '')
  const [dim, setDim] = useLocalStorageState('dash:dim', '')
  const [status, setStatus] = useLocalStorageState('dash:status', 'all')
  const [qtyMin, setQtyMin] = useLocalStorageState('dash:qtyMin', '')
  const [qtyMax, setQtyMax] = useLocalStorageState('dash:qtyMax', '')
  const [topN, setTopN] = useLocalStorageState('dash:topN', 12)
  const [selectedGroupKey, setSelectedGroupKey] = useState('')
  const [selectedDay, setSelectedDay] = useState('')
  const [isFiltersOpen, setIsFiltersOpen] = useState(true)
  const [movementEnabled, setMovementEnabled] = useLocalStorageState('dash:movEnabled', {
    pt_salida_proy: true,
    pt_devol_proy: true,
    fab_entrada: true,
    fab_salida: true,
  })

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

    const limit = '1000'
    const baseQs = new URLSearchParams({ estatus: 'Todas', limit, offset: '0', search: '' })

    const nextKinds = Array.isArray(kinds) && kinds.length ? kinds : ['productos-terminados']

    Promise.all([
      Promise.all(
        nextKinds.map((k) =>
          fetchJson(`/inventario/${k}/items?${baseQs.toString()}`, { signal: controller.signal }).then((d) =>
            normalizeItems(k, d),
          ),
        ),
      ).then((lists) => lists.flat()),
      fetchJson(`/analytics/movimientos/daily?days=${encodeURIComponent(String(days))}`, {
        signal: controller.signal,
      }).catch(() => null),
    ])
      .then(([invItems, dailyData]) => {
        setItems(invItems)
        setDaily(dailyData)
      })
      .catch((e) => {
        if (controller.signal.aborted) return
        setItems([])
        setError(e?.message || 'No se pudo cargar dashboard')
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })

    return () => controller.abort()
  }, [kinds, days, refreshKey])

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
        const hay = `${x.codigo} ${x.nombre} ${x.medida} ${x.subcategoria}`.toUpperCase()
        return hay.includes(term)
      })
    }
    if (d) {
      rows = rows.filter((x) => String(x.medida || '').toUpperCase().includes(d))
    }
    if (status === 'below_min') rows = rows.filter((x) => x.minStock > 0 && x.cantidad < x.minStock)
    if (status === 'over_max') rows = rows.filter((x) => x.maxStock > 0 && x.cantidad > x.maxStock)
    if (status === 'zero') rows = rows.filter((x) => asNumber(x.cantidad, 0) === 0)
    if (status === 'healthy')
      rows = rows.filter((x) => !(x.minStock > 0 && x.cantidad < x.minStock) && !(x.maxStock > 0 && x.cantidad > x.maxStock))
    if (minN !== null && Number.isFinite(minN)) rows = rows.filter((x) => x.cantidad >= minN)
    if (maxN !== null && Number.isFinite(maxN)) rows = rows.filter((x) => x.cantidad <= maxN)
    return rows
  }, [items, search, dim, status, qtyMin, qtyMax])

  const groups = useMemo(() => groupByNombre(filteredItems), [filteredItems])

  const kpis = useMemo(() => {
    const totalItems = filteredItems.length
    const totalCantidad = filteredItems.reduce((acc, x) => acc + asNumber(x.cantidad, 0), 0)
    const alertas = filteredItems.filter((x) => x.minStock > 0 && x.cantidad < x.minStock).length
    const sobreMax = filteredItems.filter((x) => x.maxStock > 0 && x.cantidad > x.maxStock).length
    const salud = totalItems ? Math.round(((totalItems - alertas) / totalItems) * 100) : 0
    return { totalItems, totalCantidad, alertas, sobreMax, salud }
  }, [filteredItems])

  const topGroups = useMemo(() => {
    const n = Math.max(Number(topN) || 10, 1)
    return groups.slice(0, n).map((g) => ({ label: g.nombre, value: Math.round(g.totalCantidad) }))
  }, [groups, topN])

  const alertRows = useMemo(() => {
    const rows = filteredItems
      .filter((x) => x.minStock > 0 && x.cantidad < x.minStock)
      .map((x) => ({
        ...x,
        deficit: x.minStock - x.cantidad,
      }))
    rows.sort((a, b) => b.deficit - a.deficit)
    return rows.slice(0, 12)
  }, [filteredItems])

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

  const selectedGroup = useMemo(() => {
    if (!selectedGroupKey) return null
    return groups.find((g) => g.key === selectedGroupKey) || null
  }, [groups, selectedGroupKey])

  const selectedDayRow = useMemo(() => {
    if (!selectedDay) return null
    return dailyRows.find((r) => r.label === selectedDay) || null
  }, [dailyRows, selectedDay])

  const overMaxRows = useMemo(() => {
    const rows = filteredItems
      .filter((x) => x.maxStock > 0 && x.cantidad > x.maxStock)
      .map((x) => ({ ...x, excess: x.cantidad - x.maxStock }))
    rows.sort((a, b) => b.excess - a.excess)
    return rows.slice(0, 12)
  }, [filteredItems])

  const toggleKind = (k) => {
    setKinds((prev) => {
      const base = Array.isArray(prev) ? prev : []
      const next = base.includes(k) ? base.filter((x) => x !== k) : [...base, k]
      return next.length ? next : base
    })
  }

  const movementSeriesSpec = useMemo(
    () => [
      { key: 'pt_salida_proy', label: 'PT salida', color: 'rgba(37, 99, 235, 0.75)' },
      { key: 'pt_devol_proy', label: 'PT devolución', color: 'rgba(16, 185, 129, 0.75)' },
      { key: 'fab_entrada', label: 'Fab entrada', color: 'rgba(245, 158, 11, 0.75)' },
      { key: 'fab_salida', label: 'Fab salida', color: 'rgba(239, 68, 68, 0.65)' },
    ],
    [],
  )

  return (
    <section className="page">
      <header className="page-header">
        <h2>Dashboard</h2>
      </header>

      <div className="page-body">
        {error ? <div className="form-error">{error}</div> : null}

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>
              Control general
            </div>
            <button type="button" className="btn" onClick={() => setIsFiltersOpen((v) => !v)}>
              {isFiltersOpen ? 'Ocultar filtros' : 'Mostrar filtros'}
            </button>
          </div>

          {isFiltersOpen ? (
            <div className="form-grid" style={{ marginTop: 12 }}>
              <label className="field" style={{ gridColumn: '1 / -1' }}>
                <span>Área (multi)</span>
                <div className="segmented" style={{ width: '100%' }}>
                  <button
                    type="button"
                    className={kinds.includes('materias-primas') ? 'seg active' : 'seg'}
                    onClick={() => toggleKind('materias-primas')}
                    disabled={isLoading}
                  >
                    Materia Prima
                  </button>
                  <button
                    type="button"
                    className={kinds.includes('subensambles') ? 'seg active' : 'seg'}
                    onClick={() => toggleKind('subensambles')}
                    disabled={isLoading}
                  >
                    Subensambles
                  </button>
                  <button
                    type="button"
                    className={kinds.includes('productos-terminados') ? 'seg active' : 'seg'}
                    onClick={() => toggleKind('productos-terminados')}
                    disabled={isLoading}
                  >
                    Productos Terminados
                  </button>
                </div>
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

              <label className="field">
                <span>Top N grupos</span>
                <select value={String(topN)} onChange={(e) => setTopN(Number(e.target.value))} disabled={isLoading}>
                  <option value="5">5</option>
                  <option value="10">10</option>
                  <option value="12">12</option>
                  <option value="20">20</option>
                </select>
              </label>

              <label className="field" style={{ gridColumn: '1 / -1' }}>
                <span>Buscar (nombre común / código)</span>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Ej: CODO, COUPLING, 100234..."
                  disabled={isLoading}
                />
              </label>

              <label className="field">
                <span>Filtrar por medida</span>
                <input
                  value={dim}
                  onChange={(e) => setDim(e.target.value)}
                  placeholder='Ej: "4", "PULG", "1/2"...'
                  disabled={isLoading}
                />
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
            Agrupación: se usa el nombre común (Nombre) y se separa por Medida (dimensión). Subcategoría no se usa para agrupar.
          </div>
        </div>

        <div className="stats">
          <StatCard label="Artículos" value={isLoading ? '-' : formatNumber(kpis.totalItems)} />
          <StatCard label="Existencia total" value={isLoading ? '-' : formatNumber(Math.round(kpis.totalCantidad))} />
          <StatCard label="Bajo mínimo" value={isLoading ? '-' : formatNumber(kpis.alertas)} />
          <StatCard label="Sobre máximo" value={isLoading ? '-' : formatNumber(kpis.sobreMax)} />
          <StatCard label="Salud" value={isLoading ? '-' : `${formatNumber(kpis.salud)}%`} />
        </div>

        <div className="grid-2">
          <Bars
            title="Top grupos por existencia (clic para filtrar)"
            series={topGroups.length ? topGroups : []}
            onSelectLabel={(label) => {
              setSearch(label)
              setSelectedGroupKey(normalizeGroupKey(label))
            }}
          />
          <StackedBars
            title="Actividad (stacked, clic para filtrar por día)"
            rows={dailyRows}
            series={movementSeriesSpec}
            enabledMap={movementEnabled}
            onToggleSeries={(key) => setMovementEnabled((m) => ({ ...m, [key]: !m[key] }))}
            onSelectLabel={(label) => setSelectedDay(label)}
            valueFormatter={(n) => formatNumber(Math.round(n))}
          />
        </div>

        {selectedDayRow ? (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
              <div className="card-title" style={{ marginBottom: 0 }}>
                Detalle del día: {selectedDayRow.label}
              </div>
              <button type="button" className="btn" onClick={() => setSelectedDay('')}>
                Quitar
              </button>
            </div>
            <div className="kv" style={{ marginTop: 10 }}>
              <div className="kv-row">
                <div className="kv-k">PT salida</div>
                <div className="kv-v">{formatNumber(Math.round(selectedDayRow.pt_salida_proy))}</div>
              </div>
              <div className="kv-row">
                <div className="kv-k">PT devolución</div>
                <div className="kv-v">{formatNumber(Math.round(selectedDayRow.pt_devol_proy))}</div>
              </div>
              <div className="kv-row">
                <div className="kv-k">Fab entrada</div>
                <div className="kv-v">{formatNumber(Math.round(selectedDayRow.fab_entrada))}</div>
              </div>
              <div className="kv-row">
                <div className="kv-k">Fab salida</div>
                <div className="kv-v">{formatNumber(Math.round(selectedDayRow.fab_salida))}</div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="card">
          <div className="card-title">Alertas críticas (bajo mínimo)</div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Área</th>
                  <th>Código</th>
                  <th>Nombre</th>
                  <th>Medida</th>
                  <th className="num">Stock</th>
                  <th className="num">Mín</th>
                  <th className="num">Falta</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="empty">
                      Cargando...
                    </td>
                  </tr>
                ) : alertRows.length ? (
                  alertRows.map((r) => (
                    <tr key={`${r.kind}:${r.id}`}>
                      <td>{kindLabel(r.kind)}</td>
                      <td className="mono">{r.codigo}</td>
                      <td>{r.nombre}</td>
                      <td>{r.medida || 'NO POSEE'}</td>
                      <td className="num">{formatNumber(r.cantidad)}</td>
                      <td className="num">{formatNumber(r.minStock)}</td>
                      <td className="num">{formatNumber(r.deficit)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="empty">
                      Sin alertas con los filtros actuales.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Sobre stock (sobre máximo)</div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Área</th>
                  <th>Código</th>
                  <th>Nombre</th>
                  <th>Medida</th>
                  <th className="num">Stock</th>
                  <th className="num">Máx</th>
                  <th className="num">Exceso</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="empty">
                      Cargando...
                    </td>
                  </tr>
                ) : overMaxRows.length ? (
                  overMaxRows.map((r) => (
                    <tr key={`${r.kind}:${r.id}`}>
                      <td>{kindLabel(r.kind)}</td>
                      <td className="mono">{r.codigo}</td>
                      <td>{r.nombre}</td>
                      <td>{r.medida || 'NO POSEE'}</td>
                      <td className="num">{formatNumber(r.cantidad)}</td>
                      <td className="num">{formatNumber(r.maxStock)}</td>
                      <td className="num">{formatNumber(r.excess)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="empty">
                      Sin sobre stock con los filtros actuales.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Grupos (nombre común → variantes por medida)</div>
          {isLoading ? (
            <div className="empty">Cargando...</div>
          ) : groups.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {groups.slice(0, 20).map((g) => (
                <div key={g.key} className="nav-group">
                  <div
                    className="nav-group-title"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}
                  >
                    <div>
                      <span className="mono">{g.nombre}</span> · {formatNumber(Math.round(g.totalCantidad))}{' '}
                      {g.unidad || ''}
                    </div>
                    <div className="actions inline">
                      <button
                        type="button"
                        className="btn"
                        onClick={() => {
                          setSearch(g.nombre)
                          setSelectedGroupKey(g.key)
                        }}
                      >
                        Filtrar
                      </button>
                      <button type="button" className="btn" onClick={() => setSelectedGroupKey(g.key)}>
                        Ver
                      </button>
                    </div>
                  </div>
                  <div className="nav-group-items">
                    {g.variants.slice(0, 6).map((v) => (
                      <div key={v.medida} className="muted" style={{ fontSize: 13 }}>
                        {v.medida}: {formatNumber(Math.round(v.cantidad))} {g.unidad || ''}
                      </div>
                    ))}
                    {g.variants.length > 6 ? (
                      <div className="muted" style={{ fontSize: 12 }}>
                        (+{g.variants.length - 6} variantes)
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
              {groups.length > 20 ? (
                <div className="muted" style={{ fontSize: 12 }}>
                  Mostrando 20 de {groups.length}. Usa el buscador para refinar.
                </div>
              ) : null}
            </div>
          ) : (
            <div className="empty">Sin resultados.</div>
          )}
        </div>
        <GroupModal group={selectedGroup} onClose={() => setSelectedGroupKey('')} />
      </div>
    </section>
  )
}
