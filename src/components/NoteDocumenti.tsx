'use client'

import { fmtDateTime } from '@/lib/format'
import { aggiungiFile, aggiungiNota, eliminaFile, eliminaNota } from './client-api'

export interface NotaView {
  Id: number
  Contenuto_Nota: string | null
  Data_Nota: string | Date
  Operatore_Nome: string | null
}
export interface DocumentoView {
  Id: number
  Nome_File: string | null
  DataCreazioneFile: string | Date
  Operatore_Nome: string | null
}

export function ListaNote({ note, onChange, canDelete = true }: { note: NotaView[]; onChange?: () => void; canDelete?: boolean }) {
  if (note.length === 0) return <div className="text-muted">Nessuna nota.</div>
  return (
    <>
      {note.map((n) => (
        <div className="card mb-2 nota-card" key={n.Id}>
          <div className="card-body d-flex justify-content-between gap-2">
            <div style={{ whiteSpace: 'pre-wrap' }}>{n.Contenuto_Nota}</div>
            {canDelete && (
              <button className="btn btn-link text-danger p-0" title="Elimina nota" onClick={async () => (await eliminaNota(n.Id)) && onChange?.()}>
                <i className="fa-solid fa-xmark fa-xl" />
              </button>
            )}
          </div>
          <div className="card-footer">
            {fmtDateTime(n.Data_Nota)} - {n.Operatore_Nome}
          </div>
        </div>
      ))}
    </>
  )
}

export function ListaDocumenti({ documenti, onChange, canDelete = true }: { documenti: DocumentoView[]; onChange?: () => void; canDelete?: boolean }) {
  if (documenti.length === 0) return <div className="text-muted">Nessun documento.</div>
  return (
    <>
      {documenti.map((d) => (
        <div className="card mb-2 nota-card" key={d.Id}>
          <div className="card-body d-flex justify-content-between gap-2">
            <a href={`/api/documenti/${d.Id}`}>
              <i className="fa-solid fa-paperclip me-1" />
              {d.Nome_File}
            </a>
            {canDelete && (
              <button className="btn btn-link text-danger p-0" title="Elimina file" onClick={async () => (await eliminaFile(d.Id)) && onChange?.()}>
                <i className="fa-solid fa-xmark fa-xl" />
              </button>
            )}
          </div>
          <div className="card-footer">
            {fmtDateTime(d.DataCreazioneFile)} - {d.Operatore_Nome}
          </div>
        </div>
      ))}
    </>
  )
}

export function BottoniNoteFile({ id, type, onChange }: { id: number; type: number; onChange?: () => void }) {
  return (
    <div className="d-flex justify-content-center gap-2 my-2">
      <button type="button" className="btn btn-grad px-3" onClick={async () => (await aggiungiNota(id, type)) && onChange?.()}>
        Inserisci note <i className="fa-solid fa-note-sticky ms-1" />
      </button>
      <button type="button" className="btn btn-grad px-3" onClick={async () => (await aggiungiFile(id, type)) && onChange?.()}>
        Inserisci documenti <i className="fa-solid fa-file-arrow-up ms-1" />
      </button>
    </div>
  )
}

/** Pulsanti tabella (nota / file) come nelle vecchie dashboard. */
export function AzioniNoteFile({ id, type, onChange }: { id: number; type: number; onChange?: () => void }) {
  return (
    <>
      <button type="button" className="btn-icon" title="Aggiungi nota" onClick={async () => (await aggiungiNota(id, type)) && onChange?.()}>
        <i className="fa-solid fa-note-sticky" />
      </button>{' '}
      <button type="button" className="btn-icon" title="Carica file" onClick={async () => (await aggiungiFile(id, type)) && onChange?.()}>
        <i className="fa-solid fa-file-arrow-up" />
      </button>
    </>
  )
}
