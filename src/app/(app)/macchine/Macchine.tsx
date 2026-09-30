'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import DataTable from '@/components/DataTable'
import Modal from '@/components/Modal'
import { api, conferma, notify } from '@/components/client-api'
import { useOpzioni } from '@/components/useOpzioni'
import { AzioniNoteFile, ListaDocumenti, ListaNote, type DocumentoView, type NotaView } from '@/components/NoteDocumenti'
import { fmtDateTime } from '@/lib/format'
import { TipoElemento, TipoMacchinaLabel } from '@/lib/enums'

export interface MacchinaRow {
  IdMacchina: number
  NomeMacchina: string | null
  DescrizioneMacchina: string | null
  IdReparto: number
  NomeReparto: string | null
  IdUtente: string | null
  NomeUtente: string | null
  TipologiaMacchina: number
  CollegamentoMacchina: string | null
  UltimaModifica_Data: Date | string | null
}

const vuoto = { NomeMacchina: '', DescrizioneMacchina: '', IdUtente: '0', IdReparto: '0', TipologiaMacchina: '0', CollegamentoMacchina: '' }

export default function Macchine({ rows }: { rows: MacchinaRow[] }) {
  const router = useRouter()
  const [form, setForm] = useState<{ id: number | null; v: typeof vuoto } | null>(null)
  const [det, setDet] = useState<{ macchina: MacchinaRow & { UltimaModifica_Operatore?: string }; note: NotaView[]; documenti: DocumentoView[] } | null>(null)
  const [tab, setTab] = useState<'dett' | 'note' | 'doc'>('dett')
  const [busy, setBusy] = useState(false)
  const operatori = useOpzioni('operatori', form !== null)
  const reparti = useOpzioni('reparti', form !== null)

  async function salva() {
    if (!form) return
    setBusy(true)
    const r = form.id ? await api(`/api/macchine/${form.id}`, { method: 'PUT', body: form.v }) : await api('/api/macchine', { body: form.v })
    setBusy(false)
    notify(r.ok, r.message)
    if (r.ok) {
      setForm(null)
      router.refresh()
    }
  }
  async function dettaglio(id: number) {
    const r = await api<{ macchina: MacchinaRow; note: NotaView[]; documenti: DocumentoView[] }>(`/api/macchine/${id}`)
    if (!r.ok) return notify(false, r.message)
    setDet(r)
  }
  async function elimina(m: MacchinaRow) {
    if (!(await conferma(`Eliminare la macchina "${m.NomeMacchina}"?`, 'Operazione non reversibile.', 'Sì, elimina'))) return
    const r = await api(`/api/macchine/${m.IdMacchina}`, { method: 'DELETE' })
    notify(r.ok, r.message)
    if (r.ok) router.refresh()
  }
  const set = (k: keyof typeof vuoto) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => (f ? { ...f, v: { ...f.v, [k]: e.target.value } } : f))

  return (
    <>
      <DataTable
        rows={rows}
        rowKey={(r) => r.IdMacchina}
        searchPlaceholder="Cerca Macchine"
        toolbar={
          <div className="d-flex align-items-center gap-3">
            <h2 className="page-title m-0">Dashboard Macchine</h2>
            <button className="btn btn-grad px-4" onClick={() => setForm({ id: null, v: { ...vuoto } })}>
              Crea Macchina
            </button>
          </div>
        }
        columns={[
          { key: 'nome', header: 'Nome Macchina', value: (r) => r.NomeMacchina, render: (r) => <Link href={`/macchine/${r.IdMacchina}`}><b>{r.NomeMacchina}</b></Link> },
          { key: 'descr', header: 'Descrizione Macchina', value: (r) => r.DescrizioneMacchina },
          { key: 'rep', header: 'Reparto', value: (r) => r.NomeReparto ?? '-' },
          { key: 'ut', header: 'Utente', value: (r) => r.NomeUtente ?? '' },
          { key: 'tipo', header: 'Collegamento', value: (r) => TipoMacchinaLabel[r.TipologiaMacchina] ?? '' },
          { key: 'data', header: 'Ultima Modifica', value: (r) => fmtDateTime(r.UltimaModifica_Data) },
          {
            key: 'az',
            header: 'Azioni',
            className: 'dt-actions',
            render: (r) => (
              <>
                <button
                  className="btn-icon"
                  title="Modifica"
                  onClick={() =>
                    setForm({
                      id: r.IdMacchina,
                      v: {
                        NomeMacchina: r.NomeMacchina ?? '',
                        DescrizioneMacchina: r.DescrizioneMacchina ?? '',
                        IdUtente: r.IdUtente || '0',
                        IdReparto: String(r.IdReparto ?? 0),
                        TipologiaMacchina: String(r.TipologiaMacchina ?? 0),
                        CollegamentoMacchina: r.CollegamentoMacchina ?? '',
                      },
                    })
                  }
                >
                  <i className="fa-solid fa-pen-to-square" />
                </button>{' '}
                <button className="btn-icon" title="Dettagli" onClick={() => { setTab('dett'); void dettaglio(r.IdMacchina) }}>
                  <i className="fa-solid fa-magnifying-glass" />
                </button>{' '}
                <AzioniNoteFile id={r.IdMacchina} type={TipoElemento.Macchina} />{' '}
                <button className="btn-icon danger" title="Elimina" onClick={() => elimina(r)}>
                  <i className="fa-solid fa-trash" />
                </button>
              </>
            ),
          },
        ]}
      />
      <Modal
        title={form?.id ? 'Modifica Macchina' : 'Crea Macchina'}
        open={form !== null}
        onClose={() => setForm(null)}
        footer={
          <button className="btn btn-grad px-4" disabled={busy} onClick={salva}>
            Salva
          </button>
        }
      >
        {form && (
          <>
            <label className="small text-muted">Nome Macchina</label>
            <input className="form-control mb-2" value={form.v.NomeMacchina} onChange={set('NomeMacchina')} />
            <label className="small text-muted">Descrizione Macchina</label>
            <textarea className="form-control mb-2" rows={4} value={form.v.DescrizioneMacchina} onChange={set('DescrizioneMacchina')} />
            <div className="form-row">
              <div>
                <label>Utente (operatore della postazione)</label>
                <select className="form-select" value={form.v.IdUtente} onChange={set('IdUtente')}>
                  <option value="0">Selezionare Voce...</option>
                  {operatori.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Reparto</label>
                <select className="form-select" value={form.v.IdReparto} onChange={set('IdReparto')}>
                  <option value="0">Selezionare Voce...</option>
                  {reparti.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div>
                <label>Tipologia collegamento (Industria 4.0)</label>
                <select className="form-select" value={form.v.TipologiaMacchina} onChange={set('TipologiaMacchina')}>
                  {Object.entries(TipoMacchinaLabel).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Indirizzo / collegamento</label>
                <input className="form-control" value={form.v.CollegamentoMacchina} onChange={set('CollegamentoMacchina')} placeholder="es. http://10.0.0.20:5000" />
              </div>
            </div>
          </>
        )}
      </Modal>
      <Modal title="Dettagli Macchina" open={det !== null} onClose={() => setDet(null)}>
        {det && (
          <>
            <ul className="nav nav-pills mb-3">
              {(
                [
                  ['dett', 'Dettagli'],
                  ['note', `Note (${det.note.length})`],
                  ['doc', `Documenti (${det.documenti.length})`],
                ] as const
              ).map(([k, l]) => (
                <li className="nav-item" key={k}>
                  <button className={`nav-link ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>
                </li>
              ))}
            </ul>
            {tab === 'dett' && (
              <dl className="row">
                <dt className="col-5">Nome Macchina</dt>
                <dd className="col-7">{det.macchina.NomeMacchina}</dd>
                <dt className="col-5">Descrizione</dt>
                <dd className="col-7">{det.macchina.DescrizioneMacchina}</dd>
                <dt className="col-5">Reparto</dt>
                <dd className="col-7">{det.macchina.NomeReparto ?? '-'}</dd>
                <dt className="col-5">Utente</dt>
                <dd className="col-7">{det.macchina.NomeUtente ?? '-'}</dd>
                <dt className="col-5">Collegamento</dt>
                <dd className="col-7">
                  {TipoMacchinaLabel[det.macchina.TipologiaMacchina]} {det.macchina.CollegamentoMacchina}
                </dd>
                <dt className="col-5">Ultima modifica</dt>
                <dd className="col-7">
                  {fmtDateTime(det.macchina.UltimaModifica_Data)} {det.macchina.UltimaModifica_Operatore}
                </dd>
              </dl>
            )}
            {tab === 'note' && <ListaNote note={det.note} onChange={() => dettaglio(det.macchina.IdMacchina)} />}
            {tab === 'doc' && <ListaDocumenti documenti={det.documenti} onChange={() => dettaglio(det.macchina.IdMacchina)} />}
          </>
        )}
      </Modal>
    </>
  )
}
