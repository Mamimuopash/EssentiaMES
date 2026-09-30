'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Modal from '@/components/Modal'
import { api, notify } from '@/components/client-api'
import { fmtNum } from '@/lib/format'
import { TipoStatoAttivita } from '@/lib/enums'

interface Props {
  IdAttività: number
  NomeAttività: string | null
  CodiceArticolo: string | null
  QuantitàdaProdurre: number
  QuantitàProdotta: number
  QuantitàScartata: number
  StatoAttività: number
  inizio: string
}

function durata(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor((s % 86400) / 3600)
  const d = Math.floor(s / 86400)
  const m = Math.floor((s % 3600) / 60)
  return `${d > 0 ? `${d}g ` : ''}${h}h ${m}m ${s % 60}s`
}

export default function AttivitaInCorso({ attivita: a }: { attivita: Props }) {
  const router = useRouter()
  const [now, setNow] = useState<number>(() => Date.now())
  const [azione, setAzione] = useState<'sospendi' | 'concludi' | null>(null)
  const [prodotta, setProdotta] = useState(String(a.QuantitàProdotta || 0))
  const [scartata, setScartata] = useState(String(a.QuantitàScartata || 0))
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const invia = async () => {
    if (!azione) return
    setBusy(true)
    const r = await api<{ ok: boolean; message?: string; pathRedirect?: string }>(`/api/attivita/${a.IdAttività}/${azione}`, {
      body: { QuantitaProdotta: prodotta, QuantitaScartata: scartata },
    })
    setBusy(false)
    notify(r.ok, r.message)
    if (r.ok) {
      setAzione(null)
      router.push(r.pathRedirect || '/operatore')
      router.refresh()
    }
  }

  const inAttrezzaggio = a.StatoAttività === TipoStatoAttivita.In_Attrezzaggio
  return (
    <>
      <h2 className="page-title">Attività in corso</h2>
      <h4>
        <svg height="25" width="30" className="blinking" aria-hidden>
          <circle cx="15" cy="10" r="10" fill="red" />
        </svg>
        {inAttrezzaggio ? 'In Attrezzaggio' : 'In Lavorazione'}
      </h4>
      <p className="text-center">
        {inAttrezzaggio ? (
          <>Attrezzaggio dell&apos;attività &quot;<b>{a.NomeAttività}</b>&quot; in corso. Vuoi concludere l&apos;attività?</>
        ) : (
          <>Attività &quot;<b>{a.NomeAttività}</b>&quot; in corso. Vuoi concludere l&apos;attività?</>
        )}
      </p>
      <p className="text-center">
        Articolo: <b>{a.CodiceArticolo}</b> · Obiettivo: <b>{fmtNum(a.QuantitàdaProdurre)}</b>
      </p>
      <p className="text-center">Tempo trascorso dall&apos;inizio dell&apos;attività:</p>
      <p id="timer" className="centerDiv" suppressHydrationWarning>
        {durata(now - new Date(a.inizio).getTime())}
      </p>
      <div className="row mt-4">
        <div className="col-6 centerDiv">
          <button className="BtnSospendiAttività btn px-4 py-2 text-white" onClick={() => setAzione('sospendi')}>
            Sospendi attività
          </button>
        </div>
        <div className="col-6 centerDiv">
          <button className="BtnConcludiAttività btn px-4 py-2 text-white" onClick={() => setAzione('concludi')}>
            Concludi attività
          </button>
        </div>
      </div>

      <Modal
        title={azione === 'sospendi' ? 'Sospendi Attività' : 'Concludi Attività'}
        open={azione !== null}
        onClose={() => setAzione(null)}
        footer={
          <button className="btn btn-grad px-4" disabled={busy} onClick={invia}>
            Salva
          </button>
        }
      >
        <p className="text-center">
          Vuoi {azione === 'sospendi' ? 'sospendere' : 'concludere'} la seguente attività &quot;<b>{a.NomeAttività}</b>&quot;? Clicca su Salva per{' '}
          {azione === 'sospendi' ? 'sospendere' : 'concludere'} l&apos;attività.
        </p>
        <p className="text-center">
          Articolo in lavorazione: <b>{a.CodiceArticolo}</b>
          {azione === 'concludi' && (
            <>
              {' '}
              Obiettivo di produzione: <b>{fmtNum(a.QuantitàdaProdurre)}</b>
            </>
          )}
        </p>
        {azione === 'concludi' && !inAttrezzaggio && (
          <p className="text-center text-muted small">
            Se la quantità prodotta è inferiore all&apos;obiettivo la fase resta aperta (quantità parziale).
          </p>
        )}
        <div className="row">
          <div className="col-6">
            <label className="form-label">Q.tà Prodotta</label>
            <input className="form-control" type="number" step=".01" min="0" value={prodotta} onChange={(e) => setProdotta(e.target.value)} />
          </div>
          <div className="col-6">
            <label className="form-label">Q.tà scartata</label>
            <input className="form-control" type="number" step=".01" min="0" value={scartata} onChange={(e) => setScartata(e.target.value)} />
          </div>
        </div>
      </Modal>
    </>
  )
}
