import { useEffect, useState } from 'react'

export default function ItemPicker({
  items,
  selectedId,
  onPick,
  disabled,
  emptyText,
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
                  <div className="muted" style={{ fontSize: 12 }}>
                    {x.subcategoria}
                    {x.medida ? ` • ${x.medida}` : ''}
                    {x.ubicacion ? ` • ${x.ubicacion}` : ''}
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
