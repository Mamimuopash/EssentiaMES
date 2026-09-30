'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Modal from '@/components/Modal'
import { api, conferma, notify, Swal } from '@/components/client-api'
import { fmtDate, fmtNum } from '@/lib/format'
import { TipoStatoAttivitaLabel } from '@/lib/enums'
import type { DettaglioFaseOrdine, OrdineStorico } from '@/lib/services/produzione'
import type { UtenteView } from '@/lib/services/utenti'

export default function Storico({ ordini, utenti, meId }: { ordini: OrdineStorico[]; utenti: UtenteView[]; meId: string }) {
  const router = useRouter()
  const [tab, setTab] = useState<'storico' | 'account'>('storico')
  const [ordine, setOrdine] = useState<{ id: string; fasi: DettaglioFaseOrdine[] | null } | null>(null)
  const [nuovo, setNuovo] = useState<{ username: string; email: string; password: string; ruolo: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function apriOrdine(id: string) {
    setOrdine({ id, fasi: null })
    const r = await api<{ fasi: DettaglioFaseOrdine[] }>(`/api/odp?ordine=${encodeURIComponent(id)}`)
    if (!r.ok) {
      notify(false, r.message)
      setOrdine(null)
      return
    }
    setOrdine({ id, fasi: r.fasi })
  }
  async function creaUtente() {
    if (!nuovo) return
    setBusy(true)
    const r = await api('/api/utenti', { body: nuovo })
    setBusy(false)
    notify(r.ok, r.message)
    if (r.ok) {
      setNuovo(null)
      router.refresh()
    }
  }
  async function gestisci(u: UtenteView) {
    const s = await Swal.fire({
      title: `Utente "${u.UserName}"`,
      text: 'Cosa vuoi fare?',
      icon: 'question',
      showCancelButton: true,
      showDenyButton: u.Id !== meId,
      confirmButtonText: 'Reimposta password',
      denyButtonText: 'Cancella utente',
      cancelButtonText: 'Chiudi',
    })
    if (s.isConfirmed) {
      const p = await Swal.fire({
        title: `Nuova password per ${u.UserName}`,
        input: 'password',
        inputPlaceholder: 'Min. 6 caratteri, maiuscola, minuscola, numero, simbolo',
        showCancelButton: true,
        cancelButtonText: 'Annulla',
        confirmButtonText: 'Imposta',
      })
      if (!p.value) return
      const r = await api(`/api/utenti/${u.Id}`, { method: 'PATCH', body: { password: p.value } })
      notify(r.ok, r.message)
    } else if (s.isDenied) {
      if (!(await conferma(`Cancellare "${u.UserName}"?`, "Vuoi cancellare l'utente dal sistema? Lo storico dei suoi ordini resta.", 'Sì, cancella!'))) return
      const r = await api(`/api/utenti/${u.Id}`, { method: 'DELETE' })
      notify(r.ok, r.message)
      if (r.ok) router.refresh()
    }
  }

  return (
    <>
      <div className="MainTitleAccount d-flex flex-wrap justify-content-between align-items-center mb-3">
        <h1 className="TitleAccount m-0">Storico</h1>
        <ul className="nav nav-pills">
          <li className="nav-item">
            <button className={`nav-link ${tab === 'storico' ? 'active' : ''}`} onClick={() => setTab('storico')}>Storico Attività</button>
          </li>
          <li className="nav-item">
            <button className={`nav-link ${tab === 'account' ? 'active' : ''}`} onClick={() => setTab('account')}>Gest. Account</button>
          </li>
        </ul>
      </div>

      {tab === 'storico' && (
        <>
          <p className="text-muted">Ordini di produzione con attività aggiornate negli ultimi 7 giorni.</p>
          {ordini.length === 0 && <div className="empty-state">Nessun ordine negli ultimi 7 giorni.</div>}
          {ordini.map((o) => (
            <div className="d-flex justify-content-center mb-2" key={o.Id}>
              <div className="card cardStorico d-flex flex-row align-items-center justify-content-between px-3" style={{ height: 'auto', minHeight: 62 }}>
                <div>
                  <h5 className="m-0">
                    Ordine Nr. {o.Id} - art: {o.CodiceArticolo}
                  </h5>
                  <small className="text-muted">
                    Effettuato in data {fmtDate(o.DataOrdine)} · {o.OpName}
                  </small>
                </div>
                <button className="btn-icon" title="Dettagli ordine" onClick={() => apriOrdine(o.Id)}>
                  <i className="fa-solid fa-magnifying-glass" />
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {tab === 'account' && (
        <>
          <div className="d-flex justify-content-end mb-3">
            <button className="btn btn-grad px-4" onClick={() => setNuovo({ username: '', email: '', password: '', ruolo: 'Operatore' })}>
              <i className="fa-solid fa-user-plus" /> Crea Utente
            </button>
          </div>
          {utenti.map((u) => (
            <div className="d-flex justify-content-center mb-2" key={u.Id}>
              <div className="card cardUtenti d-flex flex-row align-items-center justify-content-between px-3" style={{ height: 'auto', minHeight: 62 }}>
                <div>
                  <h5 className="m-0">{u.UserName}</h5>
                  <small className="text-muted">
                    {u.Email ?? '-'} · {u.Ruoli ?? 'nessun ruolo'}
                  </small>
                </div>
                <button className="btn-icon" title="Gestisci utente" onClick={() => gestisci(u)}>
                  <i className="fa-solid fa-user-gear" />
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      <Modal title={`Dettagli Ordine ${ordine?.id ?? ''}`} open={ordine !== null} size="xl" onClose={() => setOrdine(null)}>
        {ordine && !ordine.fasi && <i className="fa fa-circle-notch fa-spin fa-2x" />}
        {ordine?.fasi && (
          <div className="dt-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>N.</th>
                  <th>Nome</th>
                  <th>Stato</th>
                  <th>Q.tà Prod.</th>
                  <th>Q.tà Scart.</th>
                  <th>Tempo Lav.</th>
                  <th>Tempo Att.</th>
                  <th>Note</th>
                  <th>File</th>
                </tr>
              </thead>
              <tbody>
                {ordine.fasi.map((f, i) => (
                  <tr key={i}>
                    <td>{f.IncrementaleAttività}</td>
                    <td>{f.NomeAttività}</td>
                    <td>{TipoStatoAttivitaLabel[f.Stato] ?? f.Stato}</td>
                    <td>{fmtNum(f.Quantitàprodotta)} pz.</td>
                    <td>{fmtNum(f.QuantitàScartata)} pz.</td>
                    <td>{f.TempoLavorazione} min.</td>
                    <td>{f.TempoAttrezzaggio} min.</td>
                    <td>{f.CountNote}</td>
                    <td>{f.CountAllegati}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {ordine.fasi.length > 0 && <p className="text-muted">Completamento ordine: {ordine.fasi[0].PercCompletamento}%</p>}
          </div>
        )}
      </Modal>

      <Modal
        title="Crea Utente"
        open={nuovo !== null}
        size="md"
        onClose={() => setNuovo(null)}
        footer={
          <button className="btn btn-grad px-4" disabled={busy} onClick={creaUtente}>
            Crea Utente
          </button>
        }
      >
        {nuovo && (
          <>
            <label className="small text-muted">Nome Utente</label>
            <input className="form-control mb-2" autoComplete="off" value={nuovo.username} onChange={(e) => setNuovo({ ...nuovo, username: e.target.value })} />
            <label className="small text-muted">Email (facoltativa)</label>
            <input className="form-control mb-2" type="email" value={nuovo.email} onChange={(e) => setNuovo({ ...nuovo, email: e.target.value })} />
            <label className="small text-muted">Password iniziale</label>
            <input className="form-control mb-2" type="password" autoComplete="new-password" value={nuovo.password} onChange={(e) => setNuovo({ ...nuovo, password: e.target.value })} />
            <label className="small text-muted">Ruolo</label>
            <select className="form-select" value={nuovo.ruolo} onChange={(e) => setNuovo({ ...nuovo, ruolo: e.target.value })}>
              <option value="Operatore">Operatore (postazione macchina)</option>
              <option value="Admin">Admin</option>
              <option value="Reparto">Reparto</option>
            </select>
            <p className="small text-muted mt-2">Dopo la creazione, associare l&apos;operatore alla sua macchina da Dashboard Macchina.</p>
          </>
        )}
      </Modal>
    </>
  )
}
