'use client'

import { useState } from 'react'
import ServerTable from '@/components/ServerTable'
import Modal from '@/components/Modal'
import { api, conferma, notify } from '@/components/client-api'
import { useOpzioni } from '@/components/useOpzioni'
import { fmtDate, fmtDateTime, fmtNum } from '@/lib/format'

interface GiacenzaRow {
  Id: number
  CodiceArticolo: string | null
  CodiceArticoloRaw: string | null
  IdArticolo: number | null
  Magazzino: string | null
  IdMagazzino: number | null
  CodiceMagazzinoRaw: string | null
  QuantitaGiacenza: number
  QuantitaSottoscorta: number
  QuantitaScortaMassima: number
  InPrevisioneEntrata: number
  UltimaModifica_Data: string | null
  UltimaModifica_Operatore: string | null
}

const vuoto = { IdArticolo: '0', IdMagazzino: '0', QuantitaGiacenza: '0', QuantitaSottoscorta: '0', QuantitaScortaMassima: '0' }

export default function Giacenze() {
  const [refresh, setRefresh] = useState(0)
  const [filtroMag, setFiltroMag] = useState('')
  const [soloSotto, setSoloSotto] = useState(false)
  const [form, setForm] = useState<{ id: number | null; v: typeof vuoto } | null>(null)
  const [odp, setOdp] = useState<{ IdArticolo: string; Qta: string } | null>(null)
  const [det, setDet] = useState<GiacenzaRow | null>(null)
  const [busy, setBusy] = useState(false)
  const magazzini = useOpzioni('magazzini')
  const articoli = useOpzioni('articoli', form !== null || odp !== null)
  const reload = () => setRefresh((x) => x + 1)

  async function salva() {
    if (!form) return
    setBusy(true)
    const r = form.id ? await api(`/api/giacenze/${form.id}`, { method: 'PUT', body: form.v }) : await api('/api/giacenze', { body: form.v })
    setBusy(false)
    notify(r.ok, r.message)
    if (r.ok) {
      setForm(null)
      reload()
    }
  }
  async function creaOdp() {
    if (!odp) return
    setBusy(true)
    const r = await api('/api/odp', { body: { IdArticolo: Number(odp.IdArticolo), Qta: Number(odp.Qta) } })
    setBusy(false)
    notify(r.ok, r.message)
    if (r.ok) setOdp(null)
  }
  async function elimina(g: GiacenzaRow) {
    if (!(await conferma('Eliminare la giacenza?', `${g.CodiceArticolo} in ${g.Magazzino}`, 'Sì, elimina'))) return
    const r = await api(`/api/giacenze/${g.Id}`, { method: 'DELETE' })
    notify(r.ok, r.message)
    if (r.ok) reload()
  }
  const set = (k: keyof typeof vuoto) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => (f ? { ...f, v: { ...f.v, [k]: e.target.value } } : f))

  return (
    <>
      <div className="toolbar">
        <h2 className="page-title m-0">Dashboard Giacenze</h2>
        <div className="d-flex gap-2">
          <button className="btn btn-outline-primary rounded-pill px-3" onClick={() => setOdp({ IdArticolo: '0', Qta: '' })}>
            <i className="fa-solid fa-plus" /> Crea ODP
          </button>
          <button className="btn btn-grad px-4" onClick={() => setForm({ id: null, v: { ...vuoto } })}>
            Crea Giacenza
          </button>
        </div>
      </div>
      <ServerTable<GiacenzaRow>
        endpoint="/api/giacenze"
        refreshKey={refresh}
        rowKey={(r) => r.Id}
        params={{ magazzino: filtroMag, sottoscorta: soloSotto ? '1' : '' }}
        searchPlaceholder="Cerca giacenza (articolo o magazzino)"
        defaultSort={{ key: 'articolo', dir: 'asc' }}
        toolbar={
          <div className="d-flex gap-2 align-items-center flex-wrap">
            <select className="form-select" style={{ width: 240 }} value={filtroMag} onChange={(e) => setFiltroMag(e.target.value)}>
              <option value="">Tutti i magazzini</option>
              {magazzini.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <div className="form-check">
              <input className="form-check-input" type="checkbox" id="sotto" checked={soloSotto} onChange={(e) => setSoloSotto(e.target.checked)} />
              <label className="form-check-label" htmlFor="sotto">Solo sotto scorta</label>
            </div>
          </div>
        }
        columns={[
          { key: 'art', header: 'Codice Articolo', sortKey: 'articolo', render: (r) => <b>{r.CodiceArticolo}</b> },
          { key: 'mag', header: 'Magazzino', sortKey: 'magazzino', render: (r) => r.Magazzino },
          {
            key: 'g',
            header: 'Q.tà Giacenza',
            sortKey: 'giacenza',
            render: (r) => (
              <span className={r.QuantitaSottoscorta > 0 && r.QuantitaGiacenza + r.InPrevisioneEntrata <= r.QuantitaSottoscorta ? 'text-danger fw-bold' : ''}>
                {fmtNum(r.QuantitaGiacenza)}
              </span>
            ),
          },
          { key: 's', header: 'Q.tà Sottoscorta', sortKey: 'sottoscorta', render: (r) => fmtNum(r.QuantitaSottoscorta) },
          { key: 'max', header: 'Scorta Max', render: (r) => fmtNum(r.QuantitaScortaMassima) },
          { key: 'data', header: 'Ultima Modifica', sortKey: 'data', render: (r) => fmtDate(r.UltimaModifica_Data) },
          {
            key: 'az',
            header: 'Azioni',
            className: 'dt-actions',
            render: (r) => (
              <>
                <button className="btn-icon" title="Crea ODP" onClick={() => setOdp({ IdArticolo: String(r.IdArticolo ?? 0), Qta: '' })}>
                  <i className="fa-solid fa-plus" />
                </button>{' '}
                <button
                  className="btn-icon"
                  title="Modifica"
                  onClick={() =>
                    setForm({
                      id: r.Id,
                      v: {
                        IdArticolo: String(r.IdArticolo ?? r.CodiceArticoloRaw ?? '0'),
                        IdMagazzino: String(r.IdMagazzino ?? r.CodiceMagazzinoRaw ?? '0'),
                        QuantitaGiacenza: String(r.QuantitaGiacenza),
                        QuantitaSottoscorta: String(r.QuantitaSottoscorta),
                        QuantitaScortaMassima: String(r.QuantitaScortaMassima),
                      },
                    })
                  }
                >
                  <i className="fa-solid fa-pen-to-square" />
                </button>{' '}
                <button className="btn-icon" title="Dettagli" onClick={() => setDet(r)}>
                  <i className="fa-solid fa-magnifying-glass" />
                </button>{' '}
                <button className="btn-icon danger" title="Elimina" onClick={() => elimina(r)}>
                  <i className="fa-solid fa-trash" />
                </button>
              </>
            ),
          },
        ]}
      />

      <Modal
        title={form?.id ? 'Modifica Giacenza' : 'Aggiungi Giacenza'}
        open={form !== null}
        onClose={() => setForm(null)}
        footer={
          <button className="btn btn-grad px-4" disabled={busy} onClick={salva}>
            Salva Modifiche
          </button>
        }
      >
        {form && (
          <>
            <div className="form-row">
              <div>
                <label>Codice Articolo</label>
                <select className="form-select" value={form.v.IdArticolo} onChange={set('IdArticolo')}>
                  <option value="0">Selezionare Voce...</option>
                  {articoli.map((a) => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                  {!/^\d+$/.test(form.v.IdArticolo) && <option value={form.v.IdArticolo}>{form.v.IdArticolo}</option>}
                </select>
              </div>
              <div>
                <label>Magazzino</label>
                <select className="form-select" value={form.v.IdMagazzino} onChange={set('IdMagazzino')}>
                  <option value="0">Selezionare Voce...</option>
                  {magazzini.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                  {!/^\d+$/.test(form.v.IdMagazzino) && <option value={form.v.IdMagazzino}>{form.v.IdMagazzino}</option>}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div>
                <label>Q.tà Giacenza</label>
                <input className="form-control" type="number" step="any" value={form.v.QuantitaGiacenza} onChange={set('QuantitaGiacenza')} />
              </div>
              <div>
                <label>Q.tà Sottoscorta (scorta minima)</label>
                <input className="form-control" type="number" step="any" value={form.v.QuantitaSottoscorta} onChange={set('QuantitaSottoscorta')} />
              </div>
              <div>
                <label>Q.tà Scorta Massima</label>
                <input className="form-control" type="number" step="any" value={form.v.QuantitaScortaMassima} onChange={set('QuantitaScortaMassima')} />
              </div>
            </div>
          </>
        )}
      </Modal>

      <Modal
        title="Crea ODP manuale"
        open={odp !== null}
        size="md"
        onClose={() => setOdp(null)}
        footer={
          <button className="btn btn-grad px-4" disabled={busy || !odp || odp.IdArticolo === '0' || !(Number(odp.Qta) > 0)} onClick={creaOdp}>
            Crea ODP
          </button>
        }
      >
        {odp && (
          <div className="form-row">
            <div>
              <label>Codice Articolo</label>
              <select className="form-select" value={odp.IdArticolo} onChange={(e) => setOdp({ ...odp, IdArticolo: e.target.value })}>
                <option value="0">Selezionare Voce...</option>
                {articoli.map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Quantità da produrre</label>
              <input className="form-control" type="number" min="1" value={odp.Qta} onChange={(e) => setOdp({ ...odp, Qta: e.target.value })} />
            </div>
          </div>
        )}
      </Modal>

      <Modal title="Dettagli giacenza" open={det !== null} size="md" onClose={() => setDet(null)}>
        {det && (
          <dl className="row">
            <dt className="col-6">Codice Articolo</dt>
            <dd className="col-6">{det.CodiceArticolo}</dd>
            <dt className="col-6">Magazzino</dt>
            <dd className="col-6">{det.Magazzino}</dd>
            <dt className="col-6">Q.tà Giacenza</dt>
            <dd className="col-6">{fmtNum(det.QuantitaGiacenza)}</dd>
            <dt className="col-6">Q.tà Sottoscorta</dt>
            <dd className="col-6">{fmtNum(det.QuantitaSottoscorta)}</dd>
            <dt className="col-6">Q.tà Scorta Massima</dt>
            <dd className="col-6">{fmtNum(det.QuantitaScortaMassima)}</dd>
            <dt className="col-6">In previsione d&apos;entrata</dt>
            <dd className="col-6">{fmtNum(det.InPrevisioneEntrata)}</dd>
            <dt className="col-6">Ultima Modifica</dt>
            <dd className="col-6">
              {fmtDateTime(det.UltimaModifica_Data)} {det.UltimaModifica_Operatore}
            </dd>
          </dl>
        )}
      </Modal>
    </>
  )
}
