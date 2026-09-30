'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, conferma, notify } from '@/components/client-api'
import { TipoImpostazione } from '@/lib/enums'
import type { Impostazione } from '@/lib/services/impostazioni'

const attivo = (v: string | null) => (v ?? '').trim().toLowerCase() === 'true'

export default function Automazioni({ gruppi, schedulerAttivo }: { gruppi: { Categoria: string; Impostazioni: Impostazione[] }[]; schedulerAttivo: boolean }) {
  const router = useRouter()
  const [valori, setValori] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {}
    for (const g of gruppi) for (const i of g.Impostazioni) if (i.Tipo !== TipoImpostazione.Booleano) o[String(i.Id)] = i.Valore ?? ''
    return o
  })
  const [toggle, setToggle] = useState<Record<number, boolean>>(() => {
    const o: Record<number, boolean> = {}
    for (const g of gruppi) for (const i of g.Impostazioni) if (i.Tipo === TipoImpostazione.Booleano) o[i.Id] = attivo(i.Valore)
    return o
  })
  const [prefisso, setPrefisso] = useState('')
  const [lotto, setLotto] = useState('0')

  async function cambia(id: number) {
    setToggle((t) => ({ ...t, [id]: !t[id] }))
    const r = await api<{ nuovoStato: boolean }>(`/api/impostazioni/${id}/toggle`, { method: 'POST' })
    if (!r.ok) {
      setToggle((t) => ({ ...t, [id]: !t[id] }))
      notify(false, r.message)
      return
    }
    setToggle((t) => ({ ...t, [id]: r.nuovoStato }))
    notify(true, r.message)
  }

  return (
    <div style={{ marginTop: 24 }}>
      <h2 className="page-title">Automazioni e impostazioni</h2>
      <p className="text-muted">
        Attiva gli automatismi <strong>uno alla volta</strong> con gli interruttori (effetto immediato). I parametri di configurazione si salvano con il pulsante in fondo.
      </p>
      {!schedulerAttivo && (
        <div className="alert alert-warning">
          Lo scheduler interno è disattivato (SCHEDULER_ENABLED=false): i job pianificati partono solo da un cron esterno su /api/cron/&lt;job&gt;.
        </div>
      )}
      {gruppi.map((g) => (
        <div className="card mb-3" key={g.Categoria}>
          <div className="card-header">
            <strong>{g.Categoria}</strong>
          </div>
          <div className="card-body">
            {g.Impostazioni.map((i) => (
              <div className="row py-2" style={{ borderBottom: '1px solid #f0f0f0' }} key={i.Id}>
                <div className="col-md-7">
                  <div>{i.Descrizione}</div>
                  <small className="text-muted">{i.Chiave}</small>
                </div>
                <div className="col-md-5">
                  {i.Tipo === TipoImpostazione.Booleano ? (
                    <div className="form-check form-switch">
                      <input className="form-check-input" type="checkbox" role="switch" id={`imp_${i.Id}`} checked={!!toggle[i.Id]} onChange={() => cambia(i.Id)} />
                      <label className="form-check-label" htmlFor={`imp_${i.Id}`}>
                        {toggle[i.Id] ? 'Attivo' : 'Spento'}
                      </label>
                    </div>
                  ) : (
                    <input
                      className="form-control"
                      type={i.Tipo === TipoImpostazione.Numero ? 'number' : 'text'}
                      step="any"
                      value={valori[String(i.Id)] ?? ''}
                      onChange={(e) => setValori({ ...valori, [String(i.Id)]: e.target.value })}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="my-3">
        <button
          className="btn btn-primary"
          onClick={async () => {
            const r = await api('/api/impostazioni', { method: 'PUT', body: { valori } })
            notify(r.ok, r.message)
            router.refresh()
          }}
        >
          Salva parametri
        </button>
      </div>
      <div className="card mb-3">
        <div className="card-header">
          <strong>Manutenzione dati</strong>
        </div>
        <div className="card-body">
          <h6>Lotto minimo di massa</h6>
          <p className="text-muted">Imposta lo stesso lotto minimo a tutti gli articoli con un certo prefisso codice (es. tutti i G8 a 50).</p>
          <div className="row g-2">
            <div className="col-md-4">
              <input className="form-control" placeholder="Prefisso codice (es. G8)" value={prefisso} onChange={(e) => setPrefisso(e.target.value)} />
            </div>
            <div className="col-md-4">
              <input className="form-control" type="number" placeholder="Lotto minimo" value={lotto} onChange={(e) => setLotto(e.target.value)} />
            </div>
            <div className="col-md-4">
              <button
                className="btn btn-outline-primary"
                onClick={async () => {
                  const r = await api('/api/impostazioni/lotto-minimo', { body: { prefisso, valore: Number(lotto) } })
                  notify(r.ok, r.message)
                }}
              >
                Applica a tutti
              </button>
            </div>
          </div>
          <hr />
          <h6>Cancellazione richieste aperte</h6>
          <p className="text-muted">
            Elimina tutte le richieste materiali ancora aperte/in sospeso (carrelli non inviati). Le richieste già inviate (storico) vengono mantenute.
          </p>
          <button
            className="btn btn-outline-danger"
            onClick={async () => {
              if (!(await conferma('Eliminare TUTTE le richieste aperte?', 'Lo storico delle richieste inviate resta. Operazione non reversibile.', 'Sì, elimina'))) return
              const r = await api('/api/impostazioni/richieste-aperte', { method: 'DELETE' })
              notify(r.ok, r.message)
            }}
          >
            Elimina richieste aperte
          </button>
        </div>
      </div>
    </div>
  )
}
