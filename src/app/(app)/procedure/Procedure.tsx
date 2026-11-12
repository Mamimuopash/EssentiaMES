'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import DataTable from '@/components/DataTable'
import Modal from '@/components/Modal'
import { api, conferma, notify } from '@/components/client-api'
import { useOpzioni } from '@/components/useOpzioni'
import { TipoAttivitaProceduraLabel } from '@/lib/enums'

export interface ProceduraRow {
  IdProcedura: number
  CodiceArticolo: string | null
  IncrementaleProcedura: number
  TipoAttivita: number
  NomeAttivita: string | null
  idReparto: number
  idMacchinaMagazzino: number
  Risorsa: string | null
  NomeReparto: string | null
}

interface ArticoloAffilatura {
  CodiceArticolo: string
  DescrizioneArticolo: string | null
  Parola: string
  FaseAffilatura: string | null
  AttivitaAperte: number
}

const vuoto = { CodiceArticolo: '', IncrementaleProcedura: '1', TipoAttivita: '1', NomeAttivita: '', idReparto: '0', idMacchinaMagazzino: '0' }

export default function Procedure({ rows, articolo }: { rows: ProceduraRow[]; articolo: string }) {
  const router = useRouter()
  const [filtro, setFiltro] = useState(articolo)
  const [form, setForm] = useState<{ id: number | null; v: typeof vuoto } | null>(null)
  const [busy, setBusy] = useState(false)
  const [affil, setAffil] = useState<{ caricamento: boolean; parole: string[]; articoli: ArticoloAffilatura[] } | null>(null)
  const macchine = useOpzioni('macchine', form !== null)
  const magazzini = useOpzioni('magazzini', form !== null)
  const reparti = useOpzioni('reparti', form !== null)
  const articoli = useOpzioni('articoli', form !== null)

  async function salva() {
    if (!form) return
    setBusy(true)
    const r = form.id ? await api(`/api/procedure/${form.id}`, { method: 'PUT', body: form.v }) : await api('/api/procedure', { body: form.v })
    setBusy(false)
    notify(r.ok, r.message)
    if (r.ok) {
      setForm(null)
      router.refresh()
    }
  }
  async function elimina(p: ProceduraRow) {
    if (!(await conferma(`Eliminare la fase "${p.NomeAttivita}"?`, `Articolo ${p.CodiceArticolo}. Gli ODP già creati non vengono modificati.`, 'Sì, elimina'))) return
    const r = await api(`/api/procedure/${p.IdProcedura}`, { method: 'DELETE' })
    notify(r.ok, r.message)
    if (r.ok) router.refresh()
  }
  async function generaMancanti() {
    const a = await api<{ anteprima: { articoli: number; G: number; B: number; generico: number; senzaAffilatura: number } }>('/api/articoli/genera-cicli')
    if (!a.ok) return notify(false, a.message)
    const p = a.anteprima
    if (p.articoli === 0) return notify(true, 'Tutti gli articoli hanno già un ciclo di lavoro.')
    const testo =
      `Articoli senza ciclo: ${p.articoli}. Verranno creati ${p.G} cicli G, ${p.B} cicli B e ${p.generico} cicli generici ` +
      `(Tornitura → Tratt. Termico → Rettifica → Affilatura → Finito)` +
      (p.senzaAffilatura ? `; ${p.senzaAffilatura} senza affilatura (parole HDRED, TIN, ...).` : '.')
    if (!(await conferma('Generare i cicli mancanti?', testo, 'Sì, genera'))) return
    setBusy(true)
    const r = await api('/api/articoli/genera-cicli', { method: 'POST' })
    setBusy(false)
    notify(r.ok, r.message)
    router.refresh()
  }
  async function apriSenzaAffilatura() {
    setAffil({ caricamento: true, parole: [], articoli: [] })
    const r = await api<{ parole: string[]; articoli: ArticoloAffilatura[] }>('/api/procedure/senza-affilatura')
    if (!r.ok) {
      setAffil(null)
      return notify(false, r.message)
    }
    setAffil({ caricamento: false, parole: r.parole, articoli: r.articoli })
  }
  async function togliAffilatura() {
    setBusy(true)
    const r = await api('/api/procedure/senza-affilatura', { method: 'POST' })
    setBusy(false)
    notify(r.ok, r.message)
    if (r.ok) {
      setAffil(null)
      router.refresh()
    }
  }
  const set = (k: keyof typeof vuoto) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => {
      if (!f) return f
      const v = { ...f.v, [k]: e.target.value }
      if (k === 'TipoAttivita') v.idMacchinaMagazzino = '0'
      if (k === 'idMacchinaMagazzino' && v.TipoAttivita === '1') {
        const m = macchine.find((x) => String(x.value) === e.target.value)
        v.idReparto = String((m?.reparto as number) ?? 0)
      }
      if (k === 'idMacchinaMagazzino' && v.TipoAttivita !== '1') v.idReparto = '0'
      return { ...f, v }
    })

  return (
    <>
      <div className="toolbar">
        <h2 className="page-title m-0">Cicli di lavoro (procedure)</h2>
        <div className="d-flex gap-2 flex-wrap">
          <form
            className="d-flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              router.push(filtro.trim() ? `/procedure?articolo=${encodeURIComponent(filtro.trim())}` : '/procedure')
            }}
          >
            <input className="form-control" placeholder="Codice articolo esatto" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
            <button className="btn btn-outline-secondary">Filtra</button>
          </form>
          <button className="btn btn-outline-secondary" disabled={busy} onClick={generaMancanti}>
            Genera cicli mancanti
          </button>
          <button className="btn btn-outline-secondary" disabled={busy} onClick={apriSenzaAffilatura}>
            Togli affilatura (HDRED, TIN...)
          </button>
          <button
            className="btn btn-grad px-4"
            onClick={() => {
              const stesse = rows.filter((r) => r.CodiceArticolo === (articolo || rows[0]?.CodiceArticolo))
              const next = articolo ? Math.max(0, ...stesse.map((r) => r.IncrementaleProcedura)) + 1 : 1
              setForm({ id: null, v: { ...vuoto, CodiceArticolo: articolo, IncrementaleProcedura: String(next) } })
            }}
          >
            Nuova fase
          </button>
        </div>
      </div>
      <DataTable
        rows={rows}
        rowKey={(r) => r.IdProcedura}
        pageSize={20}
        searchPlaceholder="Cerca per articolo, fase, macchina..."
        columns={[
          { key: 'art', header: 'Articolo', value: (r) => r.CodiceArticolo, render: (r) => <b>{r.CodiceArticolo}</b> },
          { key: 'inc', header: 'N.', value: (r) => r.IncrementaleProcedura },
          { key: 'nome', header: 'Attività', value: (r) => r.NomeAttivita },
          { key: 'tipo', header: 'Tipo', value: (r) => TipoAttivitaProceduraLabel[r.TipoAttivita] ?? String(r.TipoAttivita) },
          { key: 'ris', header: 'Macchina / Magazzino', value: (r) => r.Risorsa ?? `#${r.idMacchinaMagazzino}` },
          { key: 'rep', header: 'Reparto', value: (r) => r.NomeReparto ?? '-' },
          {
            key: 'az',
            header: '',
            className: 'dt-actions',
            render: (r) => (
              <>
                <button
                  className="btn-icon"
                  title="Modifica"
                  onClick={() =>
                    setForm({
                      id: r.IdProcedura,
                      v: {
                        CodiceArticolo: r.CodiceArticolo ?? '',
                        IncrementaleProcedura: String(r.IncrementaleProcedura),
                        TipoAttivita: String(r.TipoAttivita || 1),
                        NomeAttivita: r.NomeAttivita ?? '',
                        idReparto: String(r.idReparto),
                        idMacchinaMagazzino: String(r.idMacchinaMagazzino),
                      },
                    })
                  }
                >
                  <i className="fa-solid fa-pen-to-square" />
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
        title="Articoli che non vanno in affilatura"
        open={affil !== null}
        onClose={() => setAffil(null)}
        footer={
          affil && affil.articoli.some((a) => a.AttivitaAperte === 0) ? (
            <button className="btn btn-danger px-4" disabled={busy} onClick={togliAffilatura}>
              {busy ? 'Modifica in corso...' : `Togli affilatura da ${affil.articoli.filter((a) => a.AttivitaAperte === 0).length} cicli`}
            </button>
          ) : undefined
        }
      >
        {!affil || affil.caricamento ? (
          <div className="text-center py-4">
            <i className="fa fa-circle-notch fa-spin fa-2x" />
          </div>
        ) : (
          <>
            <p>
              Parole chiave (pannello Automazioni, <code>cicli.parole_senza_affilatura</code>): <b>{affil.parole.join(', ') || '-'}</b>. Cercate
              all&apos;inizio di una parola del codice o della descrizione dell&apos;articolo.
            </p>
            {affil.articoli.length === 0 ? (
              <p className="text-muted">Nessun ciclo esistente da modificare: gli articoli con queste parole non hanno la fase di affilatura.</p>
            ) : (
              <>
                <p className="text-muted small">
                  Dal ciclo di questi articoli vengono tolti l&apos;affilatura e il versamento nel magazzino Affilatura; le fasi seguenti vengono
                  rinumerate. Gli ODP già creati non cambiano: gli articoli con attività ancora aperte vengono saltati (si possono rifare più tardi).
                  Le fasi tolte restano registrate nell&apos;Audit.
                </p>
                <div style={{ maxHeight: '50vh', overflow: 'auto' }}>
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>Articolo</th>
                        <th>Descrizione</th>
                        <th>Parola</th>
                        <th>Fase tolta</th>
                        <th>ODP aperti</th>
                      </tr>
                    </thead>
                    <tbody>
                      {affil.articoli.map((a) => (
                        <tr key={a.CodiceArticolo} className={a.AttivitaAperte > 0 ? 'text-muted' : ''}>
                          <td><b>{a.CodiceArticolo}</b></td>
                          <td>{a.DescrizioneArticolo}</td>
                          <td>{a.Parola}</td>
                          <td>{a.FaseAffilatura}</td>
                          <td>{a.AttivitaAperte > 0 ? `${a.AttivitaAperte} attività: saltato` : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </Modal>
      <Modal
        title={form?.id ? 'Modifica fase' : 'Nuova fase'}
        open={form !== null}
        onClose={() => setForm(null)}
        footer={
          <button className="btn btn-grad px-4" disabled={busy} onClick={salva}>
            Salva
          </button>
        }
      >
        {form && (
          <>
            <div className="form-row">
              <div>
                <label>Codice Articolo</label>
                <input className="form-control" list="elenco-articoli" value={form.v.CodiceArticolo} onChange={set('CodiceArticolo')} />
                <datalist id="elenco-articoli">
                  {articoli.map((a) => (
                    <option key={a.value} value={a.label ?? ''} />
                  ))}
                </datalist>
              </div>
              <div>
                <label>Incrementale (ordine fase)</label>
                <input className="form-control" type="number" min="1" value={form.v.IncrementaleProcedura} onChange={set('IncrementaleProcedura')} />
              </div>
              <div>
                <label>Tipo attività</label>
                <select className="form-select" value={form.v.TipoAttivita} onChange={set('TipoAttivita')}>
                  <option value="1">Lavorazione (macchina)</option>
                  <option value="2">Versamento (magazzino)</option>
                  <option value="99">Conclusione</option>
                </select>
              </div>
            </div>
            <label className="small text-muted">Nome attività</label>
            <input className="form-control mb-2" value={form.v.NomeAttivita} onChange={set('NomeAttivita')} />
            <div className="form-row">
              <div>
                <label>{form.v.TipoAttivita === '2' ? 'Magazzino di versamento' : 'Macchina'}</label>
                <select className="form-select" value={form.v.idMacchinaMagazzino} onChange={set('idMacchinaMagazzino')}>
                  <option value="0">Selezionare Voce...</option>
                  {(form.v.TipoAttivita === '2' ? magazzini : macchine).map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Reparto</label>
                <select className="form-select" value={form.v.idReparto} onChange={set('idReparto')}>
                  <option value="0">-</option>
                  {reparti.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <p className="small text-muted">
              Il flusso di produzione alterna Lavorazione e Versamento: alla chiusura della fase N la merce viene caricata nel magazzino della fase N+1 e
              scaricata da quello della fase N-1.
            </p>
          </>
        )}
      </Modal>
    </>
  )
}
