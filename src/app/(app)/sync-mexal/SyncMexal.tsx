'use client'

import { useState } from 'react'
import { api, notify } from '@/components/client-api'

export default function SyncMexal() {
  const [file, setFile] = useState<File | null>(null)
  const [esito, setEsito] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <>
      {esito && <div className="alert alert-info">{esito}</div>}
      <div className="card mb-3">
        <div className="card-header">
          <strong>Esecuzione dal file configurato</strong>
        </div>
        <div className="card-body">
          <p className="text-muted">Legge il file CSV indicato nel pannello Automazioni (percorso raggiungibile dal server EssentiaMES) e aggiorna le giacenze.</p>
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              const r = await api('/api/sync-mexal/esegui', { method: 'POST' })
              setBusy(false)
              setEsito(r.message ?? null)
              notify(r.ok, r.message)
            }}
          >
            <i className="fa-solid fa-rotate" /> Sincronizza ora
          </button>
        </div>
      </div>
      <div className="card">
        <div className="card-header">
          <strong>Import manuale di un file CSV</strong>
        </div>
        <div className="card-body">
          <p className="text-muted">
            Carica un file esportato da Mexal. Colonne riconosciute (dall&apos;intestazione): <code>Articolo</code>, <code>Magazzino</code>, <code>Giacenza/Quantità</code>.
          </p>
          <div className="row g-2">
            <div className="col-md-8">
              <input type="file" accept=".csv,.txt" className="form-control" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
            <div className="col-md-4">
              <button
                className="btn btn-outline-primary"
                disabled={!file || busy}
                onClick={async () => {
                  if (!file) return
                  setBusy(true)
                  const fd = new FormData()
                  fd.append('file', file)
                  const r = await api('/api/sync-mexal/importa', { form: fd })
                  setBusy(false)
                  setEsito(r.message ?? null)
                  notify(r.ok, r.message)
                }}
              >
                Importa e sincronizza
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
