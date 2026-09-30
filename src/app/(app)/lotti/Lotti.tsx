'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import DataTable from '@/components/DataTable'
import Modal from '@/components/Modal'
import { api, conferma, notify } from '@/components/client-api'
import { AzioniNoteFile, ListaDocumenti, ListaNote, type DocumentoView, type NotaView } from '@/components/NoteDocumenti'
import { fmtDateTime } from '@/lib/format'
import { StatoArticoloLottoLabel, StatoLottoLabel, TipoElemento } from '@/lib/enums'

export interface LottoRow {
  IdLotto: number
  NomeLotto: string | null
  DescrizioneLotto: string | null
  StatoLotto: number
  CodiceADLACL: string | null
  Fornitore: string | null
  TipologiaLotto: string | null
  UltimaModifica_Data: Date | string | null
  NumArticoli: number
}

interface ArticoloLotto {
  IdLottoArticolo: number
  NomeArticolo: string | null
  QuantitaArticolo: string | null
  StatoArticoloLotto: number
  NoteArticolo: string | null
}

interface Dettaglio {
  lotto: LottoRow & { UltimaModifica_Operatore: string | null }
  articoli: ArticoloLotto[]
  note: NotaView[]
  documenti: DocumentoView[]
}

export function BadgeStatoLotto({ stato }: { stato: number }) {
  const cls: Record<number, string> = { 0: 'bg-primary', 1: 'bg-info text-dark', 2: 'bg-success', 3: 'bg-danger' }
  return <span className={`badge ${cls[stato] ?? 'bg-secondary'}`}>{StatoLottoLabel[stato] ?? stato}</span>
}

export default function Lotti({ rows }: { rows: LottoRow[] }) {
  const router = useRouter()
  const [edit, setEdit] = useState<Dettaglio | null>(null)
  const [det, setDet] = useState<Dettaglio | null>(null)
  const [nuovo, setNuovo] = useState<{ NomeLotto: string; DescrizioneLotto: string; CodiceADLACL: string; Fornitore: string } | null>(null)
  const [tab, setTab] = useState<'anag' | 'art'>('anag')
  const [tabDet, setTabDet] = useState<'note' | 'doc'>('note')
  const [busy, setBusy] = useState(false)

  async function carica(id: number) {
    const r = await api<Dettaglio>(`/api/lotti/${id}`)
    if (!r.ok) {
      notify(false, r.message)
      return null
    }
    return r as Dettaglio
  }
  async function salvaEdit() {
    if (!edit) return
    setBusy(true)
    const l = edit.lotto
    const r = await api(`/api/lotti/${l.IdLotto}`, {
      method: 'PUT',
      body: { NomeLotto: l.NomeLotto, DescrizioneLotto: l.DescrizioneLotto, Fornitore: l.Fornitore, CodiceADLACL: l.CodiceADLACL, StatoLotto: l.StatoLotto, Articoli: edit.articoli },
    })
    setBusy(false)
    notify(r.ok, r.message)
    if (r.ok) {
      setEdit(null)
      router.refresh()
    }
  }
  async function salvaNuovo() {
    if (!nuovo) return
    setBusy(true)
    const r = await api('/api/lotti', { body: nuovo })
    setBusy(false)
    notify(r.ok, r.message)
    if (r.ok) {
      setNuovo(null)
      router.refresh()
    }
  }
  async function elimina(l: LottoRow) {
    if (!(await conferma(`Eliminare il lotto "${l.NomeLotto}"?`, 'Verranno eliminati anche gli articoli del lotto.', 'Sì, elimina'))) return
    const r = await api(`/api/lotti/${l.IdLotto}`, { method: 'DELETE' })
    notify(r.ok, r.message)
    if (r.ok) router.refresh()
  }
  const setL = (k: 'NomeLotto' | 'DescrizioneLotto' | 'Fornitore' | 'CodiceADLACL' | 'StatoLotto') => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setEdit((d) => (d ? { ...d, lotto: { ...d.lotto, [k]: k === 'StatoLotto' ? Number(e.target.value) : e.target.value } } : d))
  const setA = (i: number, k: keyof ArticoloLotto, v: string) =>
    setEdit((d) => (d ? { ...d, articoli: d.articoli.map((a, j) => (j === i ? { ...a, [k]: k === 'StatoArticoloLotto' ? Number(v) : v } : a)) } : d))

  return (
    <>
      <DataTable
        rows={rows}
        rowKey={(r) => r.IdLotto}
        searchPlaceholder="Cerca Lotti"
        toolbar={
          <div className="d-flex align-items-center gap-3">
            <h2 className="page-title m-0">Dashboard Lotti</h2>
            <button className="btn btn-grad px-4" onClick={() => setNuovo({ NomeLotto: '', DescrizioneLotto: '', CodiceADLACL: '', Fornitore: '' })}>
              Crea Lotto
            </button>
          </div>
        }
        columns={[
          { key: 'stato', header: 'Stato Lotto', value: (r) => r.StatoLotto, render: (r) => <BadgeStatoLotto stato={r.StatoLotto} /> },
          { key: 'nome', header: 'Nome Lotto', value: (r) => r.NomeLotto, render: (r) => <b>{r.NomeLotto}</b> },
          { key: 'descr', header: 'Descrizione Lotto', value: (r) => r.DescrizioneLotto },
          { key: 'adl', header: 'ADL/ACL', value: (r) => r.CodiceADLACL },
          { key: 'n', header: 'Articoli', value: (r) => r.NumArticoli },
          { key: 'data', header: 'Ultima Modifica', value: (r) => fmtDateTime(r.UltimaModifica_Data) },
          {
            key: 'az',
            header: 'Azioni',
            className: 'dt-actions',
            render: (r) => (
              <>
                <button className="btn-icon" title="Modifica" onClick={async () => { const d = await carica(r.IdLotto); if (d) { setTab('anag'); setEdit(d) } }}>
                  <i className="fa-solid fa-pen-to-square" />
                </button>{' '}
                <button className="btn-icon" title="Dettagli" onClick={async () => { const d = await carica(r.IdLotto); if (d) { setTabDet('note'); setDet(d) } }}>
                  <i className="fa-solid fa-magnifying-glass" />
                </button>{' '}
                <AzioniNoteFile id={r.IdLotto} type={TipoElemento.Lotto} />{' '}
                <a className="btn-icon" title="Scarica Excel lotto" href={`/api/lotti/${r.IdLotto}/excel`}>
                  <i className="fa-solid fa-file-arrow-down" />
                </a>{' '}
                <button className="btn-icon danger" title="Elimina" onClick={() => elimina(r)}>
                  <i className="fa-solid fa-trash" />
                </button>
              </>
            ),
          },
        ]}
      />

      <Modal
        title="Modifica Lotto"
        open={edit !== null}
        onClose={() => setEdit(null)}
        footer={
          <button className="btn btn-grad px-4" disabled={busy} onClick={salvaEdit}>
            Salva Modifiche
          </button>
        }
      >
        {edit && (
          <>
            <ul className="nav nav-pills mb-3">
              <li className="nav-item">
                <button className={`nav-link ${tab === 'anag' ? 'active' : ''}`} onClick={() => setTab('anag')}>Anagrafica</button>
              </li>
              <li className="nav-item">
                <button className={`nav-link ${tab === 'art' ? 'active' : ''}`} onClick={() => setTab('art')}>
                  Articoli <span className="badge rounded-pill bg-danger">{edit.articoli.length}</span>
                </button>
              </li>
            </ul>
            {tab === 'anag' && (
              <>
                <div className="form-row">
                  <div>
                    <label>Nome Lotto</label>
                    <input className="form-control" value={edit.lotto.NomeLotto ?? ''} onChange={setL('NomeLotto')} />
                  </div>
                  <div>
                    <label>Fornitore</label>
                    <input className="form-control" value={edit.lotto.Fornitore ?? ''} onChange={setL('Fornitore')} />
                  </div>
                </div>
                <div className="form-row">
                  <div>
                    <label>ADL/ACL</label>
                    <input className="form-control" value={edit.lotto.CodiceADLACL ?? ''} onChange={setL('CodiceADLACL')} />
                  </div>
                  <div>
                    <label>Stato Lotto</label>
                    <select className="form-select" value={edit.lotto.StatoLotto} onChange={setL('StatoLotto')}>
                      {Object.entries(StatoLottoLabel).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <label className="small text-muted">Descrizione Lotto</label>
                <textarea className="form-control" rows={5} value={edit.lotto.DescrizioneLotto ?? ''} onChange={setL('DescrizioneLotto')} />
              </>
            )}
            {tab === 'art' && (
              <>
                {edit.articoli.length === 0 && <div className="text-muted">Nessun articolo nel lotto.</div>}
                {edit.articoli.length > 0 && (
                  <div className="row small text-muted mb-1">
                    <div className="col-3">Cod. Art.</div>
                    <div className="col-3">Q.tà</div>
                    <div className="col-3">Stato</div>
                    <div className="col-3">Note</div>
                  </div>
                )}
                {edit.articoli.map((a, i) => (
                  <div className="row mb-1 g-1" key={a.IdLottoArticolo}>
                    <div className="col-3">
                      <input className="form-control" value={a.NomeArticolo ?? ''} readOnly />
                    </div>
                    <div className="col-3">
                      <input className="form-control" value={a.QuantitaArticolo ?? ''} onChange={(e) => setA(i, 'QuantitaArticolo', e.target.value)} />
                    </div>
                    <div className="col-3">
                      <select className="form-select" value={a.StatoArticoloLotto} onChange={(e) => setA(i, 'StatoArticoloLotto', e.target.value)}>
                        {Object.entries(StatoArticoloLottoLabel).map(([v, l]) => (
                          <option key={v} value={v}>{l}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-3">
                      <input className="form-control" value={a.NoteArticolo ?? ''} onChange={(e) => setA(i, 'NoteArticolo', e.target.value)} />
                    </div>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </Modal>

      <Modal title="Dettagli Lotto" open={det !== null} onClose={() => setDet(null)}>
        {det && (
          <>
            <dl className="row">
              <dt className="col-4">Nome Lotto</dt>
              <dd className="col-8">{det.lotto.NomeLotto}</dd>
              <dt className="col-4">Stato</dt>
              <dd className="col-8"><BadgeStatoLotto stato={det.lotto.StatoLotto} /></dd>
              <dt className="col-4">Descrizione</dt>
              <dd className="col-8">{det.lotto.DescrizioneLotto}</dd>
              <dt className="col-4">Ultima modifica</dt>
              <dd className="col-8">{fmtDateTime(det.lotto.UltimaModifica_Data)} {det.lotto.UltimaModifica_Operatore}</dd>
            </dl>
            <ul className="nav nav-pills mb-3">
              <li className="nav-item">
                <button className={`nav-link ${tabDet === 'note' ? 'active' : ''}`} onClick={() => setTabDet('note')}>Note ({det.note.length})</button>
              </li>
              <li className="nav-item">
                <button className={`nav-link ${tabDet === 'doc' ? 'active' : ''}`} onClick={() => setTabDet('doc')}>Documenti ({det.documenti.length})</button>
              </li>
            </ul>
            {tabDet === 'note' && <ListaNote note={det.note} onChange={async () => setDet(await carica(det.lotto.IdLotto))} />}
            {tabDet === 'doc' && <ListaDocumenti documenti={det.documenti} onChange={async () => setDet(await carica(det.lotto.IdLotto))} />}
          </>
        )}
      </Modal>

      <Modal
        title="Crea Lotto"
        open={nuovo !== null}
        size="md"
        onClose={() => setNuovo(null)}
        footer={
          <button className="btn btn-grad px-4" disabled={busy} onClick={salvaNuovo}>
            Crea
          </button>
        }
      >
        {nuovo && (
          <>
            {(
              [
                ['NomeLotto', 'Nome Lotto'],
                ['DescrizioneLotto', 'Descrizione Lotto'],
                ['CodiceADLACL', 'ADL/ACL'],
                ['Fornitore', 'Fornitore'],
              ] as const
            ).map(([k, l]) => (
              <div key={k} className="mb-2">
                <label className="small text-muted">{l}</label>
                <input className="form-control" value={nuovo[k]} onChange={(e) => setNuovo({ ...nuovo, [k]: e.target.value })} />
              </div>
            ))}
          </>
        )}
      </Modal>
    </>
  )
}
