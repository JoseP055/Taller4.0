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

function applyStatusFilter(rows, status) {
  let out = rows
  if (status === 'below_min') out = out.filter((x) => x.minStock > 0 && x.cantidad < x.minStock)
  if (status === 'over_max') out = out.filter((x) => x.maxStock > 0 && x.cantidad > x.maxStock)
  if (status === 'zero') out = out.filter((x) => asNumber(x.cantidad, 0) === 0)
  if (status === 'healthy')
    out = out.filter(
      (x) =>
        !(x.minStock > 0 && x.cantidad < x.minStock) &&
        !(x.maxStock > 0 && x.cantidad > x.maxStock) &&
        asNumber(x.cantidad, 0) !== 0,
    )
  return out
}

function applyDimFilter(rows, dim) {
  const d = String(dim || '').trim().toUpperCase()
  if (!d) return rows
  return rows.filter((x) => String(x.medida || '').toUpperCase().includes(d))
}

function applyKindsFilter(rows, kinds) {
  const ks = Array.isArray(kinds) ? kinds : []
  if (!ks.length) return rows
  return rows.filter((x) => ks.includes(x.kind))
}

function KpiCard({ label, value, badge, note, onClick }) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      className="kpi-card"
      type={onClick ? 'button' : undefined}
      onClick={onClick || undefined}
      style={{
        textAlign: 'left',
        cursor: onClick ? 'pointer' : 'default',
        background: 'var(--panel)',
      }}
    >
      <div className="kpi-top">
        <div className="kpi-label">{label}</div>
        {badge ? <div className="kpi-badge">{badge}</div> : null}
      </div>
      <div className="kpi-value">{value}</div>
      {note ? <div className="kpi-note">{note}</div> : null}
    </Comp>
  )
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

function toRadians(deg) {
  return (deg * Math.PI) / 180
}

function polar(cx, cy, r, angleDeg) {
  const a = toRadians(angleDeg - 90)
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
}

function pieSlicePath(cx, cy, r, startDeg, endDeg) {
  const start = polar(cx, cy, r, startDeg)
  const end = polar(cx, cy, r, endDeg)
  const largeArc = endDeg - startDeg > 180 ? 1 : 0
  return [
    `M ${cx} ${cy}`,
    `L ${start.x.toFixed(2)} ${start.y.toFixed(2)}`,
    `A ${r} ${r} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`,
    'Z',
  ].join(' ')
}

function donutSlicePath(cx, cy, rOuter, rInner, startDeg, endDeg) {
  const start = polar(cx, cy, rOuter, startDeg)
  const end = polar(cx, cy, rOuter, endDeg)
  const startInner = polar(cx, cy, rInner, endDeg)
  const endInner = polar(cx, cy, rInner, startDeg)
  const largeArc = endDeg - startDeg > 180 ? 1 : 0
  return [
    `M ${start.x.toFixed(2)} ${start.y.toFixed(2)}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`,
    `L ${startInner.x.toFixed(2)} ${startInner.y.toFixed(2)}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${endInner.x.toFixed(2)} ${endInner.y.toFixed(2)}`,
    'Z',
  ].join(' ')
}

function PieDonutChart({ title, series, variant = 'donut', onSelectLabel, centerLabel }) {
  const palette = [
    'rgba(30, 195, 167, 0.92)',
    'rgba(126, 251, 110, 0.86)',
    'rgba(245, 158, 11, 0.86)',
    'rgba(239, 68, 68, 0.82)',
    'rgba(96, 165, 250, 0.85)',
    'rgba(167, 139, 250, 0.85)',
    'rgba(244, 114, 182, 0.85)',
    'rgba(148, 163, 184, 0.85)',
  ]

  const clean = useMemo(() => {
    const rows = Array.isArray(series) ? series : []
    return rows
      .map((s, idx) => ({
        label: String(s.label),
        value: Math.max(asNumber(s.value, 0), 0),
        color: s.color || palette[idx % palette.length],
      }))
      .filter((s) => s.value > 0)
  }, [series])

  const total = useMemo(() => clean.reduce((acc, s) => acc + s.value, 0) || 1, [clean])

  const size = 260
  const cx = size / 2
  const cy = size / 2
  const rOuter = 92
  const isDonut = variant === 'donut'
  const rInner = isDonut ? 56 : 0

  const slices = useMemo(() => {
    let angle = 0
    return clean.map((s) => {
      const span = (s.value / total) * 360
      const start = angle
      const end = angle + span
      angle = end
      const d = isDonut ? donutSlicePath(cx, cy, rOuter, rInner, start, end) : pieSlicePath(cx, cy, rOuter, start, end)
      const pct = Math.round((s.value / total) * 100)
      return { ...s, d, pct }
    })
  }, [clean, total, cx, cy, rOuter, rInner, isDonut])

  return (
    <div className="card">
      <div className="card-title">{title}</div>
      <div className="chart" style={{ display: 'grid', placeItems: 'center', marginTop: 8 }}>
        <svg className="chart-svg" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={title}>
          <circle cx={cx} cy={cy} r={rOuter + 18} fill="var(--panel-2)" opacity="0.65" />
          {slices.length ? (
            slices.map((s) => (
              <path
                key={s.label}
                d={s.d}
                fill={s.color}
                stroke="rgba(15, 23, 42, 0.28)"
                strokeWidth="1"
                onClick={onSelectLabel ? () => onSelectLabel(s.label) : undefined}
                style={{ cursor: onSelectLabel ? 'pointer' : 'default' }}
              >
                <title>
                  {s.label}: {formatNumber(s.value)} ({s.pct}%)
                </title>
              </path>
            ))
          ) : (
            <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fill="var(--muted)" fontSize="13">
              Sin datos
            </text>
          )}
          {isDonut ? <circle cx={cx} cy={cy} r={rInner - 8} fill="var(--panel)" opacity="0.9" /> : null}
          {isDonut && centerLabel ? (
            <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fill="var(--text)" fontSize="14" fontWeight="800">
              {centerLabel}
            </text>
          ) : null}
        </svg>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        {slices.map((s) => (
          <button
            key={`${s.label}-legend`}
            type="button"
            className="legend-btn"
            onClick={onSelectLabel ? () => onSelectLabel(s.label) : undefined}
            style={{ cursor: onSelectLabel ? 'pointer' : 'default' }}
            title={`${s.label}: ${formatNumber(s.value)}`}
          >
            <span className="legend-swatch" style={{ background: s.color }} aria-hidden="true" />
            {s.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function ColumnChart({ title, series, onSelectLabel, valueFormatter }) {
  const width = 360
  const height = 208
  const padX = 16
  const padTop = 24
  const padBottom = 40
  const innerW = width - padX * 2
  const innerH = height - padTop - padBottom
  const rows = Array.isArray(series) ? series : []
  const max = useMemo(() => rows.reduce((m, r) => Math.max(m, asNumber(r.value, 0)), 0) || 1, [rows])

  const barGap = 10
  const barW = rows.length ? Math.max((innerW - barGap * (rows.length - 1)) / rows.length, 10) : 10

  return (
    <div className="card">
      <div className="card-title">{title}</div>
      <div className="chart" style={{ marginTop: 10 }}>
        <svg className="chart-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
          <rect x="0" y="0" width={width} height={height} rx="14" fill="var(--panel-2)" opacity="0.65" />
          <line x1={padX} y1={padTop + innerH} x2={padX + innerW} y2={padTop + innerH} stroke="var(--border)" />
          {rows.map((r, idx) => {
            const v = asNumber(r.value, 0)
            const h = v > 0 ? Math.max((v / max) * innerH, 2) : 0
            const x = padX + idx * (barW + barGap)
            const y = padTop + (innerH - h)
            const fill = r.color || 'rgba(30, 195, 167, 0.85)'
            const label = String(r.label)
            const valueY = Math.max(y - 6, 14)
            return (
              <g key={label}>
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={h}
                  rx="8"
                  fill={fill}
                  onClick={onSelectLabel ? () => onSelectLabel(label) : undefined}
                  style={{ cursor: onSelectLabel ? 'pointer' : 'default' }}
                >
                  <title>
                    {label}: {valueFormatter ? valueFormatter(v) : formatNumber(v)}
                  </title>
                </rect>
                <text x={x + barW / 2} y={valueY} textAnchor="middle" fontSize="11" fill="var(--muted)">
                  {valueFormatter ? valueFormatter(v) : formatNumber(v)}
                </text>
                <text x={x + barW / 2} y={padTop + innerH + 18} textAnchor="middle" fontSize="10" fill="var(--muted)">
                  {label.length > 8 ? `${label.slice(0, 8)}…` : label}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

function Gauge({ title, value, max = 100, onClick, subtitle }) {
  const width = 320
  const height = 170
  const cx = width / 2
  const cy = 132
  const r = 86
  const pct = clamp((asNumber(value, 0) / Math.max(asNumber(max, 1), 1)) * 100, 0, 100)
  const startDeg = 270
  const endDeg = 450
  const ang = startDeg + (pct / 100) * (endDeg - startDeg)
  const bg = donutSlicePath(cx, cy, r, r - 16, startDeg, endDeg)
  const fg = donutSlicePath(cx, cy, r, r - 16, startDeg, ang)
  const needle = polar(cx, cy, r - 10, ang)

  return (
    <div className="card">
      <div className="card-title">{title}</div>
      <div className="chart" style={{ marginTop: 10 }}>
        <svg
          className="chart-svg"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={title}
          onClick={onClick || undefined}
          style={{ cursor: onClick ? 'pointer' : 'default' }}
        >
          <rect x="0" y="0" width={width} height={height} rx="14" fill="var(--panel-2)" opacity="0.65" />
          <path d={bg} fill="rgba(148, 163, 184, 0.22)" />
          <path d={fg} fill="rgba(30, 195, 167, 0.88)" />
          <line x1={cx} y1={cy} x2={needle.x} y2={needle.y} stroke="rgba(241,245,249,0.9)" strokeWidth="3" strokeLinecap="round" />
          <circle cx={cx} cy={cy} r="6" fill="rgba(241,245,249,0.9)" />
          <text x={cx} y={cy - 22} textAnchor="middle" fontSize="22" fontWeight="900" fill="var(--text)">
            {formatNumber(Math.round(pct))}%
          </text>
          {subtitle ? (
            <text x={cx} y={cy - 4} textAnchor="middle" fontSize="12" fill="var(--muted)">
              {subtitle}
            </text>
          ) : null}
        </svg>
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

function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max)
}

function LineChart({ title, rows, series, enabledMap, onToggleSeries, valueFormatter }) {
  const pointsBySeries = useMemo(() => {
    const out = new Map()
    const enabledSeries = series.filter((s) => enabledMap[s.key])
    const ys = []
    for (const s of enabledSeries) {
      const pts = rows.map((r, idx) => ({
        x: idx,
        y: asNumber(r[s.key], 0),
        label: r.label,
      }))
      for (const p of pts) ys.push(p.y)
      out.set(s.key, pts)
    }
    const minY = ys.length ? Math.min(...ys) : 0
    const maxY = ys.length ? Math.max(...ys) : 1
    return { out, minY, maxY }
  }, [rows, series, enabledMap])

  const width = 320
  const height = 160
  const padX = 10
  const padY = 14
  const innerW = width - padX * 2
  const innerH = height - padY * 2
  const maxX = Math.max(rows.length - 1, 1)
  const rangeY = Math.max(pointsBySeries.maxY - pointsBySeries.minY, 1)

  const paths = useMemo(() => {
    const enabledSeries = series.filter((s) => enabledMap[s.key])
    return enabledSeries.map((s) => {
      const pts = pointsBySeries.out.get(s.key) || []
      const d = pts
        .map((p, i) => {
          const x = padX + (p.x / maxX) * innerW
          const y = padY + (1 - (p.y - pointsBySeries.minY) / rangeY) * innerH
          return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
        })
        .join(' ')
      return { key: s.key, label: s.label, color: s.color, d }
    })
  }, [series, enabledMap, pointsBySeries, maxX, innerW, innerH, padX, padY, rangeY])

  const lastLabels = useMemo(() => {
    const n = rows.length
    if (!n) return { left: '', right: '' }
    return { left: rows[0].label, right: rows[n - 1].label }
  }, [rows])

  return (
    <div className="card">
      <div className="card-title">{title}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {series.map((s) => (
          <button
            key={s.key}
            type="button"
            className="legend-btn"
            onClick={() => onToggleSeries?.(s.key)}
            style={{ opacity: enabledMap[s.key] ? 1 : 0.45 }}
          >
            <span className="legend-swatch" style={{ background: s.color }} aria-hidden="true" />
            {s.label}
          </button>
        ))}
      </div>
      <div className="chart" style={{ marginTop: 10 }}>
        <svg className="chart-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
          <rect x="0" y="0" width={width} height={height} rx="14" fill="var(--panel-2)" opacity="0.65" />
          <line
            x1={padX}
            y1={padY + innerH}
            x2={padX + innerW}
            y2={padY + innerH}
            stroke="var(--border)"
          />
          {paths.map((p) => (
            <path key={p.key} d={p.d} fill="none" stroke={p.color} strokeWidth="2.5" strokeLinecap="round" />
          ))}
        </svg>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
          <div className="muted" style={{ fontSize: 12 }}>
            {lastLabels.left}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            {lastLabels.right}
          </div>
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          Rango: {valueFormatter(pointsBySeries.minY)} – {valueFormatter(pointsBySeries.maxY)}
        </div>
      </div>
    </div>
  )
}

function RadarChart({ title, metrics }) {
  const size = 260
  const cx = size / 2
  const cy = size / 2
  const r = 92
  const levels = 4

  const points = useMemo(() => {
    const n = metrics.length || 1
    return metrics.map((m, i) => {
      const angle = -Math.PI / 2 + (i / n) * Math.PI * 2
      const v = clamp(asNumber(m.value, 0), 0, 100) / 100
      return {
        ...m,
        angle,
        x: cx + Math.cos(angle) * r * v,
        y: cy + Math.sin(angle) * r * v,
        lx: cx + Math.cos(angle) * (r + 26),
        ly: cy + Math.sin(angle) * (r + 26),
      }
    })
  }, [metrics, cx, cy, r])

  const polygon = useMemo(() => points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '), [points])

  return (
    <div className="card">
      <div className="card-title">{title}</div>
      <div className="chart" style={{ display: 'grid', placeItems: 'center', marginTop: 8 }}>
        <svg className="chart-svg" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={title}>
          <circle cx={cx} cy={cy} r={r + 18} fill="var(--panel-2)" opacity="0.65" />
          {Array.from({ length: levels }, (_, idx) => {
            const rr = ((idx + 1) / levels) * r
            const poly = points
              .map((p, i) => {
                const angle = -Math.PI / 2 + (i / points.length) * Math.PI * 2
                const x = cx + Math.cos(angle) * rr
                const y = cy + Math.sin(angle) * rr
                return `${x.toFixed(1)},${y.toFixed(1)}`
              })
              .join(' ')
            return <polygon key={idx} points={poly} fill="none" stroke="var(--border)" />
          })}
          {points.map((p, i) => {
            const angle = -Math.PI / 2 + (i / points.length) * Math.PI * 2
            const x = cx + Math.cos(angle) * r
            const y = cy + Math.sin(angle) * r
            return <line key={p.key} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--border)" />
          })}
          <polygon points={polygon} fill="rgba(30, 195, 167, 0.18)" stroke="rgba(30, 195, 167, 0.9)" strokeWidth="2" />
          {points.map((p) => (
            <circle key={`${p.key}-pt`} cx={p.x} cy={p.y} r="3.5" fill="rgba(126, 251, 110, 0.9)" />
          ))}
          {points.map((p) => (
            <text
              key={`${p.key}-lbl`}
              x={p.lx}
              y={p.ly}
              fontSize="11"
              fill="var(--muted)"
              textAnchor={p.lx < cx ? 'end' : p.lx > cx ? 'start' : 'middle'}
              dominantBaseline="middle"
            >
              {p.label}
            </text>
          ))}
        </svg>
        <div className="muted" style={{ fontSize: 12, marginTop: 10, textAlign: 'center' }}>
          Escala 0–100 (más alto = mejor).
        </div>
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

function MovementsLogModal({ title, day, rows, isLoading, error, onClose }) {
  const list = Array.isArray(rows) ? rows : []
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal" style={{ maxWidth: 1200 }}>
        <div className="modal-head">
          <div className="modal-title">{title}</div>
          <button type="button" className="btn" onClick={onClose}>
            Cerrar
          </button>
        </div>
        <div className="modal-body">
          {day ? (
            <div className="muted" style={{ fontSize: 12 }}>
              Día: {day}
            </div>
          ) : null}
          {error ? <div className="form-error">{error}</div> : null}
          <div className="table-wrap">
            <table className="table" style={{ minWidth: 1120 }}>
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Tipo</th>
                  <th>Artículo</th>
                  <th className="num">Cantidad</th>
                  <th>Origen</th>
                  <th>Destino</th>
                  <th>Ref.</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="empty">
                      Cargando...
                    </td>
                  </tr>
                ) : list.length ? (
                  list.map((r) => (
                    <tr key={r.id}>
                      <td className="mono">{String(r.fecha_hora || '').slice(11, 16) || '-'}</td>
                      <td className="mono">{r.tipo}</td>
                      <td style={{ minWidth: 320 }}>
                        <div className="mono">
                          {r?.articulo?.codigo} — {r?.articulo?.nombre}
                        </div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {r?.articulo?.medida ? `Medida: ${r.articulo.medida}` : 'Medida: NO POSEE'}
                        </div>
                      </td>
                      <td className="num">{formatNumber(Math.round(asNumber(r.cantidad, 0)))}</td>
                      <td className="mono">{r.origen || '-'}</td>
                      <td className="mono">{r.destino || '-'}</td>
                      <td
                        className="mono"
                        style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      >
                        {r.referencia || ''}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="empty">
                      Sin movimientos en ese día.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Analytics() {
  const [kindsValue, setKindsValue] = useLocalStorageState('an:kind', ['productos-terminados'])
  const [dim, setDim] = useLocalStorageState('an:dim', '')
  const [status, setStatus] = useLocalStorageState('an:status', 'all')
  const [days, setDays] = useLocalStorageState('an:days', 30)
  const [movementEnabled, setMovementEnabled] = useLocalStorageState('an:movEnabled', {
    pt_salida_proy: true,
    pt_devol_proy: true,
    fab_entrada: true,
    fab_salida: true,
  })
  const [selectedGroupKey, setSelectedGroupKey] = useState('')
  const [viewTab, setViewTab] = useLocalStorageState('an:viewTab', 'resumen')

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [items, setItems] = useState([])
  const [daily, setDaily] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [selectedDay, setSelectedDay] = useState('')
  const [isMovementsOpen, setIsMovementsOpen] = useState(false)
  const [movementLogRows, setMovementLogRows] = useState([])
  const [movementLogError, setMovementLogError] = useState('')
  const [isLoadingMovementLog, setIsLoadingMovementLog] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    setIsLoading(true)
    setError('')
    setDaily(null)

    const qs = new URLSearchParams({ estatus: 'Todas', limit: '1000', offset: '0', search: '' })
    const nextKinds = ['materias-primas', 'subensambles', 'productos-terminados']

    Promise.all([
      Promise.all(
        nextKinds.map((k) =>
          fetchJson(`/inventario/${k}/items?${qs.toString()}`, { signal: controller.signal }).then((d) =>
            normalizeItems(k, d),
          ),
        ),
      ).then((lists) => lists.flat()),
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
  }, [days, refreshKey])

  useEffect(() => {
    const controller = new AbortController()
    setMovementLogRows([])
    setMovementLogError('')
    if (!selectedDay) return () => controller.abort()

    setIsLoadingMovementLog(true)
    fetchJson(
      `/analytics/movimientos/log?days=${encodeURIComponent(String(days))}&day=${encodeURIComponent(
        String(selectedDay),
      )}&limit=250`,
      { signal: controller.signal },
    )
      .then((data) => {
        const rows = Array.isArray(data?.rows) ? data.rows : []
        setMovementLogRows(rows)
        setMovementLogError('')
      })
      .catch((e) => {
        if (controller.signal.aborted) return
        setMovementLogRows([])
        setMovementLogError(e?.message || 'No se pudo cargar movimientos del día')
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingMovementLog(false)
      })

    return () => controller.abort()
  }, [selectedDay, days])

  const kinds = useMemo(() => {
    if (Array.isArray(kindsValue)) return kindsValue
    const v = String(kindsValue || '').trim()
    return [v || 'productos-terminados']
  }, [kindsValue])

  const itemsForStatusTotals = useMemo(() => {
    return applyDimFilter(applyKindsFilter(items, kinds), dim)
  }, [items, kinds, dim])

  const itemsForKindTotals = useMemo(() => {
    return applyStatusFilter(applyDimFilter(items, dim), status)
  }, [items, dim, status])

  const itemsForMeasureTotals = useMemo(() => {
    return applyStatusFilter(applyKindsFilter(items, kinds), status)
  }, [items, kinds, status])

  const filteredItems = useMemo(() => {
    return applyStatusFilter(itemsForStatusTotals, status)
  }, [itemsForStatusTotals, status])

  const groups = useMemo(() => {
    const g = buildGroups(filteredItems)
    g.sort((a, b) => b.totalCantidad - a.totalCantidad)
    return g
  }, [filteredItems])

  const groupsNoStatus = useMemo(() => {
    const g = buildGroups(itemsForStatusTotals)
    g.sort((a, b) => b.totalCantidad - a.totalCantidad)
    return g
  }, [itemsForStatusTotals])

  const kindTotals = useMemo(() => {
    const base = ['materias-primas', 'subensambles', 'productos-terminados']
    const totals = new Map(
      base.map((k) => [
        k,
        {
          kind: k,
          items: 0,
          qty: 0,
        },
      ]),
    )
    for (const it of itemsForKindTotals) {
      const cur = totals.get(it.kind)
      if (!cur) continue
      cur.items += 1
      cur.qty += asNumber(it.cantidad, 0)
    }
    const seriesQty = Array.from(totals.values()).map((t) => ({ label: kindLabel(t.kind), value: Math.round(t.qty) }))
    const seriesItems = Array.from(totals.values()).map((t) => ({ label: kindLabel(t.kind), value: t.items }))
    return { seriesQty, seriesItems }
  }, [itemsForKindTotals])

  const statusTotals = useMemo(() => {
    const rows = itemsForStatusTotals
    let below = 0
    let over = 0
    let zero = 0
    let healthy = 0
    for (const it of rows) {
      const qty = asNumber(it.cantidad, 0)
      const min = asNumber(it.minStock, 0)
      const maxS = asNumber(it.maxStock, 0)
      const isBelow = min > 0 && qty < min
      const isOver = maxS > 0 && qty > maxS
      const isZero = qty === 0
      if (isBelow) below += 1
      if (isOver) over += 1
      if (isZero) zero += 1
      if (!isBelow && !isOver && !isZero) healthy += 1
    }
    return [
      { key: 'below_min', label: 'Bajo mínimo', value: below },
      { key: 'over_max', label: 'Sobre máximo', value: over },
      { key: 'zero', label: 'Cero stock', value: zero },
      { key: 'healthy', label: 'Saludable', value: healthy },
    ]
  }, [itemsForStatusTotals])

  const topMeasures = useMemo(() => {
    const by = new Map()
    for (const it of itemsForMeasureTotals) {
      const m = String(it.medida || 'NO POSEE').trim() || 'NO POSEE'
      const cur = by.get(m) || { m, qty: 0 }
      cur.qty += asNumber(it.cantidad, 0)
      by.set(m, cur)
    }
    const rows = Array.from(by.values())
    rows.sort((a, b) => b.qty - a.qty)
    return rows.slice(0, 10).map((r) => ({ label: r.m, value: Math.round(r.qty) }))
  }, [itemsForMeasureTotals])

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

  const dailyTotalSeries = useMemo(() => {
    const last = dailyRows.slice(-14)
    return last.map((r) => {
      let total = 0
      for (const [k, enabled] of Object.entries(movementEnabled || {})) {
        if (!enabled) continue
        total += asNumber(r[k], 0)
      }
      return { label: r.label, value: Math.round(total), color: 'rgba(96, 165, 250, 0.85)' }
    })
  }, [dailyRows, movementEnabled])

  const movementSeriesSpec = useMemo(
    () => [
      { key: 'pt_salida_proy', label: 'PT salida', color: 'rgba(30, 195, 167, 0.95)' },
      { key: 'pt_devol_proy', label: 'PT devolución', color: 'rgba(126, 251, 110, 0.9)' },
      { key: 'fab_entrada', label: 'Fab entrada', color: 'rgba(245, 158, 11, 0.85)' },
      { key: 'fab_salida', label: 'Fab salida', color: 'rgba(239, 68, 68, 0.8)' },
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
    const total = groupsNoStatus.reduce((acc, g) => acc + asNumber(g.totalCantidad, 0), 0) || 1
    let cumulative = 0
    return groupsNoStatus.slice(0, 12).map((g) => {
      cumulative += asNumber(g.totalCantidad, 0)
      const pct = Math.round((cumulative / total) * 100)
      return {
        label: g.nombre,
        value: Math.round(asNumber(g.totalCantidad, 0)),
        hint: `Acumulado: ${pct}%`,
      }
    })
  }, [groupsNoStatus])

  const topGroupsSeries = useMemo(() => {
    return groupsNoStatus.slice(0, 10).map((g) => ({
      label: g.nombre,
      value: Math.round(asNumber(g.totalCantidad, 0)),
      color: 'rgba(30, 195, 167, 0.85)',
    }))
  }, [groupsNoStatus])

  const zeroCount = useMemo(() => filteredItems.filter((x) => asNumber(x.cantidad, 0) === 0).length, [filteredItems])

  const radarMetrics = useMemo(() => {
    const total = Math.max(filteredItems.length, 1)
    const belowPct = (invKpis.alertas / total) * 100
    const overPct = (invKpis.sobreMax / total) * 100
    const zeroPct = (zeroCount / total) * 100
    const totalQty = Math.max(invKpis.totalCantidad, 1)
    const reorderPct = (invKpis.reorderSuggested / totalQty) * 100
    return [
      { key: 'min', label: 'Cumple mín', value: clamp(100 - belowPct, 0, 100) },
      { key: 'max', label: 'Cumple máx', value: clamp(100 - overPct, 0, 100) },
      { key: 'disp', label: 'Disponib.', value: clamp(100 - zeroPct, 0, 100) },
      { key: 'reo', label: 'Reorden', value: clamp(100 - reorderPct, 0, 100) },
      { key: 'net', label: 'Net Proy', value: clamp(50 + ((dailyKpis.ptSalida - dailyKpis.ptDevol) / (dailyKpis.ptSalida + dailyKpis.ptDevol + 1)) * 50, 0, 100) },
    ]
  }, [
    dailyKpis.ptDevol,
    dailyKpis.ptSalida,
    filteredItems.length,
    invKpis.alertas,
    invKpis.reorderSuggested,
    invKpis.sobreMax,
    invKpis.totalCantidad,
    zeroCount,
  ])

  const cumpleMin = useMemo(() => radarMetrics.find((m) => m.key === 'min')?.value ?? 0, [radarMetrics])

  const movementLineRows = useMemo(() => {
    return dailyRows.map((r) => ({
      ...r,
      net_pt_proy: asNumber(r.pt_salida_proy, 0) - asNumber(r.pt_devol_proy, 0),
      total: asNumber(r.pt_salida_proy, 0) + asNumber(r.pt_devol_proy, 0) + asNumber(r.fab_entrada, 0) + asNumber(r.fab_salida, 0),
    }))
  }, [dailyRows])

  const movementLineSeries = useMemo(
    () => [
      { key: 'net_pt_proy', label: 'Net PT→Proy', color: 'rgba(30, 195, 167, 0.95)' },
      { key: 'total', label: 'Total actividad', color: 'rgba(126, 251, 110, 0.9)' },
    ],
    [],
  )

  const [lineEnabled, setLineEnabled] = useLocalStorageState('an:lineEnabled', { net_pt_proy: true, total: true })

  const toggleKind = (k) => {
    setKindsValue((prev) => {
      const base = Array.isArray(prev) ? prev : [String(prev || 'productos-terminados')]
      const next = base.includes(k) ? base.filter((x) => x !== k) : [...base, k]
      return next.length ? next : base
    })
  }

  const toggleStatus = (next) => {
    setStatus((prev) => (prev === next ? 'all' : next))
  }

  const toggleDim = (next) => {
    const n = String(next || '').trim()
    setDim((prev) => (String(prev || '').trim().toUpperCase() === n.toUpperCase() ? '' : n))
  }

  const selectedGroup = useMemo(() => {
    if (!selectedGroupKey) return null
    return groups.find((g) => g.key === selectedGroupKey) || null
  }, [groups, selectedGroupKey])

  return (
    <section className="page">
      <header className="page-header">
        <h2>Analytics</h2>
        <div className="actions">
          <button
            type="button"
            className="btn"
            onClick={() => {
              setKindsValue(['materias-primas', 'subensambles', 'productos-terminados'])
              setDim('')
              setStatus('all')
              setSelectedGroupKey('')
              setViewTab('resumen')
              setDays(30)
            }}
            disabled={isLoading}
          >
            Restablecer
          </button>
          <button type="button" className="btn" onClick={() => setRefreshKey((k) => k + 1)} disabled={isLoading}>
            Recargar
          </button>
        </div>
      </header>

      <div className="page-body">
        {error ? <div className="form-error">{error}</div> : null}

        <div className="kpi-grid">
          <KpiCard label="Artículos" value={isLoading ? '-' : formatNumber(invKpis.totalItems)} />
          <KpiCard label="Existencia total" value={isLoading ? '-' : formatNumber(Math.round(invKpis.totalCantidad))} />
          <KpiCard
            label="Bajo mínimo"
            value={isLoading ? '-' : formatNumber(invKpis.alertas)}
            badge="Acción"
            onClick={() => {
              toggleStatus('below_min')
              setViewTab('grupos')
            }}
          />
          <KpiCard
            label="Sobre máximo"
            value={isLoading ? '-' : formatNumber(invKpis.sobreMax)}
            badge="Optimizar"
            onClick={() => {
              toggleStatus('over_max')
              setViewTab('grupos')
            }}
          />
          <KpiCard
            label="Reorden sugerido"
            value={isLoading ? '-' : formatNumber(Math.round(invKpis.reorderSuggested))}
            badge="Plan"
            onClick={() => {
              toggleStatus('below_min')
              setViewTab('grupos')
            }}
          />
          <KpiCard
            label="Net PT→Proyecto"
            value={isLoading ? '-' : formatNumber(Math.round(dailyKpis.ptSalida - dailyKpis.ptDevol))}
            onClick={() => setViewTab('movimientos')}
          />
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>
              Explorador BI
            </div>
            <div className="segmented">
              <button type="button" className={viewTab === 'resumen' ? 'seg active' : 'seg'} onClick={() => setViewTab('resumen')}>
                Resumen
              </button>
              <button type="button" className={viewTab === 'movimientos' ? 'seg active' : 'seg'} onClick={() => setViewTab('movimientos')}>
                Movimientos
              </button>
              <button type="button" className={viewTab === 'grupos' ? 'seg active' : 'seg'} onClick={() => setViewTab('grupos')}>
                Grupos
              </button>
            </div>
          </div>
        </div>

        <div className="dash-layout">
          <div className="dash-main">
            <div className="grid-3">
              <Bars
                title="Totales por área (existencia)"
                series={kindTotals.seriesQty}
                onSelectLabel={(label) => {
                  const target = ['materias-primas', 'subensambles', 'productos-terminados'].find((k) => kindLabel(k) === label)
                  if (target) toggleKind(target)
                }}
              />
              <Bars
                title="Totales por estado (artículos)"
                series={statusTotals.map((s) => ({ label: s.label, value: s.value }))}
                onSelectLabel={(label) => {
                  const s = statusTotals.find((x) => x.label === label)
                  if (s?.key) toggleStatus(s.key)
                }}
              />
              <Bars title="Top medidas (existencia)" series={topMeasures} onSelectLabel={(label) => toggleDim(label)} />
            </div>

            <div className="grid-3">
              <PieDonutChart
                title="Área (pastel por existencia)"
                variant="pie"
                series={kindTotals.seriesQty.map((s) => ({ ...s }))}
                onSelectLabel={(label) => {
                  const target = ['materias-primas', 'subensambles', 'productos-terminados'].find((k) => kindLabel(k) === label)
                  if (target) toggleKind(target)
                }}
              />
              <PieDonutChart
                title="Estado (anillo por artículos)"
                variant="donut"
                centerLabel={
                  status === 'all' ? 'Todos' : status === 'below_min' ? 'Bajo mín' : status === 'over_max' ? 'Sobre máx' : status === 'zero' ? 'Cero' : 'Saludable'
                }
                series={statusTotals.map((s, idx) => ({
                  label: s.label,
                  value: s.value,
                  color:
                    idx === 0
                      ? 'rgba(245, 158, 11, 0.86)'
                      : idx === 1
                        ? 'rgba(239, 68, 68, 0.82)'
                        : idx === 2
                          ? 'rgba(148, 163, 184, 0.85)'
                          : 'rgba(30, 195, 167, 0.92)',
                }))}
                onSelectLabel={(label) => {
                  const s = statusTotals.find((x) => x.label === label)
                  if (s?.key) toggleStatus(s.key)
                }}
              />
              <ColumnChart
                title="Top grupos (columnas)"
                series={topGroupsSeries}
                onSelectLabel={(label) => {
                  setSelectedGroupKey(normalizeGroupKey(label))
                  setViewTab('grupos')
                }}
                valueFormatter={(n) => formatNumber(Math.round(n))}
              />
            </div>

            <div className="grid-2">
              <ColumnChart
                title="Actividad total (últimos 14 días)"
                series={dailyTotalSeries}
                onSelectLabel={(label) => {
                  setSelectedDay(label)
                  setIsMovementsOpen(true)
                }}
                valueFormatter={(n) => formatNumber(Math.round(n))}
              />
              <Gauge
                title="Cumple mínimo (gauge)"
                value={cumpleMin}
                max={100}
                onClick={() => {
                  toggleStatus('below_min')
                  setViewTab('grupos')
                }}
              />
            </div>

            {viewTab === 'movimientos' ? (
              <div className="grid-2">
                <StackedBars
                  title="Movimientos (stacked por día)"
                  rows={dailyRows}
                  series={movementSeriesSpec}
                  enabledMap={movementEnabled}
                  onToggleSeries={(key) => setMovementEnabled((m) => ({ ...m, [key]: !m[key] }))}
                  onSelectLabel={(label) => {
                    setSelectedDay(label)
                    setIsMovementsOpen(true)
                  }}
                  valueFormatter={(n) => formatNumber(Math.round(n))}
                />
                <LineChart
                  title="Tendencia (líneas)"
                  rows={movementLineRows}
                  series={movementLineSeries}
                  enabledMap={lineEnabled}
                  onToggleSeries={(k) => setLineEnabled((m) => ({ ...m, [k]: !m[k] }))}
                  valueFormatter={(n) => formatNumber(Math.round(n))}
                />
              </div>
            ) : viewTab === 'grupos' ? (
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
                    Mostrando 80 de {groups.length}.
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="grid-2">
                <Bars
                  title="Pareto (top grupos por existencia)"
                  series={paretoSeries}
                  onSelectLabel={(label) => setSelectedGroupKey(normalizeGroupKey(label))}
                />
                <StackedBars
                  title="Movimientos (stacked por día)"
                  rows={dailyRows}
                  series={movementSeriesSpec}
                  enabledMap={movementEnabled}
                  onToggleSeries={(key) => setMovementEnabled((m) => ({ ...m, [key]: !m[key] }))}
                  valueFormatter={(n) => formatNumber(Math.round(n))}
                />
              </div>
            )}
          </div>

          <aside className="dash-side">
            <RadarChart title="Radar BI" metrics={radarMetrics} />
          </aside>
        </div>

        <GroupModal group={selectedGroup} onClose={() => setSelectedGroupKey('')} />
        {isMovementsOpen ? (
          <MovementsLogModal
            title="Movimientos del día"
            day={selectedDay}
            rows={movementLogRows}
            isLoading={isLoadingMovementLog}
            error={movementLogError}
            onClose={() => setIsMovementsOpen(false)}
          />
        ) : null}
      </div>
    </section>
  )
}
