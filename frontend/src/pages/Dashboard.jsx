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

function KpiCard({ label, value, badge, note, onClick, tone }) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      className={tone ? `kpi-card ${tone}` : 'kpi-card'}
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
            className={enabledMap[s.key] ? 'legend-btn' : 'legend-btn'}
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

function ItemModal({ item, onClose }) {
  if (!item) return null
  const qty = asNumber(item.cantidad, 0)
  const min = asNumber(item.minStock, 0)
  const max = asNumber(item.maxStock, 0)
  const reorder = asNumber(item.puntoReorden, 0)
  const isBelow = min > 0 && qty < min
  const isOver = max > 0 && qty > max
  const isZero = qty === 0
  const deficit = isBelow ? min - qty : 0
  const excess = isOver ? qty - max : 0

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal" style={{ maxWidth: 980 }}>
        <div className="modal-head">
          <div className="modal-title" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {item.nombre}
          </div>
          <button type="button" className="btn" onClick={onClose}>
            Cerrar
          </button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <span className="badge">{kindLabel(item.kind)}</span>
            <span className="badge">{item.ubicacion || 'N/A'}</span>
            {isBelow ? <span className="badge danger">BAJO MÍN</span> : null}
            {isOver ? <span className="badge danger">SOBRE MÁX</span> : null}
            {isZero ? <span className="badge">CERO</span> : null}
          </div>

          <div className="kv">
            <div className="kv-row">
              <div className="kv-k">Código</div>
              <div className="kv-v mono">{item.codigo}</div>
            </div>
            <div className="kv-row">
              <div className="kv-k">Medida</div>
              <div className="kv-v">{item.medida || 'NO POSEE'}</div>
            </div>
            <div className="kv-row">
              <div className="kv-k">Stock</div>
              <div className="kv-v">
                {formatNumber(qty)} {item.unidad || ''}
              </div>
            </div>
            <div className="kv-row">
              <div className="kv-k">Mínimo</div>
              <div className="kv-v">{formatNumber(min)}</div>
            </div>
            <div className="kv-row">
              <div className="kv-k">Máximo</div>
              <div className="kv-v">{formatNumber(max)}</div>
            </div>
            <div className="kv-row">
              <div className="kv-k">Punto reorden</div>
              <div className="kv-v">{formatNumber(reorder)}</div>
            </div>
            {isBelow ? (
              <div className="kv-row">
                <div className="kv-k">Falta</div>
                <div className="kv-v" style={{ fontWeight: 900, color: 'rgba(245, 158, 11, 0.95)' }}>
                  {formatNumber(deficit)}
                </div>
              </div>
            ) : null}
            {isOver ? (
              <div className="kv-row">
                <div className="kv-k">Exceso</div>
                <div className="kv-v" style={{ fontWeight: 900, color: 'rgba(239, 68, 68, 0.9)' }}>
                  {formatNumber(excess)}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

function AlertsModal({ title, rows, mode, onClose, onPickItem }) {
  const list = Array.isArray(rows) ? rows : []
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal" style={{ maxWidth: 1100 }}>
        <div className="modal-head">
          <div className="modal-title">{title}</div>
          <button type="button" className="btn" onClick={onClose}>
            Cerrar
          </button>
        </div>
        <div className="modal-body">
          <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
            {mode === 'below_min'
              ? 'Artículos con stock por debajo del mínimo.'
              : mode === 'over_max'
                ? 'Artículos con stock por encima del máximo.'
                : 'Artículos con stock en cero.'}
          </div>
          <div className="table-wrap">
            <table className="table" style={{ minWidth: 980 }}>
              <thead>
                <tr>
                  <th>Área</th>
                  <th>Código</th>
                  <th>Nombre</th>
                  <th>Medida</th>
                  <th className="num">Stock</th>
                  <th className="num">{mode === 'below_min' ? 'Mín' : mode === 'over_max' ? 'Máx' : 'Mín'}</th>
                  <th className="num">{mode === 'below_min' ? 'Falta' : mode === 'over_max' ? 'Exceso' : 'Reorden'}</th>
                </tr>
              </thead>
              <tbody>
                {list.length ? (
                  list.slice(0, 80).map((r) => {
                    const qty = asNumber(r.cantidad, 0)
                    const min = asNumber(r.minStock, 0)
                    const max = asNumber(r.maxStock, 0)
                    const delta =
                      mode === 'below_min' ? Math.max(min - qty, 0) : mode === 'over_max' ? Math.max(qty - max, 0) : 0
                    const reorder = asNumber(r.puntoReorden, 0)
                    return (
                      <tr
                        key={`${r.kind}:${r.id}`}
                        onClick={() => onPickItem?.(r)}
                        style={{
                          cursor: 'pointer',
                          background:
                            mode === 'below_min'
                              ? 'color-mix(in srgb, rgba(245, 158, 11, 0.22) 22%, var(--panel))'
                              : mode === 'over_max'
                                ? 'color-mix(in srgb, rgba(239, 68, 68, 0.22) 22%, var(--panel))'
                                : 'color-mix(in srgb, rgba(100, 116, 139, 0.22) 22%, var(--panel))',
                        }}
                        title="Click para ver detalle"
                      >
                        <td>{kindLabel(r.kind)}</td>
                        <td className="mono">{r.codigo}</td>
                        <td style={{ maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.nombre}</td>
                        <td>{r.medida || 'NO POSEE'}</td>
                        <td className="num">{formatNumber(qty)}</td>
                        <td className="num">{formatNumber(mode === 'over_max' ? max : min)}</td>
                        <td
                          className="num"
                          style={{
                            fontWeight: 900,
                            color:
                              mode === 'below_min'
                                ? 'rgba(245, 158, 11, 0.95)'
                                : mode === 'over_max'
                                  ? 'rgba(239, 68, 68, 0.9)'
                                  : 'rgba(100, 116, 139, 0.95)',
                          }}
                        >
                          {mode === 'zero' ? formatNumber(reorder) : formatNumber(delta)}
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="empty">
                      Sin resultados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {list.length > 80 ? (
            <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
              Mostrando 80 de {formatNumber(list.length)}.
            </div>
          ) : null}
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

export default function Dashboard() {
  const defaultKinds = useMemo(() => ['materias-primas', 'subensambles', 'productos-terminados'], [])
  const [kinds, setKinds] = useLocalStorageState('dash:kinds', [
    'materias-primas',
    'subensambles',
    'productos-terminados',
  ])
  const [days, setDays] = useLocalStorageState('dash:days', 30)
  const [status, setStatus] = useLocalStorageState('dash:status', 'all')
  const [dim, setDim] = useLocalStorageState('dash:dim', '')
  const [topN, setTopN] = useLocalStorageState('dash:topN', 12)
  const [selectedGroupKey, setSelectedGroupKey] = useLocalStorageState('dash:groupKey', '')
  const [selectedDay, setSelectedDay] = useState('')
  const [focusTab, setFocusTab] = useLocalStorageState('dash:focusTab', 'alerts')
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
  const [isAlertsOpen, setIsAlertsOpen] = useState(false)
  const [alertsMode, setAlertsMode] = useState('below_min')
  const [selectedItem, setSelectedItem] = useState(null)
  const [isMovementsOpen, setIsMovementsOpen] = useState(false)
  const [movementLogRows, setMovementLogRows] = useState([])
  const [movementLogError, setMovementLogError] = useState('')
  const [isLoadingMovementLog, setIsLoadingMovementLog] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    setIsLoading(true)
    setError('')
    setDaily(null)

    const limit = '1000'
    const baseQs = new URLSearchParams({ estatus: 'Todas', limit, offset: '0', search: '' })
    const nextKinds = ['materias-primas', 'subensambles', 'productos-terminados']

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

  const scopedItems = useMemo(() => {
    let rows = items
    if (selectedGroupKey) rows = rows.filter((x) => normalizeGroupKey(x.nombre) === selectedGroupKey)
    return rows
  }, [items, selectedGroupKey])

  const itemsForStatusTotals = useMemo(() => {
    return applyDimFilter(applyKindsFilter(scopedItems, kinds), dim)
  }, [scopedItems, kinds, dim])

  const itemsForKindTotals = useMemo(() => {
    return applyStatusFilter(applyDimFilter(scopedItems, dim), status)
  }, [scopedItems, dim, status])

  const itemsForMeasureTotals = useMemo(() => {
    return applyStatusFilter(applyKindsFilter(scopedItems, kinds), status)
  }, [scopedItems, kinds, status])

  const filteredItems = useMemo(() => {
    return applyStatusFilter(itemsForStatusTotals, status)
  }, [itemsForStatusTotals, status])

  const groups = useMemo(() => groupByNombre(filteredItems), [filteredItems])
  const groupsNoStatus = useMemo(() => groupByNombre(itemsForStatusTotals), [itemsForStatusTotals])

  const kpis = useMemo(() => {
    const totalItems = filteredItems.length
    const totalCantidad = filteredItems.reduce((acc, x) => acc + asNumber(x.cantidad, 0), 0)
    const alertas = filteredItems.filter((x) => x.minStock > 0 && x.cantidad < x.minStock).length
    const sobreMax = filteredItems.filter((x) => x.maxStock > 0 && x.cantidad > x.maxStock).length
    const salud = totalItems ? Math.round(((totalItems - alertas) / totalItems) * 100) : 0
    return { totalItems, totalCantidad, alertas, sobreMax, salud }
  }, [filteredItems])

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
    const seriesQty = Array.from(totals.values()).map((t) => ({
      label: kindLabel(t.kind),
      value: Math.round(t.qty),
    }))
    const seriesItems = Array.from(totals.values()).map((t) => ({
      label: kindLabel(t.kind),
      value: t.items,
    }))
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

  const topGroups = useMemo(() => {
    const n = Math.max(Number(topN) || 10, 1)
    return groupsNoStatus.slice(0, n).map((g) => ({ label: g.nombre, value: Math.round(g.totalCantidad) }))
  }, [groupsNoStatus, topN])

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

  const belowMinAll = useMemo(() => {
    const rows = itemsForStatusTotals.filter((x) => x.minStock > 0 && x.cantidad < x.minStock)
    rows.sort((a, b) => (b.minStock - b.cantidad) - (a.minStock - a.cantidad))
    return rows
  }, [itemsForStatusTotals])

  const overMaxAll = useMemo(() => {
    const rows = itemsForStatusTotals.filter((x) => x.maxStock > 0 && x.cantidad > x.maxStock)
    rows.sort((a, b) => (b.cantidad - b.maxStock) - (a.cantidad - a.maxStock))
    return rows
  }, [itemsForStatusTotals])

  const zeroAll = useMemo(() => {
    const rows = itemsForStatusTotals.filter((x) => asNumber(x.cantidad, 0) === 0)
    rows.sort((a, b) => asNumber(b.minStock, 0) - asNumber(a.minStock, 0) || asNumber(b.puntoReorden, 0) - asNumber(a.puntoReorden, 0))
    return rows
  }, [itemsForStatusTotals])

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

  const selectedGroup = useMemo(() => {
    if (!selectedGroupKey) return null
    return groupsNoStatus.find((g) => g.key === selectedGroupKey) || null
  }, [groupsNoStatus, selectedGroupKey])

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

  const topAlertGroups = useMemo(() => {
    const g = [...groupsNoStatus]
    g.sort((a, b) => b.alerts - a.alerts || b.totalCantidad - a.totalCantidad)
    return g.filter((x) => x.alerts > 0).slice(0, 8)
  }, [groupsNoStatus])

  const topOverGroups = useMemo(() => {
    const byGroup = new Map()
    for (const it of itemsForStatusTotals) {
      const maxS = asNumber(it.maxStock, 0)
      const qty = asNumber(it.cantidad, 0)
      if (!(maxS > 0 && qty > maxS)) continue
      const key = normalizeGroupKey(it.nombre)
      if (!key) continue
      const cur = byGroup.get(key) || { key, nombre: key, count: 0, exceso: 0 }
      cur.count += 1
      cur.exceso += qty - maxS
      byGroup.set(key, cur)
    }
    const out = Array.from(byGroup.values())
    out.sort((a, b) => b.exceso - a.exceso || b.count - a.count)
    return out.slice(0, 8)
  }, [itemsForStatusTotals])

  const netProyecto = useMemo(() => {
    const rows = dailyRows.slice(-7)
    let salida = 0
    let devol = 0
    for (const r of rows) {
      salida += asNumber(r.pt_salida_proy, 0)
      devol += asNumber(r.pt_devol_proy, 0)
    }
    return { salida, devol, net: salida - devol }
  }, [dailyRows])

  const toggleKind = (k) => {
    setKinds((prev) => {
      const base = Array.isArray(prev) ? prev : []
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

  const movementSeriesSpec = useMemo(
    () => [
      { key: 'pt_salida_proy', label: 'PT salida', color: 'rgba(30, 195, 167, 0.95)' },
      { key: 'pt_devol_proy', label: 'PT devolución', color: 'rgba(126, 251, 110, 0.9)' },
      { key: 'fab_entrada', label: 'Fab entrada', color: 'rgba(245, 158, 11, 0.85)' },
      { key: 'fab_salida', label: 'Fab salida', color: 'rgba(239, 68, 68, 0.8)' },
    ],
    [],
  )

  const movementSeriesSpecBi = useMemo(
    () => [
      { key: 'pt_salida_proy', label: 'PT salida', color: 'rgba(30, 195, 167, 0.95)' },
      { key: 'pt_devol_proy', label: 'PT devolución', color: 'rgba(126, 251, 110, 0.9)' },
      { key: 'fab_entrada', label: 'Fab entrada', color: 'rgba(245, 158, 11, 0.85)' },
      { key: 'fab_salida', label: 'Fab salida', color: 'rgba(239, 68, 68, 0.8)' },
    ],
    [],
  )

  const zeroCount = useMemo(() => filteredItems.filter((x) => asNumber(x.cantidad, 0) === 0).length, [filteredItems])

  const reorderSuggested = useMemo(() => {
    let s = 0
    for (const x of filteredItems) {
      const qty = asNumber(x.cantidad, 0)
      const min = asNumber(x.minStock, 0)
      if (min > 0 && qty < min) s += min - qty
    }
    return s
  }, [filteredItems])

  const radarMetrics = useMemo(() => {
    const total = Math.max(filteredItems.length, 1)
    const belowPct = (kpis.alertas / total) * 100
    const overPct = (kpis.sobreMax / total) * 100
    const zeroPct = (zeroCount / total) * 100
    const totalQty = Math.max(kpis.totalCantidad, 1)
    const reorderPct = (reorderSuggested / totalQty) * 100
    return [
      { key: 'salud', label: 'Salud', value: clamp(kpis.salud, 0, 100) },
      { key: 'min', label: 'Cumple mín', value: clamp(100 - belowPct, 0, 100) },
      { key: 'max', label: 'Cumple máx', value: clamp(100 - overPct, 0, 100) },
      { key: 'disp', label: 'Disponib.', value: clamp(100 - zeroPct, 0, 100) },
      { key: 'reo', label: 'Reorden', value: clamp(100 - reorderPct, 0, 100) },
    ]
  }, [filteredItems.length, kpis.alertas, kpis.sobreMax, kpis.salud, kpis.totalCantidad, reorderSuggested, zeroCount])

  const activeFilterChips = useMemo(() => {
    const chips = []

    const def = defaultKinds
    const curKinds = Array.isArray(kinds) ? kinds : []
    const allKindsOn = def.every((k) => curKinds.includes(k)) && curKinds.every((k) => def.includes(k))
    if (!allKindsOn) {
      const labels = curKinds.map(kindLabel)
      const short =
        labels.length <= 2 ? labels.join(' + ') : `${labels.slice(0, 2).join(' + ')} +${labels.length - 2}`
      chips.push({
        key: 'kinds',
        label: `Áreas: ${short || '—'}`,
        onClear: () => setKinds(def),
      })
    }

    if (status !== 'all') {
      const statusLabel =
        status === 'below_min'
          ? 'Bajo mín'
          : status === 'over_max'
            ? 'Sobre máx'
            : status === 'zero'
              ? 'Cero'
              : status === 'healthy'
                ? 'Saludable'
                : status
      chips.push({ key: 'status', label: `Estado: ${statusLabel}`, onClear: () => setStatus('all') })
    }

    const d = String(dim || '').trim()
    if (d) chips.push({ key: 'dim', label: `Medida: ${d}`, onClear: () => setDim('') })

    if (selectedGroupKey) {
      const raw = String(selectedGroupKey)
      const show = raw.length > 18 ? `${raw.slice(0, 18)}…` : raw
      chips.push({ key: 'group', label: `Grupo: ${show}`, onClear: () => setSelectedGroupKey('') })
    }

    if (selectedDay) chips.push({ key: 'day', label: `Día: ${selectedDay}`, onClear: () => setSelectedDay('') })

    return chips
  }, [defaultKinds, kinds, status, dim, selectedGroupKey, selectedDay, setKinds, setStatus, setDim, setSelectedGroupKey])

  return (
    <section className="page">
      <header className="page-header">
        <h2>Dashboard</h2>
        <div className="actions">
          <button
            type="button"
            className="btn"
            onClick={() => {
              setKinds(['materias-primas', 'subensambles', 'productos-terminados'])
              setStatus('all')
              setDim('')
              setSelectedGroupKey('')
              setSelectedDay('')
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
          <KpiCard label="Artículos" value={isLoading ? '-' : formatNumber(kpis.totalItems)} />
          <KpiCard label="Existencia total" value={isLoading ? '-' : formatNumber(Math.round(kpis.totalCantidad))} />
          <KpiCard
            label="Bajo mínimo"
            value={isLoading ? '-' : formatNumber(kpis.alertas)}
            badge={!isLoading && kpis.alertas > 0 ? 'URGENTE' : ''}
            tone={!isLoading && kpis.alertas > 0 ? 'tone-warn' : ''}
            onClick={() => {
              toggleStatus('below_min')
              setFocusTab('alerts')
              setAlertsMode('below_min')
              setIsAlertsOpen(true)
            }}
          />
          <KpiCard
            label="Sobre máximo"
            value={isLoading ? '-' : formatNumber(kpis.sobreMax)}
            badge={!isLoading && kpis.sobreMax > 0 ? 'ATENCIÓN' : ''}
            tone={!isLoading && kpis.sobreMax > 0 ? 'tone-danger' : ''}
            onClick={() => {
              toggleStatus('over_max')
              setFocusTab('over')
              setAlertsMode('over_max')
              setIsAlertsOpen(true)
            }}
          />
          <KpiCard
            label="Cero stock"
            value={isLoading ? '-' : formatNumber(zeroCount)}
            badge={!isLoading && zeroCount > 0 ? 'CRÍTICO' : ''}
            tone={!isLoading && zeroCount > 0 ? 'tone-danger' : ''}
            onClick={() => {
              toggleStatus('zero')
              setAlertsMode('zero')
              setIsAlertsOpen(true)
            }}
          />
          <KpiCard label="Salud" value={isLoading ? '-' : `${formatNumber(kpis.salud)}%`} />
          <KpiCard
            label="Reorden sugerido"
            value={isLoading ? '-' : formatNumber(Math.round(reorderSuggested))}
            badge="Plan"
            onClick={() => {
              toggleStatus('below_min')
              setFocusTab('alerts')
            }}
          />
        </div>

        {activeFilterChips.length ? (
          <div className="filter-chipbar" aria-label="Filtros activos">
            {activeFilterChips.map((c) => (
              <button key={c.key} type="button" className="filter-chip" onClick={c.onClear} title="Quitar filtro">
                <span className="filter-chip-label">{c.label}</span>
                <span className="filter-chip-x" aria-hidden="true">
                  ×
                </span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="dash-layout">
          <div className="dash-main">
            <div className="grid-3">
              <Bars
                title="Totales por área (existencia)"
                series={kindTotals.seriesQty}
                onSelectLabel={(label) => {
                  const target = ['materias-primas', 'subensambles', 'productos-terminados'].find(
                    (k) => kindLabel(k) === label,
                  )
                  if (target) toggleKind(target)
                }}
              />
              <Bars
                title="Totales por estado (artículos)"
                series={statusTotals.map((s) => ({ label: s.label, value: s.value }))}
                onSelectLabel={(label) => {
                  const s = statusTotals.find((x) => x.label === label)
                  if (s?.key) {
                    toggleStatus(s.key)
                    if (s.key === 'below_min') {
                      setAlertsMode('below_min')
                      setIsAlertsOpen(true)
                      setFocusTab('alerts')
                    } else if (s.key === 'over_max') {
                      setAlertsMode('over_max')
                      setIsAlertsOpen(true)
                      setFocusTab('over')
                    } else if (s.key === 'zero') {
                      setAlertsMode('zero')
                      setIsAlertsOpen(true)
                    }
                  }
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
                centerLabel={status === 'all' ? 'Todos' : status === 'below_min' ? 'Bajo mín' : status === 'over_max' ? 'Sobre máx' : status === 'zero' ? 'Cero' : 'Saludable'}
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
                  if (s?.key) {
                    toggleStatus(s.key)
                    if (s.key === 'below_min' || s.key === 'over_max' || s.key === 'zero') {
                      setAlertsMode(s.key)
                      setIsAlertsOpen(true)
                    }
                  }
                }}
              />
              <ColumnChart
                title="Top grupos (columnas)"
                series={topGroups.slice(0, 10).map((x) => ({ ...x, color: 'rgba(30, 195, 167, 0.85)' }))}
                onSelectLabel={(label) => setSelectedGroupKey(normalizeGroupKey(label))}
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
              <Gauge title="Salud (gauge)" value={kpis.salud} max={100} onClick={() => toggleStatus('healthy')} />
            </div>

            <div className="grid-2">
              <StackedBars
                title="Actividad (stacked)"
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
                title="Actividad (líneas)"
                rows={dailyRows}
                series={movementSeriesSpecBi}
                enabledMap={movementEnabled}
                onToggleSeries={(key) => setMovementEnabled((m) => ({ ...m, [key]: !m[key] }))}
                valueFormatter={(n) => formatNumber(Math.round(n))}
              />
            </div>

            {selectedDayRow ? (
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                  <div className="card-title" style={{ marginBottom: 0 }}>
                    Detalle del día: {selectedDayRow.label}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" className="btn" onClick={() => setIsMovementsOpen(true)}>
                      Ver movimientos
                    </button>
                    <button type="button" className="btn" onClick={() => setSelectedDay('')}>
                      Quitar
                    </button>
                  </div>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                <div className="card-title" style={{ marginBottom: 0 }}>
                  Enfoque operativo
                </div>
                <div className="segmented">
                  <button
                    type="button"
                    className={focusTab === 'alerts' ? 'seg active' : 'seg'}
                    onClick={() => setFocusTab('alerts')}
                  >
                    Bajo mínimo
                  </button>
                  <button
                    type="button"
                    className={focusTab === 'over' ? 'seg active' : 'seg'}
                    onClick={() => setFocusTab('over')}
                  >
                    Sobre máximo
                  </button>
                </div>
              </div>

              <div className="table-wrap" style={{ marginTop: 12 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Área</th>
                      <th>Código</th>
                      <th>Nombre</th>
                      <th>Medida</th>
                      <th className="num">Stock</th>
                      {focusTab === 'alerts' ? (
                        <>
                          <th className="num">Mín</th>
                          <th className="num">Falta</th>
                        </>
                      ) : (
                        <>
                          <th className="num">Máx</th>
                          <th className="num">Exceso</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr>
                        <td colSpan={focusTab === 'alerts' ? 7 : 7} className="empty">
                          Cargando...
                        </td>
                      </tr>
                    ) : focusTab === 'alerts' ? (
                      alertRows.length ? (
                        alertRows.map((r) => (
                          <tr
                            key={`${r.kind}:${r.id}`}
                            onClick={() => setSelectedItem(r)}
                            style={{
                              cursor: 'pointer',
                              background: 'color-mix(in srgb, rgba(245, 158, 11, 0.22) 22%, var(--panel))',
                            }}
                            title="Click para ver detalle"
                          >
                            <td>{kindLabel(r.kind)}</td>
                            <td className="mono">{r.codigo}</td>
                            <td>{r.nombre}</td>
                            <td>{r.medida || 'NO POSEE'}</td>
                            <td className="num">{formatNumber(r.cantidad)}</td>
                            <td className="num">{formatNumber(r.minStock)}</td>
                            <td className="num" style={{ fontWeight: 900, color: 'rgba(245, 158, 11, 0.95)' }}>
                              {formatNumber(r.deficit)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} className="empty">
                            Sin alertas con los filtros actuales.
                          </td>
                        </tr>
                      )
                    ) : overMaxRows.length ? (
                      overMaxRows.map((r) => (
                        <tr
                          key={`${r.kind}:${r.id}`}
                          onClick={() => setSelectedItem(r)}
                          style={{
                            cursor: 'pointer',
                            background: 'color-mix(in srgb, rgba(239, 68, 68, 0.22) 22%, var(--panel))',
                          }}
                          title="Click para ver detalle"
                        >
                          <td>{kindLabel(r.kind)}</td>
                          <td className="mono">{r.codigo}</td>
                          <td>{r.nombre}</td>
                          <td>{r.medida || 'NO POSEE'}</td>
                          <td className="num">{formatNumber(r.cantidad)}</td>
                          <td className="num">{formatNumber(r.maxStock)}</td>
                          <td className="num" style={{ fontWeight: 900, color: 'rgba(239, 68, 68, 0.9)' }}>
                            {formatNumber(r.excess)}
                          </td>
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

            <div className="grid-2">
              <div className="card">
                <div className="card-title">Top grupos con alertas</div>
                {isLoading ? (
                  <div className="empty">Cargando...</div>
                ) : topAlertGroups.length ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {topAlertGroups.map((g) => (
                      <button
                        key={g.key}
                        type="button"
                        className="nav-link"
                        onClick={() => setSelectedGroupKey(g.key)}
                      >
                        <span className="mono" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {g.nombre}
                        </span>
                        <span className="pill" style={{ marginLeft: 10 }}>
                          {formatNumber(g.alerts)}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="empty">Sin alertas.</div>
                )}
              </div>

              <div className="card">
                <div className="card-title">Top grupos con sobre stock</div>
                {isLoading ? (
                  <div className="empty">Cargando...</div>
                ) : topOverGroups.length ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {topOverGroups.map((g) => (
                      <button
                        key={g.key}
                        type="button"
                        className="nav-link"
                        onClick={() => {
                          setSelectedGroupKey(g.key)
                          toggleStatus('over_max')
                          setFocusTab('over')
                        }}
                      >
                        <span className="mono" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {g.nombre}
                        </span>
                        <span className="pill" style={{ marginLeft: 10 }}>
                          {formatNumber(Math.round(g.exceso))}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="empty">Sin sobre stock.</div>
                )}
              </div>
            </div>
          </div>

          <aside className="dash-side">
            <Bars
              title="Top grupos (existencia)"
              series={topGroups.length ? topGroups : []}
              onSelectLabel={(label) => {
                setSelectedGroupKey(normalizeGroupKey(label))
              }}
            />
            <RadarChart title="Radar operativo" metrics={radarMetrics} />
            <div className="card">
              <div className="card-title">Movimientos (7d)</div>
              <div className="kv">
                <div className="kv-row">
                  <div className="kv-k">Salida</div>
                  <div className="kv-v">{formatNumber(Math.round(netProyecto.salida))}</div>
                </div>
                <div className="kv-row">
                  <div className="kv-k">Devolución</div>
                  <div className="kv-v">{formatNumber(Math.round(netProyecto.devol))}</div>
                </div>
                <div className="kv-row">
                  <div className="kv-k">Net</div>
                  <div className="kv-v">{formatNumber(Math.round(netProyecto.net))}</div>
                </div>
              </div>
            </div>
          </aside>
        </div>

        <GroupModal group={selectedGroup} onClose={() => setSelectedGroupKey('')} />
        {isAlertsOpen ? (
          <AlertsModal
            title={alertsMode === 'below_min' ? 'Bajo mínimo' : alertsMode === 'over_max' ? 'Sobre máximo' : 'Cero stock'}
            mode={alertsMode}
            rows={alertsMode === 'below_min' ? belowMinAll : alertsMode === 'over_max' ? overMaxAll : zeroAll}
            onClose={() => setIsAlertsOpen(false)}
            onPickItem={(it) => {
              setSelectedItem(it)
              setIsAlertsOpen(false)
            }}
          />
        ) : null}
        <ItemModal item={selectedItem} onClose={() => setSelectedItem(null)} />
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
