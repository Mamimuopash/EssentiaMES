'use client'

import { useMemo, useState } from 'react'

export interface Column<T> {
  key: string
  header: React.ReactNode
  /** Valore usato per ricerca e ordinamento. */
  value?: (row: T) => string | number | null | undefined
  render?: (row: T) => React.ReactNode
  sortable?: boolean
  className?: string
}

/**
 * Tabella con ricerca, ordinamento e paginazione lato client
 * (sostituisce jQuery DataTables per gli elenchi piccoli/medi).
 */
export default function DataTable<T>({
  rows,
  columns,
  rowKey,
  pageSize = 10,
  searchPlaceholder = 'Cerca...',
  empty = 'Nessun dato disponibile',
  toolbar,
  searchable = true,
}: {
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string | number
  pageSize?: number
  searchPlaceholder?: string
  empty?: string
  toolbar?: React.ReactNode
  searchable?: boolean
}) {
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null)
  const [page, setPage] = useState(0)

  const filtered = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
    let out = rows
    if (terms.length) {
      out = rows.filter((r) => {
        const text = columns
          .map((c) => (c.value ? c.value(r) : ''))
          .join(' ')
          .toLowerCase()
        return terms.every((t) => text.includes(t))
      })
    }
    if (sort) {
      const col = columns.find((c) => c.key === sort.key)
      if (col?.value) {
        const v = col.value
        out = [...out].sort((a, b) => {
          const x = v(a)
          const y = v(b)
          if (x === y) return 0
          if (x === null || x === undefined) return -sort.dir
          if (y === null || y === undefined) return sort.dir
          if (typeof x === 'number' && typeof y === 'number') return (x - y) * sort.dir
          return String(x).localeCompare(String(y), 'it', { numeric: true }) * sort.dir
        })
      }
    }
    return out
  }, [rows, columns, q, sort])

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const cur = Math.min(page, pages - 1)
  const slice = filtered.slice(cur * pageSize, (cur + 1) * pageSize)

  return (
    <div>
      <div className="toolbar">
        {searchable ? (
          <input
            className="form-control search"
            placeholder={searchPlaceholder}
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setPage(0)
            }}
          />
        ) : (
          <span />
        )}
        {toolbar}
      </div>
      <div className="dt-wrap">
        <table className="table align-middle">
          <thead>
            <tr>
              {columns.map((c) => {
                const canSort = c.sortable !== false && !!c.value
                const active = sort?.key === c.key
                return (
                  <th
                    key={c.key}
                    className={`${canSort ? 'sortable' : ''} ${c.className ?? ''}`}
                    onClick={() => canSort && setSort(active ? { key: c.key, dir: sort!.dir === 1 ? -1 : 1 } : { key: c.key, dir: 1 })}
                  >
                    {c.header}
                    {canSort && <i className={`fa-solid sort ${active ? (sort!.dir === 1 ? 'fa-sort-up' : 'fa-sort-down') : 'fa-sort'}`} />}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {slice.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="text-center text-muted py-4">
                  {empty}
                </td>
              </tr>
            )}
            {slice.map((r) => (
              <tr key={rowKey(r)}>
                {columns.map((c) => (
                  <td key={c.key} className={c.className}>
                    {c.render ? c.render(r) : (c.value?.(r) ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="dt-footer">
        <span>
          {filtered.length === 0
            ? 'Nessun elemento'
            : `Visualizzazione da ${cur * pageSize + 1} a ${Math.min((cur + 1) * pageSize, filtered.length)} di ${filtered.length}`}
          {filtered.length !== rows.length && ` (filtrati su ${rows.length} totali)`}
        </span>
        {pages > 1 && (
          <div className="btn-group">
            <button className="btn btn-sm btn-outline-secondary" disabled={cur === 0} onClick={() => setPage(cur - 1)}>
              Precedente
            </button>
            <span className="btn btn-sm btn-outline-secondary disabled">
              {cur + 1} / {pages}
            </span>
            <button className="btn btn-sm btn-outline-secondary" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>
              Prossima
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
