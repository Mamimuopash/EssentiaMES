'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/** Filtro periodo (sostituisce il datepicker jQuery): produce ?periodo=yyyyMMdd-yyyyMMdd */
export default function FiltroDate({ idMacchina }: { idMacchina: number }) {
  const router = useRouter()
  const [dal, setDal] = useState('')
  const [al, setAl] = useState('')
  const ymd = (s: string) => s.replace(/-/g, '')
  return (
    <div className="row g-2">
      <div className="col-4">
        <input type="date" className="form-control" value={dal} onChange={(e) => setDal(e.target.value)} aria-label="Data inizio" />
      </div>
      <div className="col-4">
        <input type="date" className="form-control" value={al} onChange={(e) => setAl(e.target.value)} aria-label="Data fine" />
      </div>
      <div className="col-4">
        <button
          className="btn btn-grad w-100"
          disabled={!dal || !al}
          onClick={() => router.push(`/macchine/${idMacchina}/analisi?periodo=${ymd(dal)}-${ymd(al)}`)}
        >
          Aggiorna dati
        </button>
      </div>
    </div>
  )
}
