import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

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

const POPOVER_WIDTH = 260

function ColumnFilterPopover({ col, anchorRect, uniqueValues, activeFilter, onChange, onClose }) {
  const ref = useRef(null)
  const [text, setText] = useState(activeFilter?.text || '')
  const [selected, setSelected] = useState(() => activeFilter?.values ? new Set(activeFilter.values) : null)
  const [style, setStyle] = useState(null)

  useLayoutEffect(() => {
    if (!anchorRect) return
    const margin = 8
    const top = anchorRect.bottom + 6
    const maxLeft = Math.max(margin, window.innerWidth - POPOVER_WIDTH - margin)
    const left = Math.min(Math.max(anchorRect.left, margin), maxLeft)
    setStyle({ position: 'fixed', top, left, width: POPOVER_WIDTH })
  }, [anchorRect])

  useEffect(() => {
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    function onScrollOrResize() {
      onClose()
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
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

  if (!style) return null

  return createPortal(
    <div className="col-filter-popover" ref={ref} style={style}>
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
    </div>,
    document.body,
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
  const [openState, setOpenState] = useState(null)

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

  function toggleOpen(key, e) {
    const rect = e.currentTarget.getBoundingClientRect()
    setOpenState((s) => (s && s.key === key ? null : { key, rect }))
  }

  return (
    <div className="filterable-table">
      <div className="col-filter-toolbar">
        <button type="button" className="btn" onClick={clearAllFilters} disabled={!hasActiveFilters}>
          Limpiar todos los filtros
        </button>
      </div>
      <div className="table-wrap">
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
                            onClick={(e) => toggleOpen(col.key, e)}
                            aria-label={`Filtrar ${col.label}`}
                            title={`Filtrar ${col.label}`}
                          >
                            ▾
                          </button>
                          {openState?.key === col.key ? (
                            <ColumnFilterPopover
                              col={col}
                              anchorRect={openState.rect}
                              uniqueValues={uniqueValuesByKey[col.key] || []}
                              activeFilter={filters[col.key]}
                              onChange={(next) => updateFilter(col.key, next)}
                              onClose={() => setOpenState(null)}
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
    </div>
  )
}
