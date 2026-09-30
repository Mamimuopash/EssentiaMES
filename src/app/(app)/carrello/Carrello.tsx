'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, conferma, notify, Swal } from '@/components/client-api'
import type { RigaCarrello } from '@/lib/services/richieste'

interface ArticoloCatalogo {
  Id: number
  Nome_Articolo: string | null
  Descrizione_Articolo: string | null
}

export default function Carrello({ righe, catalogo, q, isAdmin }: { righe: RigaCarrello[]; catalogo: ArticoloCatalogo[]; q: string; isAdmin: boolean }) {
  const router = useRouter()
  const [ricerca, setRicerca] = useState(q)

  async function aggiungi(a: ArticoloCatalogo) {
    const r = await Swal.fire({
      title: a.Nome_Articolo ?? '',
      text: a.Descrizione_Articolo ?? '',
      input: 'number',
      inputValue: '1',
      inputAttributes: { min: '1', step: '1' },
      showCancelButton: true,
      cancelButtonText: 'Annulla',
      confirmButtonText: 'Inserisci articoli',
    })
    if (!r.isConfirmed) return
    const x = await api('/api/carrello', { body: { id: a.Id, qta: Number(r.value) } })
    notify(x.ok, x.message)
    if (x.ok) router.refresh()
  }

  return (
    <>
      <h2 className="page-title">Richiesta materiali</h2>
      <div className="row g-4">
        <div className="col-lg-6">
          <h5>Catalogo</h5>
          <form
            className="d-flex gap-2 mb-2"
            onSubmit={(e) => {
              e.preventDefault()
              router.push(`/carrello${ricerca ? `?q=${encodeURIComponent(ricerca)}` : ''}`)
            }}
          >
            <input className="form-control" placeholder="Cerca articolo" value={ricerca} onChange={(e) => setRicerca(e.target.value)} />
            <button className="btn btn-grad px-3" aria-label="Cerca">
              <i className="fa-solid fa-magnifying-glass" />
            </button>
            {isAdmin && (
              <button
                type="button"
                className="btn btn-outline-primary text-nowrap"
                onClick={async () => {
                  const r = await Swal.fire({
                    title: 'Aggiungi Articolo',
                    html: '<input id="sw-cod" class="swal2-input" placeholder="Codice Articolo"><input id="sw-desc" class="swal2-input" placeholder="Descrizione">',
                    showCancelButton: true,
                    cancelButtonText: 'Annulla',
                    confirmButtonText: 'Aggiungi articolo',
                    preConfirm: () => ({
                      CodiceArticolo: (document.getElementById('sw-cod') as HTMLInputElement).value,
                      DescrizioneArticolo: (document.getElementById('sw-desc') as HTMLInputElement).value,
                    }),
                  })
                  if (!r.isConfirmed) return
                  const x = await api('/api/carrello/articoli', { body: r.value })
                  notify(x.ok, x.message)
                  if (x.ok) router.refresh()
                }}
              >
                + Articolo
              </button>
            )}
          </form>
          {catalogo.length === 0 && <div className="text-muted">Nessun articolo.</div>}
          {catalogo.map((a) => (
            <div className="card cardArticolo mb-2 w-100 d-flex flex-row justify-content-between align-items-center p-3" key={a.Id}>
              <div>
                <h5 className="m-0">{a.Nome_Articolo}</h5>
                <small className="text-muted">{a.Descrizione_Articolo}</small>
              </div>
              <div className="d-flex gap-1">
                <button className="btn-icon" title="Aggiungi al carrello" onClick={() => aggiungi(a)}>
                  <i className="fa-solid fa-plus" />
                </button>
                {isAdmin && (
                  <button
                    className="btn-icon danger"
                    title="Cancella dal catalogo"
                    onClick={async () => {
                      if (!(await conferma('Cancellare articolo?', `${a.Nome_Articolo} verrà nascosto dal catalogo.`, 'Sì, cancella'))) return
                      const x = await api(`/api/carrello/articoli/${a.Id}`, { method: 'DELETE' })
                      notify(x.ok, x.message)
                      if (x.ok) router.refresh()
                    }}
                  >
                    <i className="fa-solid fa-trash" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="col-lg-6">
          <h5>Carrello</h5>
          {righe.length === 0 ? (
            <div className="empty-state">
              <i className="fa-solid fa-cart-shopping fa-4x fa-gradient" />
              <h5 className="mt-3 text-dark">Carrello vuoto</h5>
              <p>Inserisci prima degli articoli per poter inviare la richiesta di materiali.</p>
            </div>
          ) : (
            <>
              {righe.map((r) => (
                <div className="card cardArticolo mb-2 w-100 d-flex flex-row justify-content-between align-items-center p-3" key={r.Id}>
                  <div>
                    <h5 className="m-0">
                      {r.NomeArticolo} <span className="chip">q.tà {r.QtaArticolo}</span>
                    </h5>
                    <small className="text-muted">{r.DescrizioneArticolo}</small>
                  </div>
                  <button
                    className="btn-icon danger"
                    title="Rimuovi"
                    onClick={async () => {
                      if (!(await conferma('Conferma operazione', 'Sei sicuro di voler cancellare questo articolo dal carrello?', 'Sì, cancellalo!'))) return
                      const x = await api(`/api/carrello/${r.Id}`, { method: 'DELETE' })
                      notify(x.ok, x.message)
                      router.refresh()
                    }}
                  >
                    <i className="fa-solid fa-xmark" />
                  </button>
                </div>
              ))}
              <div className="text-center mt-3">
                <button
                  className="btn btnRichiesta"
                  onClick={async () => {
                    if (!(await conferma('Conferma operazione', 'Sei sicuro di voler inviare questa richiesta di materiali?', 'Sì, invia!'))) return
                    const x = await api('/api/carrello/invia', { method: 'POST' })
                    notify(x.ok, x.message)
                    router.refresh()
                  }}
                >
                  Invia richiesta
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
