'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Modal from './Modal'
import { api, notify } from './client-api'
import { BottoniNoteFile, ListaDocumenti, ListaNote, type DocumentoView, type NotaView } from './NoteDocumenti'
import { fmtDateTime, fmtNum } from '@/lib/format'
import { TipoElemento, TipoStatoAttivita } from '@/lib/enums'

export interface AttivitaView {
  IdAttività: number
  NomeAttività: string | null
  CodiceArticolo: string | null
  QuantitàdaProdurre: number
  QuantitàProdotta: number
  QuantitàScartata: number
  StatoAttività: number
  UltimaModifica_Data: string | Date | null
}

interface Dettaglio {
  attivita: AttivitaView & { idMacchinaMagazzino: number }
  note: NotaView[]
  documenti: DocumentoView[]
}

/** Elenco attivita' di una macchina (vecchia vista Brighetti_Operatori/AvvioMacchina). */
export default function AttivitaMacchina({
  attivita,
  countNote,
  countDocumenti,
  azionabile,
  autoRefresh = false,
}: {
  attivita: AttivitaView[]
  countNote: number
  countDocumenti: number
  azionabile: boolean
  autoRefresh?: boolean
}) {
  const router = useRouter()
  const [aperta, setAperta] = useState<number | null>(null)
  const [det, setDet] = useState<Dettaglio | null>(null)
  const [tab, setTab] = useState<'dett' | 'note' | 'doc'>('dett')
  const [stato, setStato] = useState('1')
  const [busy, setBusy] = useState(false)

  // Come il vecchio "cache_clear": aggiorna la lista ogni 5 secondi se nessuna finestra e' aperta.
  useEffect(() => {
    if (!autoRefresh || aperta !== null) return
    const t = setInterval(() => router.refresh(), 5000)
    return () => clearInterval(t)
  }, [autoRefresh, aperta, router])

  const carica = useCallback(async (id: number) => {
    const r = await api<Dettaglio & { ok: boolean; message?: string }>(`/api/attivita/${id}`)
    if (!r.ok) {
      notify(false, r.message)
      setAperta(null)
      return
    }
    setDet(r)
  }, [])

  const apri = (id: number) => {
    setAperta(id)
    setDet(null)
    setTab('dett')
    setStato('1')
    void carica(id)
  }

  const avvia = async () => {
    if (aperta === null) return
    setBusy(true)
    const r = await api<{ ok: boolean; message?: string; pathRedirect?: string }>(`/api/attivita/${aperta}/apri`, {
      body: { StatoAttivita: Number(stato) },
    })
    setBusy(false)
    notify(r.ok, r.message)
    if (r.ok) {
      setAperta(null)
      if (r.pathRedirect) router.push(r.pathRedirect)
      else router.refresh()
    }
  }

  if (attivita.length === 0 && azionabile) {
    return (
      <div className="mt-5 empty-state">
        <i className="fa-solid fa-face-laugh fa-6x fa-gradient" />
        <h3 className="mt-3 fw-bold text-dark">Nessuna attività!</h3>
        <p>Pare che al momento tu non abbia nessuna attività assegnata. Riprova più tardi!</p>
      </div>
    )
  }
  if (attivita.length === 0) return <div className="text-muted">Nessuna attività in attesa su questa macchina.</div>

  const a = det?.attivita
  return (
    <>
      {attivita.map((x) => {
        const card = (
          <div className="cardArticoloAttività">
            <div className="card-body">
              <div className="row w-100 align-items-center">
                <div className="col-12 col-md-4 text-start">
                  <div>
                    Attività: <b>{x.NomeAttività}</b>
                    {x.StatoAttività === TipoStatoAttivita.StandBy && <p className="m-0 text-warning">(Attività precedentemente aperta)</p>}
                  </div>
                  <div>Articolo: {x.CodiceArticolo}</div>
                  <div className="text-muted small">Data inserimento: {fmtDateTime(x.UltimaModifica_Data)}</div>
                </div>
                <div className="col-4 col-md-2 centerDiv">
                  <h1 className="fa-gradient">{fmtNum(x.QuantitàdaProdurre)}</h1>
                  da produrre
                </div>
                <div className="col-4 col-md-2 centerDiv">
                  <i className="fa-solid fa-paperclip fa-3x fa-gradient" />
                  {countDocumenti} allegati
                </div>
                <div className="col-4 col-md-2 centerDiv">
                  <i className="fa-regular fa-note-sticky fa-3x fa-gradient" />
                  {countNote} note
                </div>
                {azionabile && (
                  <div className="col-md-2 RightDiv d-none d-md-flex">
                    <i className="fa-solid fa-arrow-right fa-3x fa-gradient" />
                  </div>
                )}
              </div>
            </div>
          </div>
        )
        return (
          <div className="row" key={x.IdAttività}>
            <div className="col-12">
              {azionabile ? (
                <button type="button" className="BtnApriAttivitàModal" onClick={() => apri(x.IdAttività)}>
                  {card}
                </button>
              ) : (
                card
              )}
            </div>
          </div>
        )
      })}

      <Modal
        title="Apri Attività"
        open={aperta !== null}
        onClose={() => setAperta(null)}
        footer={
          tab === 'dett' && (
            <button className="btn btn-grad px-4" disabled={!a || busy} onClick={avvia}>
              Avvia Attività
            </button>
          )
        }
      >
        {!det || !a ? (
          <div className="text-center py-4">
            <i className="fa fa-circle-notch fa-spin fa-2x" />
          </div>
        ) : (
          <>
            <ul className="nav nav-pills mb-3">
              <li className="nav-item">
                <button className={`nav-link ${tab === 'dett' ? 'active' : ''}`} onClick={() => setTab('dett')}>Dettagli</button>
              </li>
              <li className="nav-item">
                <button className={`nav-link ${tab === 'note' ? 'active' : ''}`} onClick={() => setTab('note')}>
                  Note <span className="badge rounded-pill bg-danger">{det.note.length}</span>
                </button>
              </li>
              <li className="nav-item">
                <button className={`nav-link ${tab === 'doc' ? 'active' : ''}`} onClick={() => setTab('doc')}>
                  Documenti <span className="badge rounded-pill bg-danger">{det.documenti.length}</span>
                </button>
              </li>
            </ul>
            {tab === 'dett' && (
              <>
                <p className="text-center">
                  Vuoi iniziare la seguente attività &quot;<b>{a.NomeAttività}</b>&quot;?
                  <br />
                  Clicca su &quot;Avvia Attività&quot; per attivare la procedura di inizio attività.
                </p>
                <p className="text-center">
                  Articolo da lavorare: <b>{a.CodiceArticolo}</b>
                  <br />
                  Quantità da produrre: <b>{fmtNum(a.QuantitàdaProdurre)}</b>
                </p>
                {a.StatoAttività === TipoStatoAttivita.StandBy && (
                  <p className="text-center">
                    Quantità prodotta precedentemente: <b>{fmtNum(a.QuantitàProdotta)}</b>
                    <br />
                    Quantità scartata precedentemente: <b>{fmtNum(a.QuantitàScartata)}</b>
                  </p>
                )}
                <label className="form-label">Attività</label>
                <select className="form-select" value={stato} onChange={(e) => setStato(e.target.value)}>
                  <option value="0">Attrezzaggio</option>
                  <option value="1">Lavorazione</option>
                </select>
                <BottoniNoteFile id={a.idMacchinaMagazzino} type={TipoElemento.Macchina} onChange={() => carica(a.IdAttività)} />
              </>
            )}
            {tab === 'note' && <ListaNote note={det.note} onChange={() => carica(a.IdAttività)} />}
            {tab === 'doc' && <ListaDocumenti documenti={det.documenti} onChange={() => carica(a.IdAttività)} />}
          </>
        )}
      </Modal>
    </>
  )
}
