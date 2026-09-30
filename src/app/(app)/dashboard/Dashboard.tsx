'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import DataTable from '@/components/DataTable'
import { api, conferma, notify, Swal } from '@/components/client-api'
import type { PinMacchina, StatoMacchinaRow } from '@/lib/services/macchine'

interface DatiPin {
  programmaDesc: string
  dataRilevazione: string
  nomeMacchina: string | null
}

export default function Dashboard({ pins, stati, isAdmin }: { pins: PinMacchina[]; stati: StatoMacchinaRow[]; isAdmin: boolean }) {
  const router = useRouter()
  const [tab, setTab] = useState<'mappa' | 'stati'>('mappa')
  const [mode, setMode] = useState<'visualizza' | 'modifica'>('visualizza')
  const [pop, setPop] = useState<{ pin: PinMacchina; dati: DatiPin | null } | null>(null)

  async function clickMappa(e: React.MouseEvent<HTMLImageElement>) {
    if (mode !== 'modifica') {
      setPop(null)
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) * 100) / rect.width
    const y = ((e.clientY - rect.top) * 100) / rect.height
    const r = await api<{ listaMacchine: { IdMacchina: number; NomeMacchina: string }[] }>('/api/planimetria')
    if (!r.ok) return notify(false, r.message)
    if (r.listaMacchine.length === 0) return notify(false, 'Tutte le macchine hanno già un pinpoint.')
    const inputOptions: Record<string, string> = {}
    r.listaMacchine.forEach((m) => (inputOptions[String(m.IdMacchina)] = m.NomeMacchina))
    const scelta = await Swal.fire({
      title: 'Nuovo PinPoint',
      input: 'select',
      inputOptions,
      icon: 'question',
      text: 'Scegliere una tra le seguenti macchine disponibili:',
      showCancelButton: true,
      cancelButtonText: 'Annulla',
      confirmButtonText: 'Perfetto!',
    })
    if (!scelta.isConfirmed) return
    const s = await api('/api/planimetria', { body: { id: Number(scelta.value), posX: x.toFixed(4), posY: y.toFixed(4) } })
    notify(s.ok, s.message)
    if (s.ok) router.refresh()
  }

  async function clickPin(p: PinMacchina) {
    if (mode === 'modifica') {
      if (!(await conferma(`Rimuovere il pin di "${p.NomeMacchina}"?`, 'Il pin verrà tolto dalla planimetria.'))) return
      const r = await api(`/api/planimetria/${p.IdMacchina}`, { method: 'DELETE' })
      notify(r.ok, r.message)
      if (r.ok) router.refresh()
      return
    }
    if (pop?.pin.IdMacchina === p.IdMacchina) return setPop(null)
    setPop({ pin: p, dati: null })
    const d = await api<DatiPin>(`/api/macchine/${p.IdMacchina}/dati`)
    setPop((cur) => (cur && cur.pin.IdMacchina === p.IdMacchina ? { pin: p, dati: d.ok ? d : { programmaDesc: '', dataRilevazione: '', nomeMacchina: p.NomeMacchina } } : cur))
  }

  return (
    <>
      <div className="d-flex flex-wrap justify-content-between align-items-center MainTitleAccount mb-2">
        <h1 className="TitleAccount m-0">Dashboard {isAdmin ? 'Admin' : ''}</h1>
        <ul className="nav nav-pills">
          <li className="nav-item">
            <button className={`nav-link ${tab === 'mappa' ? 'active' : ''}`} onClick={() => setTab('mappa')}>
              Dashboard
            </button>
          </li>
          <li className="nav-item">
            <button className={`nav-link ${tab === 'stati' ? 'active' : ''}`} onClick={() => { setTab('stati'); setPop(null) }}>
              Stati Macchina
            </button>
          </li>
        </ul>
      </div>

      {tab === 'mappa' && (
        <>
          <div className={`planimetria ${mode === 'modifica' ? 'edit' : ''}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="mappa" src="/assets/Planimetria_Brighetti.png" alt="Planimetria" onClick={clickMappa} draggable={false} />
            {pins.map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={p.IdMacchina}
                className="pin"
                src={p.MacchinaAccesa ? '/assets/PinpointImageAcceso.png' : '/assets/PinpointImage.png'}
                alt={p.NomeMacchina ?? ''}
                title={p.NomeMacchina ?? ''}
                style={{ left: `${Number(p.posX)}%`, top: `${Number(p.posY)}%` }}
                onClick={() => clickPin(p)}
              />
            ))}
            {pop && (
              <div className="pin-popover" style={{ left: `${Number(pop.pin.posX)}%`, top: `${Number(pop.pin.posY)}%` }}>
                <h6>{pop.pin.NomeMacchina}</h6>
                {!pop.dati ? (
                  <i className="fa fa-circle-notch fa-spin" />
                ) : pop.dati.programmaDesc ? (
                  <p className="mb-1">
                    Programma Desc: {pop.dati.programmaDesc}
                    <br />
                    Data Rilevazione: {pop.dati.dataRilevazione}
                  </p>
                ) : (
                  <p className="mb-1">Nessun dato macchina</p>
                )}
                <hr className="my-2" />
                <Link href={`/macchine/${pop.pin.IdMacchina}`} className="link">
                  <i className="fa-solid fa-search fa-xl" /> Apri macchina
                </Link>
              </div>
            )}
          </div>
          {isAdmin && (
            <div className="mode-buttons">
              <button
                title="Visualizza"
                className={`buttonNotSelected ${mode === 'visualizza' ? 'buttonSelected' : ''}`}
                onClick={() => setMode('visualizza')}
              >
                <i className="fa-solid fa-eye" />
              </button>
              <button
                title="Modifica pin (clic sulla mappa per aggiungere, sul pin per rimuovere)"
                className={`buttonNotSelected ${mode === 'modifica' ? 'buttonSelected' : ''}`}
                onClick={() => {
                  setMode('modifica')
                  setPop(null)
                }}
              >
                <i className="fa-solid fa-screwdriver-wrench" />
              </button>
            </div>
          )}
          {mode === 'modifica' && (
            <p className="text-center text-muted mt-2">
              Modalità modifica: clic sulla planimetria per aggiungere un pin, clic su un pin per rimuoverlo.
            </p>
          )}
        </>
      )}

      {tab === 'stati' && (
        <DataTable
          rows={stati}
          rowKey={(r) => r.IdMacchina}
          searchPlaceholder="Cerca Macchina"
          columns={[
            { key: 'nome', header: 'Macchina', value: (r) => r.NomeMacchina },
            { key: 'stato', header: 'Stato Macchina', value: (r) => r.StatoMacchina },
            { key: 'data', header: 'Data Ult. Ril.', value: (r) => r.UltimiDatiRilevati },
            { key: 'prog', header: 'Programma', value: (r) => r.UltimoProgrammaMacchina },
            {
              key: 'eff',
              header: 'Efficienza (ieri)',
              value: (r) => r.Efficienza?.perc ?? -1,
              render: (r) =>
                r.Efficienza ? (
                  <div className="progress progress-eff" title={`${r.Efficienza.minuti} minuti su 480`}>
                    <div className="progress-bar bg-success" style={{ width: `${Math.min(100, r.Efficienza.perc)}%` }}>
                      {r.Efficienza.perc}%
                    </div>
                    <div className="progress-bar bg-danger" style={{ width: `${Math.max(0, Math.min(100, r.Efficienza.percFermo))}%` }} />
                  </div>
                ) : (
                  ''
                ),
            },
            {
              key: 'az',
              header: 'Azioni',
              className: 'dt-actions',
              render: (r) => (
                <>
                  <Link className="btn-icon" href={`/macchine/${r.IdMacchina}`} title="Dettaglio macchina">
                    <i className="fa-solid fa-industry" />
                  </Link>{' '}
                  {isAdmin && (
                    <Link className="btn-icon" href={`/macchine/${r.IdMacchina}/analisi`} title="Analisi">
                      <i className="fa-solid fa-magnifying-glass" />
                    </Link>
                  )}
                </>
              ),
            },
          ]}
        />
      )}
    </>
  )
}
