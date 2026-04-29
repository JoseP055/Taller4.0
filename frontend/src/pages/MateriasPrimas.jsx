import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'

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
const KIND = 'materias-primas'
const FIXED_LOCATION_CODE = 'CONSUMIBLES'
const ACCESS_TOKEN_KEY = 'ductos_inventory_supabase_access_token'

function authHeaders() {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY)
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

function formatDate(date) {
  return date.toLocaleDateString('es-ES', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function sum(items, selector) {
  let total = 0
  for (const item of items) total += selector(item)
  return total
}

function roundPercent(value) {
  if (!Number.isFinite(value)) return 0
  return Math.round(value)
}

function formatNumber(n) {
  return new Intl.NumberFormat('es-ES').format(n)
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
  if (!res.ok) {
    throw new Error(await readApiError(res))
  }
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
  if (!res.ok) {
    throw new Error(await readApiError(res))
  }
  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('application/json')) return res.json()
  return null
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

function Bars({ title, series }) {
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
          <div className="bar-row" key={x.label}>
            <div className="bar-label" title={x.label}>
              {x.label}
            </div>
            <div className="bar-track" aria-hidden="true">
              <div
                className="bar-fill"
                style={{ width: `${(x.value / max) * 100}%` }}
              />
            </div>
            <div className="bar-value">{formatNumber(x.value)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatusDistribution({ title, groups }) {
  const total = useMemo(() => sum(groups, (g) => g.count), [groups])
  const safeTotal = total || 1

  return (
    <div className="card">
      <div className="card-title">{title}</div>
      <div className="status-list">
        {groups.map((g) => {
          const pct = roundPercent((g.count / safeTotal) * 100)
          return (
            <div className="status-row" key={g.label}>
              <div className="status-row-top">
                <div className="status-name">{g.label}</div>
                <div className="status-pct">{pct}%</div>
              </div>
              <div className="status-track" aria-hidden="true">
                <div className="status-fill" style={{ width: `${pct}%` }} />
              </div>
              <div className="status-desc">
                {formatNumber(g.count)} artículos {g.label.toLowerCase()} ({pct}%)
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function InventoryTable({
  items,
  filter,
  setFilter,
  search,
  setSearch,
  isLoading,
  onAdd,
  canAdd,
  onEdit,
  onQr,
}) {
  const filtered = useMemo(() => items, [items])

  return (
    <div className="card">
      <div className="table-top">
        <div className="table-filters">
          <div className="segmented" role="tablist" aria-label="Filtro de estado">
            <button
              type="button"
              className={filter === 'Todas' ? 'seg active' : 'seg'}
              onClick={() => setFilter('Todas')}
            >
              Todas
            </button>
            <button
              type="button"
              className={filter === 'Disponible' ? 'seg active' : 'seg'}
              onClick={() => setFilter('Disponible')}
            >
              Disponible
            </button>
            <button
              type="button"
              className={filter === 'Alerta' ? 'seg active' : 'seg'}
              onClick={() => setFilter('Alerta')}
            >
              Alertas
            </button>
          </div>
          <input
            className="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar código, nombre, subcategoría..."
          />
        </div>

        <button
          className="primary"
          type="button"
          onClick={onAdd}
          disabled={!canAdd}
        >
          Agregar
        </button>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Nombre</th>
              <th>Subcategoría</th>
              <th>Medida</th>
              <th>Cantidad</th>
              <th>Unidad</th>
              <th>Mín. Stock</th>
              <th>Ubicación</th>
              <th>Estado</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={10} className="empty">
                  Cargando...
                </td>
              </tr>
            ) : filtered.length ? (
              filtered.map((x) => (
                <tr key={x.id}>
                  <td className="mono">{x.codigo}</td>
                  <td>{x.nombre}</td>
                  <td>{x.subcategoria}</td>
                  <td>{x.medida || '-'}</td>
                  <td className="num">{formatNumber(x.cantidad)}</td>
                  <td>{x.unidad}</td>
                  <td className="num">{formatNumber(x.minStock)}</td>
                  <td>{x.ubicacion}</td>
                  <td>
                    <span className="pill">{x.estado}</span>
                  </td>
                  <td>
                    <div className="actions inline">
                      <button
                        type="button"
                        className="btn icon"
                        onClick={() => onEdit(x)}
                        title="Editar"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="btn icon qr"
                        onClick={() => onQr(x)}
                        title="QR"
                      >
                        QR
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={10} className="empty">
                  No hay resultados para el filtro actual.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ItemModal({ meta, onClose, onSave }) {
  const subcats = useMemo(() => meta?.subcategorias || [], [meta])
  const ubis = useMemo(() => meta?.ubicaciones || [], [meta])
  const [codigoPreview, setCodigoPreview] = useState(null)

  const stockLocationLabel = useMemo(() => {
    const stock = ubis.find((u) => u.codigo === FIXED_LOCATION_CODE)
    if (stock && stock.nombre) return `${FIXED_LOCATION_CODE} — ${stock.nombre}`
    return `${FIXED_LOCATION_CODE} — AREA`
  }, [ubis])

  const dimensionOptions = useMemo(() => {
    const opts = ['']
    for (let i = 1; i <= 48; i++) {
      const whole = Math.floor(i / 2)
      const isHalf = i % 2 === 1
      if (i === 1) opts.push('1/2')
      else if (!isHalf) opts.push(String(whole))
      else opts.push(`${whole} 1/2`)
    }
    return opts
  }, [])

  const unidadOptions = useMemo(
    () => ['UND', 'PZ', 'MTS', 'KGS', 'GAL', 'LTS', 'TON', 'GRS'],
    [],
  )

  const medidaUnidadOptions = useMemo(
    () => ['', 'PULG', 'MTS', 'MM', 'CM', 'GAL', 'LTS', 'TON', 'KGS', 'GRS'],
    [],
  )

  const [value, setValue] = useState(() => ({
    codigo_sap: '',
    id_subcategoria: subcats[0]?.id ?? '',
    nombre_base: '',
    descripcion: '',
    dimension_principal: '',
    dimension_unidad: '',
    detalle_adicional: '',
    unidad_medida: 'UND',
    cantidad_actual: 0,
    minimo: 0,
    maximo: 0,
    punto_reorden: 0,
  }))

  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!value.id_subcategoria) return

    const controller = new AbortController()
    fetchJson(
      `/inventario/${KIND}/next-codigo?id_subcategoria=${encodeURIComponent(
        value.id_subcategoria,
      )}`,
      { signal: controller.signal },
    )
      .then((data) => setCodigoPreview(data?.codigo_articulo ?? null))
      .catch((e) => {
        if (controller.signal.aborted) return
        setCodigoPreview(null)
        setError(e?.message || 'No se pudo generar el código')
      })

    return () => controller.abort()
  }, [value.id_subcategoria])

  function update(field) {
    return (e) => {
      const raw = e.target.value
      let next = raw
      if (
        field === 'cantidad_actual' ||
        field === 'minimo' ||
        field === 'maximo' ||
        field === 'punto_reorden'
      ) {
        next = raw === '' ? '' : Number(raw)
      }
      if (
        field === 'nombre_base' ||
        field === 'descripcion' ||
        field === 'detalle_adicional'
      ) {
        next = String(next).toUpperCase()
      }
      if (field === 'unidad_medida') next = String(next).toUpperCase()
      if (field === 'dimension_unidad') next = String(next).toUpperCase()

      setError('')
      if (field === 'id_subcategoria') setCodigoPreview(null)
      setValue((v) => ({ ...v, [field]: next }))
    }
  }

  function submit(e) {
    e.preventDefault()
    setError('')
    setIsSubmitting(true)

    if (!codigoPreview) {
      setError('No se pudo generar el código del artículo.')
      setIsSubmitting(false)
      return
    }

    const id_subcategoria = Number(value.id_subcategoria)
    if (!Number.isFinite(id_subcategoria) || id_subcategoria <= 0) {
      setError('Subcategoría inválida.')
      setIsSubmitting(false)
      return
    }

    const nombre_base = String(value.nombre_base).trim()
    if (!nombre_base) {
      setError('Nombre es obligatorio.')
      setIsSubmitting(false)
      return
    }

    const unidad_medida = String(value.unidad_medida).trim()
    if (!unidad_medida) {
      setError('Unidad de medida es obligatoria.')
      setIsSubmitting(false)
      return
    }

    const dimensionValue = String(value.dimension_principal).trim()
    const dimensionUnit = String(value.dimension_unidad).trim()

    const codigoSapRaw = String(value.codigo_sap).trim()
    const codigo_sap = codigoSapRaw ? Number(codigoSapRaw) : null
    if (codigoSapRaw && (!Number.isFinite(codigo_sap) || codigo_sap <= 0)) {
      setError('Código SAP inválido.')
      setIsSubmitting(false)
      return
    }

    const numericFields = ['cantidad_actual', 'minimo', 'maximo', 'punto_reorden']
    for (const f of numericFields) {
      const v = value[f]
      if (v === '') continue
      if (!Number.isFinite(v) || v < 0) {
        setError('Valores numéricos inválidos.')
        setIsSubmitting(false)
        return
      }
    }

    onSave({
      codigo_sap,
      id_subcategoria,
      nombre_base,
      descripcion: value.descripcion ? String(value.descripcion).toUpperCase() : null,
      dimension_principal:
        dimensionValue && dimensionUnit
          ? `${dimensionValue} ${dimensionUnit}`.toUpperCase()
          : null,
      detalle_adicional: value.detalle_adicional
        ? String(value.detalle_adicional).toUpperCase()
        : null,
      unidad_medida,
      ubicacion_codigo: FIXED_LOCATION_CODE,
      cantidad_actual: Number(value.cantidad_actual || 0),
      minimo: Number(value.minimo || 0),
      maximo: Number(value.maximo || 0),
      punto_reorden: Number(value.punto_reorden || 0),
    })
      .catch((e) => setError(e?.message || 'No se pudo guardar'))
      .finally(() => setIsSubmitting(false))
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="modal-head">
          <div className="modal-title">Agregar materia prima</div>
          <button type="button" className="btn" onClick={onClose}>
            Cerrar
          </button>
        </div>

        <form className="modal-body" onSubmit={submit}>
          <div className="form-grid">
            <label className="field">
              <span>Código (Artículo)</span>
              <input
                value={codigoPreview ? String(codigoPreview) : 'Generando...'}
                disabled
              />
            </label>

            <label className="field">
              <span>Código SAP (opcional)</span>
              <input
                value={value.codigo_sap}
                onChange={update('codigo_sap')}
                placeholder="123456"
                inputMode="numeric"
              />
            </label>

            <label className="field">
              <span>Nombre</span>
              <input
                value={value.nombre_base}
                onChange={update('nombre_base')}
                placeholder="MATERIA PRIMA..."
                required
              />
            </label>

            <label className="field">
              <span>Unidad de medida</span>
              <select value={value.unidad_medida} onChange={update('unidad_medida')}>
                {unidadOptions.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Subcategoría</span>
              <select
                value={value.id_subcategoria}
                onChange={update('id_subcategoria')}
                disabled={!subcats.length}
              >
                {subcats.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Ubicación</span>
              <input value={stockLocationLabel} disabled />
            </label>

            <label className="field">
              <span>Medida</span>
              <select
                value={value.dimension_principal}
                onChange={update('dimension_principal')}
              >
                {dimensionOptions.map((d) => (
                  <option key={d} value={d}>
                    {d ? d : 'NO POSEE'}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Unidad (Medida)</span>
              <select value={value.dimension_unidad} onChange={update('dimension_unidad')}>
                {medidaUnidadOptions.map((u) => (
                  <option key={u} value={u}>
                    {u ? u : 'NO POSEE'}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Detalle adicional</span>
              <input
                value={value.detalle_adicional}
                onChange={update('detalle_adicional')}
                placeholder="Material / nota..."
              />
            </label>

            <label className="field">
              <span>Descripción</span>
              <input
                value={value.descripcion}
                onChange={update('descripcion')}
                placeholder="Descripción general..."
              />
            </label>

            <div />

            <label className="field">
              <span>Cantidad</span>
              <input
                type="number"
                min="0"
                step="0.001"
                value={value.cantidad_actual}
                onChange={update('cantidad_actual')}
              />
            </label>

            <label className="field">
              <span>Mín. Stock</span>
              <input
                type="number"
                min="0"
                step="0.001"
                value={value.minimo}
                onChange={update('minimo')}
              />
            </label>

            <label className="field">
              <span>Máx. Stock</span>
              <input
                type="number"
                min="0"
                step="0.001"
                value={value.maximo}
                onChange={update('maximo')}
              />
            </label>

            <label className="field">
              <span>Punto reorden</span>
              <input
                type="number"
                min="0"
                step="0.001"
                value={value.punto_reorden}
                onChange={update('punto_reorden')}
              />
            </label>
          </div>

          {error ? <div className="form-error">{error}</div> : null}

          <div className="modal-actions">
            <button className="primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function QrModal({ codigo, onClose }) {
  const [dataUrl, setDataUrl] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    QRCode.toDataURL(String(codigo), { width: 220, margin: 1 })
      .then((url) => {
        if (!active) return
        setDataUrl(url)
      })
      .catch((e) => {
        if (!active) return
        setError(e?.message || 'No se pudo generar el QR')
      })
    return () => {
      active = false
    }
  }, [codigo])

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-head">
          <div className="modal-title">Código QR</div>
          <button type="button" className="btn" onClick={onClose}>
            Cerrar
          </button>
        </div>
        <div className="modal-body">
          <div className="qr-wrap">
            {dataUrl ? (
              <img className="qr-code" src={dataUrl} alt={`QR ${codigo}`} />
            ) : (
              <div className="muted">Generando...</div>
            )}
            <div className="mono">{String(codigo)}</div>
          </div>
          {error ? <div className="form-error">{error}</div> : null}
        </div>
      </div>
    </div>
  )
}

function EditItemModal({ item, onClose, onSave }) {
  const dimensionOptions = useMemo(() => {
    const opts = ['']
    for (let i = 1; i <= 48; i++) {
      const whole = Math.floor(i / 2)
      const isHalf = i % 2 === 1
      if (i === 1) opts.push('1/2')
      else if (!isHalf) opts.push(String(whole))
      else opts.push(`${whole} 1/2`)
    }
    return opts
  }, [])

  const unidadOptions = useMemo(
    () => ['UND', 'PZ', 'MTS', 'KGS', 'GAL', 'LTS', 'TON', 'GRS'],
    [],
  )

  const medidaUnidadOptions = useMemo(
    () => ['', 'PULG', 'MTS', 'MM', 'CM', 'GAL', 'LTS', 'TON', 'KGS', 'GRS'],
    [],
  )

  const parsedMedida = useMemo(() => {
    const raw = String(item?.medida || '').trim()
    if (!raw) return { value: '', unit: '' }
    const parts = raw.split(/\s+/)
    if (parts.length >= 2) return { value: parts.slice(0, -1).join(' '), unit: parts.at(-1) }
    return { value: raw, unit: '' }
  }, [item])

  const [value, setValue] = useState(() => ({
    nombre_base: item?.nombre || '',
    unidad_medida: item?.unidad || 'UND',
    dimension_value: parsedMedida.value || '',
    dimension_unit: parsedMedida.unit || '',
    cantidad_actual: String(item?.cantidad ?? 0),
    minimo: String(item?.minStock ?? 0),
    maximo: String(item?.maxStock ?? 0),
    punto_reorden: String(item?.puntoReorden ?? 0),
  }))
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  function update(field) {
    return (e) => {
      const raw = e.target.value
      let next = raw
      if (field === 'nombre_base') {
        next = String(next).toUpperCase()
      }
      if (field === 'unidad_medida' || field === 'dimension_unit') {
        next = String(next).toUpperCase()
      }
      setError('')
      setValue((v) => ({ ...v, [field]: next }))
    }
  }

  function submit(e) {
    e.preventDefault()
    setError('')
    setIsSubmitting(true)

    const nombre_base = String(value.nombre_base).trim()
    if (!nombre_base) {
      setError('Nombre es obligatorio.')
      setIsSubmitting(false)
      return
    }

    const unidad_medida = String(value.unidad_medida).trim()
    if (!unidad_medida) {
      setError('Unidad es obligatoria.')
      setIsSubmitting(false)
      return
    }

    const dimensionValue = String(value.dimension_value).trim()
    const dimensionUnit = String(value.dimension_unit).trim()
    const dimension_principal =
      dimensionValue && dimensionUnit ? `${dimensionValue} ${dimensionUnit}`.toUpperCase() : null

    const cantidad_actual = Number(String(value.cantidad_actual).trim())
    if (!Number.isFinite(cantidad_actual) || cantidad_actual < 0) {
      setError('Cantidad inválida.')
      setIsSubmitting(false)
      return
    }

    const minimo = Number(String(value.minimo).trim())
    if (!Number.isFinite(minimo) || minimo < 0) {
      setError('Mínimo inválido.')
      setIsSubmitting(false)
      return
    }

    const maximo = Number(String(value.maximo).trim())
    if (!Number.isFinite(maximo) || maximo < 0) {
      setError('Máximo inválido.')
      setIsSubmitting(false)
      return
    }

    const punto_reorden = Number(String(value.punto_reorden).trim())
    if (!Number.isFinite(punto_reorden) || punto_reorden < 0) {
      setError('Punto reorden inválido.')
      setIsSubmitting(false)
      return
    }

    onSave({
      nombre_base,
      unidad_medida,
      dimension_principal,
      cantidad_actual,
      minimo,
      maximo,
      punto_reorden,
    })
      .catch((e2) => setError(e2?.message || 'No se pudo guardar'))
      .finally(() => setIsSubmitting(false))
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="modal-head">
          <div className="modal-title">Editar artículo</div>
          <button type="button" className="btn" onClick={onClose}>
            Cerrar
          </button>
        </div>
        <form className="modal-body" onSubmit={submit}>
          <div className="form-grid">
            <label className="field">
              <span>Código</span>
              <input value={String(item.codigo)} disabled />
            </label>
            <label className="field">
              <span>Ubicación</span>
              <input value={FIXED_LOCATION_CODE} disabled />
            </label>
            <label className="field">
              <span>Nombre</span>
              <input value={value.nombre_base} onChange={update('nombre_base')} required />
            </label>
            <label className="field">
              <span>Unidad</span>
              <select value={value.unidad_medida} onChange={update('unidad_medida')}>
                {unidadOptions.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Medida</span>
              <select value={value.dimension_value} onChange={update('dimension_value')}>
                {dimensionOptions.map((d) => (
                  <option key={d} value={d}>
                    {d ? d : 'NO POSEE'}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Unidad (Medida)</span>
              <select value={value.dimension_unit} onChange={update('dimension_unit')}>
                {medidaUnidadOptions.map((u) => (
                  <option key={u} value={u}>
                    {u ? u : 'NO POSEE'}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Cantidad actual</span>
              <input
                type="number"
                min="0"
                step="0.001"
                value={value.cantidad_actual}
                onChange={update('cantidad_actual')}
              />
            </label>
            <label className="field">
              <span>Mín. Stock</span>
              <input
                type="number"
                min="0"
                step="0.001"
                value={value.minimo}
                onChange={update('minimo')}
              />
            </label>
            <label className="field">
              <span>Máx. Stock</span>
              <input
                type="number"
                min="0"
                step="0.001"
                value={value.maximo}
                onChange={update('maximo')}
              />
            </label>
            <label className="field">
              <span>Punto reorden</span>
              <input
                type="number"
                min="0"
                step="0.001"
                value={value.punto_reorden}
                onChange={update('punto_reorden')}
              />
            </label>
          </div>
          {error ? <div className="form-error">{error}</div> : null}
          <div className="modal-actions">
            <button className="primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function MateriasPrimas() {
  const [items, setItems] = useState([])
  const [summary, setSummary] = useState(null)
  const [filter, setFilter] = useState('Todas')
  const [search, setSearch] = useState('')

  const [isLoadingSummary, setIsLoadingSummary] = useState(true)
  const [isLoadingItems, setIsLoadingItems] = useState(true)
  const [meta, setMeta] = useState(null)
  const [isLoadingMeta, setIsLoadingMeta] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [qrItem, setQrItem] = useState(null)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    fetchJson(`/inventario/${KIND}/meta`, { signal: controller.signal })
      .then((data) => setMeta(data))
      .catch((e) => {
        if (controller.signal.aborted) return
        setMeta(null)
        setError(e?.message || 'No se pudo cargar catálogos')
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingMeta(false)
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetchJson(`/inventario/${KIND}/summary`, { signal: controller.signal })
      .then((data) => setSummary(data))
      .catch((e) => {
        if (controller.signal.aborted) return
        setSummary(null)
        setError(e?.message || 'No se pudo cargar el resumen')
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingSummary(false)
      })
    return () => controller.abort()
  }, [refreshKey])

  useEffect(() => {
    const controller = new AbortController()
    const handle = setTimeout(() => {
      setIsLoadingItems(true)
      setError('')

      const qs = new URLSearchParams()
      if (search.trim()) qs.set('search', search.trim())
      if (filter) qs.set('estatus', filter)
      qs.set('limit', '200')
      qs.set('offset', '0')

      fetchJson(`/inventario/${KIND}/items?${qs.toString()}`, {
        signal: controller.signal,
      })
        .then((data) => {
          const normalized = Array.isArray(data?.items)
            ? data.items.map((x) => ({
                id: x.id,
                codigo: String(x.codigo ?? ''),
                nombre: x.nombre ?? '',
                subcategoria: x.subcategoria ?? '',
                medida: x.medida ?? '',
                cantidad: Number(x.cantidad ?? 0),
                unidad: x.unidad ?? '',
                minStock: Number(x.min_stock ?? 0),
                maxStock: Number(x.max_stock ?? 0),
                puntoReorden: Number(x.punto_reorden ?? 0),
                ubicacion: x.ubicacion ?? '',
                estado: x.estatus ?? 'Disponible',
              }))
            : []
          setItems(normalized)
        })
        .catch((e) => {
          if (controller.signal.aborted) return
          setItems([])
          setError(e?.message || 'No se pudo cargar la tabla')
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsLoadingItems(false)
        })
    }, 350)

    return () => {
      controller.abort()
      clearTimeout(handle)
    }
  }, [filter, search, refreshKey])

  const kpis = summary?.kpis
  const totalArticulos = kpis?.articulos_registrados ?? 0
  const existencia = kpis?.en_existencia ?? 0
  const alertas = kpis?.alertas ?? 0
  const salud = kpis?.salud ?? 0

  const seriesExist = useMemo(() => {
    const rows = Array.isArray(summary?.existencia_por_subcategoria)
      ? summary.existencia_por_subcategoria
      : []
    return rows.map((r) => ({ label: r.subcategoria, value: Number(r.existencia) }))
  }, [summary])

  const statusGroups = useMemo(() => {
    const rows = Array.isArray(summary?.distribucion_estatus)
      ? summary.distribucion_estatus
      : []
    return rows.map((r) => ({ label: r.estatus, count: Number(r.articulos) }))
  }, [summary])

  async function onAdd() {
    setError('')
    if (isLoadingMeta || !meta) {
      setError('Cargando catálogos, intenta de nuevo en unos segundos.')
      return
    }

    const hasSubcats = Array.isArray(meta?.subcategorias) && meta.subcategorias.length > 0
    if (!hasSubcats) {
      try {
        setIsLoadingMeta(true)
        const fresh = await fetchJson(`/inventario/${KIND}/meta`)
        setMeta(fresh)
        const nowHasSubcats =
          Array.isArray(fresh?.subcategorias) && fresh.subcategorias.length > 0
        if (!nowHasSubcats) {
          setError('No hay subcategorías en la base de datos.')
          return
        }
      } catch (e) {
        setError(e?.message || 'No se pudo cargar catálogos')
        return
      } finally {
        setIsLoadingMeta(false)
      }
    }

    setModalOpen(true)
  }

  async function onSave(payload) {
    setError('')
    const res = await fetchApi(`/inventario/${KIND}/items`, { method: 'POST', body: payload })
    if (!res?.item) throw new Error('Respuesta inválida del servidor')
    setModalOpen(false)
    setIsLoadingSummary(true)
    setIsLoadingItems(true)
    setRefreshKey((k) => k + 1)
  }

  function onEdit(item) {
    setEditItem(item)
  }

  function onQr(item) {
    setQrItem(item)
  }

  async function onEditSave(payload) {
    setError('')
    await fetchApi(`/inventario/${KIND}/items/${editItem.id}`, { method: 'PATCH', body: payload })
    setEditItem(null)
    setIsLoadingSummary(true)
    setIsLoadingItems(true)
    setRefreshKey((k) => k + 1)
  }

  return (
    <section className="inv-page">
      <div className="inv-head">
        <div className="inv-breadcrumbs">Climatisa · Sistema de Inventario</div>
        <div className="inv-title-row">
          <h2 className="inv-title">Mat. Prima</h2>
          <div className="inv-meta">
            <span className="badge success">Sistema activo</span>
            <span className="muted">{formatDate(new Date())}</span>
          </div>
        </div>
      </div>

      {error ? <div className="form-error">{error}</div> : null}

      <div className="section-title">Materia Prima</div>
      <div className="stats">
        <StatCard
          label="Artículos registrados"
          value={isLoadingSummary ? '-' : formatNumber(totalArticulos)}
          sublabel={
            isLoadingSummary
              ? 'Cargando...'
              : `${formatNumber(totalArticulos)} artículos registrados`
          }
        />
        <StatCard
          label="En Existencia"
          value={isLoadingSummary ? '-' : formatNumber(existencia)}
        />
        <StatCard label="Alertas" value={isLoadingSummary ? '-' : formatNumber(alertas)} />
        <StatCard
          label="Salud"
          value={isLoadingSummary ? '-' : `${formatNumber(roundPercent(salud))}%`}
        />
      </div>

      <div className="grid-2">
        <Bars title="Existencia por Subcategoría" series={seriesExist} />
      </div>

      <div className="grid-2">
        <StatusDistribution title="Estado del Inventario" groups={statusGroups} />
        <div className="card">
          <div className="card-title">Conteo de artículos y existencia</div>
          <div className="legend">
            <div className="legend-item">
              <span className="dot muted" />
              <span>Existencia</span>
            </div>
          </div>
          <div className="mini-note muted">
            Vista rápida basada en las subcategorías (existencia).
          </div>
        </div>
      </div>

      <InventoryTable
        items={items}
        filter={filter}
        setFilter={setFilter}
        search={search}
        setSearch={setSearch}
        isLoading={isLoadingItems}
        onAdd={onAdd}
        canAdd={!isLoadingMeta && !!meta}
        onEdit={onEdit}
        onQr={onQr}
      />

      {modalOpen ? (
        <ItemModal meta={!isLoadingMeta ? meta : null} onClose={() => setModalOpen(false)} onSave={onSave} />
      ) : null}

      {editItem ? (
        <EditItemModal item={editItem} onClose={() => setEditItem(null)} onSave={onEditSave} />
      ) : null}

      {qrItem ? (
        <QrModal
          key={String(qrItem.codigo)}
          codigo={qrItem.codigo}
          onClose={() => setQrItem(null)}
        />
      ) : null}
    </section>
  )
}
