'use client'

import { useEffect, useState } from 'react'
import { api } from './client-api'

export interface ServerColumn<T> {
  key: string
  header: React.ReactNode
  /** Chiave di ordinamento lato server (se assente la colonna non e' ordinabile). */
  sortKey?: string
  render: (row: T) => React.ReactNode
  className?: string
}

/**
 * Tabella con paginazione, ricerca e ordinamento LATO SERVER (per elenchi
 * grandi come articoli e giacenze; sostituisce DataTables "serverSide").
 */
export default function ServerTable<T>({
  endpoint,
  columns,
  rowKey,
  params,
  refreshKey = 0,
  defaultSort,
  searchPlaceholder = 'Cerca...',
  toolbar,
  pageSize = 25,
}: {
  endpoint: string
  columns: ServerColumn<T>[]
  rowKey: (r: T) => string | number
  params?: Record<string, string | number | undefined>
  refreshKey?: number
  defaultSort?: { key: string; dir: 'asc' | 'desc' }
  searchPlaceholder?: string
  toolbar?: React.ReactNode
  pageSize?: number
}) {
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [sort, setSort] = useState(defaultSort ?? null)
  const paramsKey = JSON.stringify(params ?? {})

  // Chiave della richiesta corrente: finche' il risultato non corrisponde, la tabella e' "in caricamento".
  const qs = new URLSearchParams({ start: String(page * pageSize), length: String(pageSize), search: debounced })
  if (sort) {
    qs.set('order', sort.key)
    qs.set('dir', sort.dir)
  }
  for (const [k, v] of Object.entries(JSON.parse(paramsKey) as Record<string, string>)) if (v !== undefined && v !== '') qs.set(k, String(v))
  const url = `${endpoint}?${qs}`
  const reqKey = `${url}#${refreshKey}`

  const [result, setResult] = useState<{ key: string; rows: T[]; total: number; filtered: number; error: string | null }>({
    key: '',
    rows: [],
    total: 0,
    filtered: 0,
    error: null,
  })
  const loading = result.key !== reqKey
  const rows = result.rows
  const tot = { total: result.total, filtered: result.filtered }
  const error = result.error

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search)
      setPage(0)
    }, 350)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    let annullato = false
    void api<{ data: T[]; recordsTotal: number; recordsFiltered: number }>(url).then((r) => {
      if (annullato) return
      if (!r.ok) setResult((p) => ({ ...p, key: reqKey, error: r.message ?? 'Errore di caricamento' }))
      else setResult({ key: reqKey, rows: r.data, total: r.recordsTotal, filtered: r.recordsFiltered, error: null })
    })
    return () => {
      annullato = true
    }
  }, [url, reqKey])

  const pages = Math.max(1, Math.ceil(tot.filtered / pageSize))
  return (
    <div>
      <div className="toolbar">
        <input className="form-control search" placeholder={searchPlaceholder} value={search} onChange={(e) => setSearch(e.target.value)} />
        {toolbar}
      </div>
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="dt-wrap position-relative">
        {loading && (
          <div className="position-absolute top-50 start-50 translate-middle">
            <i className="fa fa-circle-notch fa-spin fa-2x" style={{ color: 'purple' }} />
          </div>
        )}
        <table className="table align-middle" style={{ opacity: loading ? 0.5 : 1 }}>
          <thead>
            <tr>
              {columns.map((c) => {
                const active = sort?.key === c.sortKey
                return (
                  <th
                    key={c.key}
                    className={`${c.sortKey ? 'sortable' : ''} ${c.className ?? ''}`}
                    onClick={() => {
                      if (!c.sortKey) return
                      setSort(active ? { key: c.sortKey, dir: sort!.dir === 'asc' ? 'desc' : 'asc' } : { key: c.sortKey, dir: 'asc' })
                      setPage(0)
                    }}
                  >
                    {c.header}
                    {c.sortKey && <i className={`fa-solid sort ${active ? (sort!.dir === 'asc' ? 'fa-sort-up' : 'fa-sort-down') : 'fa-sort'}`} />}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={columns.length} className="text-center text-muted py-4">
                  Nessun dato disponibile
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={rowKey(r)}>
                {columns.map((c) => (
                  <td key={c.key} className={c.className}>
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="dt-footer">
        <span>
          {tot.filtered === 0
            ? 'Nessun elemento'
            : `Visualizzazione da ${page * pageSize + 1} a ${Math.min((page + 1) * pageSize, tot.filtered)} di ${tot.filtered}`}
          {tot.filtered !== tot.total && ` (filtrati su ${tot.total} totali)`}
        </span>
        {pages > 1 && (
          <div className="btn-group">
            <button className="btn btn-sm btn-outline-secondary" disabled={page === 0} onClick={() => setPage(0)}>
              Prima
            </button>
            <button className="btn btn-sm btn-outline-secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>
              Precedente
            </button>
            <span className="btn btn-sm btn-outline-secondary disabled">
              {page + 1} / {pages}
            </span>
            <button className="btn btn-sm btn-outline-secondary" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>
              Prossima
            </button>
            <button className="btn btn-sm btn-outline-secondary" disabled={page >= pages - 1} onClick={() => setPage(pages - 1)}>
              Ultima
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
