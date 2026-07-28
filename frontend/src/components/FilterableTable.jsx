import { useEffect, useMemo, useRef, useState } from 'react'

function defaultValue(col, row) {
  return col.value ? col.value(row) : row[col.key]
}

function defaultDisplay(col, row) {
  const v = defaultValue(col, row)
  if (v === null || v === undefined || v === '') return '-'
  return String(v)
}

function compareValues(a, b, type) {
  if (type === 'number') {
    const na = Number(a)
    const nb = Number(b)
    const fa = Number.isFinite(na) ? na : -Infinity
    const fb = Number.isFinite(nb) ? nb : -Infinity
    return fa - fb
  }
  return String(a ?? '').localeCompare(String(b ?? ''), 'es', { numeric: true, sensitivity: 'base' })
}

function ColumnFilterPopover({ col, uniqueValues, activeFilter, onChange, onClose }) {
  const ref = useRef(null)
  const [text, setText] = useState(activeFilter?.text || '')
  const [selected, setSelected] = useState(() => activeFilter?.values ? new Set(activeFilter.values) : null)

  useEffect(() => {
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const checkedSet = selected || new Set(uniqueValues)

  function toggleValue(v) {
    const next = new Set(checkedSet)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    setSelected(next)
  }

  function selectAll() {
    setSelected(null)
  }

  function clearAll() {
    setSelected(new Set())
  }

  function apply() {
    const allSelected = !selected || selected.size >= uniqueValues.length
    onChange({
      text: text.trim(),
      values: allSelected ? null : Array.from(checkedSet),
    })
    onClose()
  }

  function clearFilter() {
    setText('')
    setSelected(null)
    onChange({ text: '', values: null })
    onClose()
  }

  return (
    <div className="col-filter-popover" ref={ref}>
      {col.type !== 'enum' ? (
        <input
          className="col-filter-search"
          placeholder={`Buscar en ${col.label.toLowerCase()}...`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
        />
      ) : null}

      <div className="col-filter-sort">
        <button type="button" className="btn" onClick={() => { onChange({ ...activeFilter, sortDir: 'asc' }); onClose() }}>
          ↑ Ordenar A-Z
        </button>
        <button type="button" className="btn" onClick={() => { onChange({ ...activeFilter, sortDir: 'desc' }); onClose() }}>
          ↓ Ordenar Z-A
        </button>
      </div>

      <div className="col-filter-list-head">
        <button type="button" className="col-filter-link" onClick={selectAll}>
          Seleccionar todo
        </button>
        <button type="button" className="col-filter-link" onClick={clearAll}>
          Limpiar
        </button>
      </div>

      <div className="col-filter-list">
        {uniqueValues.length ? (
          uniqueValues.map((v) => (
            <label className="col-filter-item" key={v}>
              <input
                type="checkbox"
                checked={checkedSet.has(v)}
                onChange={() => toggleValue(v)}
              />
              <span>{v === '' ? '(vacío)' : v}</span>
            </label>
          ))
        ) : (
          <div className="muted">Sin valores</div>
        )}
      </div>

      <div className="col-filter-actions">
        <button type="button" className="btn" onClick={clearFilter}>
          Quitar filtro
        </button>
        <button type="button" className="btn primary" onClick={apply}>
          Aplicar
        </button>
      </div>
    </div>
  )
}

export default function FilterableTable({
  columns,
  rows,
  isLoading = false,
  emptyMessage = 'No hay resultados.',
  loadingMessage = 'Cargando...',
  rowKey = (row) => row.id,
}) {
  const [filters, setFilters] = useState({})
  const [sort, setSort] = useState({ key: null, dir: 'asc' })
  const [openKey, setOpenKey] = useState(null)

  const uniqueValuesByKey = useMemo(() => {
    const map = {}
    for (const col of columns) {
      if (col.filterable === false) continue
      const set = new Set()
      for (const row of rows) set.add(defaultDisplay(col, row))
      map[col.key] = Array.from(set).sort((a, b) => compareValues(a, b, col.type))
    }
    return map
  }, [columns, rows])

  const hasActiveFilters = useMemo(
    () => Object.values(filters).some((f) => f && (f.text || f.values)),
    [filters],
  )

  const filteredRows = useMemo(() => {
    let result = rows
    for (const col of columns) {
      const f = filters[col.key]
      if (!f) continue
      if (f.text) {
        const needle = f.text.toLowerCase()
        result = result.filter((row) => defaultDisplay(col, row).toLowerCase().includes(needle))
      }
      if (f.values) {
        const allowed = new Set(f.values)
        result = result.filter((row) => allowed.has(defaultDisplay(col, row)))
      }
    }
    if (sort.key) {
      const col = columns.find((c) => c.key === sort.key)
      if (col) {
        result = [...result].sort((a, b) => {
          const cmp = compareValues(defaultValue(col, a), defaultValue(col, b), col.type)
          return sort.dir === 'desc' ? -cmp : cmp
        })
      }
    }
    return result
  }, [rows, columns, filters, sort])

  function updateFilter(key, next) {
    setFilters((prev) => ({ ...prev, [key]: next }))
    if (next?.sortDir) setSort({ key, dir: next.sortDir })
  }

  function clearAllFilters() {
    setFilters({})
    setSort({ key: null, dir: 'asc' })
  }

  return (
    <div className="table-wrap">
      {hasActiveFilters ? (
        <div className="col-filter-toolbar">
          <button type="button" className="btn" onClick={clearAllFilters}>
            Limpiar todos los filtros
          </button>
        </div>
      ) : null}
      <table className="table">
        <thead>
          <tr>
            {columns.map((col) => {
              const isFilterable = col.filterable !== false
              const isActive = Boolean(filters[col.key]?.text || filters[col.key]?.values)
              return (
                <th key={col.key} style={col.align ? { textAlign: col.align } : undefined}>
                  <div className="th-inner">
                    <span>{col.label}</span>
                    {isFilterable ? (
                      <span className="th-filter-wrap">
                        <button
                          type="button"
                          className={isActive ? 'col-filter-btn active' : 'col-filter-btn'}
                          onClick={() => setOpenKey((k) => (k === col.key ? null : col.key))}
                          aria-label={`Filtrar ${col.label}`}
                          title={`Filtrar ${col.label}`}
                        >
                          ▾
                        </button>
                        {openKey === col.key ? (
                          <ColumnFilterPopover
                            col={col}
                            uniqueValues={uniqueValuesByKey[col.key] || []}
                            activeFilter={filters[col.key]}
                            onChange={(next) => updateFilter(col.key, next)}
                            onClose={() => setOpenKey(null)}
                          />
                        ) : null}
                      </span>
                    ) : null}
                  </div>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td colSpan={columns.length} className="empty">
                {loadingMessage}
              </td>
            </tr>
          ) : filteredRows.length ? (
            filteredRows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((col) => (
                  <td key={col.key} className={col.className} style={col.align ? { textAlign: col.align } : undefined}>
                    {col.render ? col.render(row) : defaultDisplay(col, row)}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} className="empty">
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
