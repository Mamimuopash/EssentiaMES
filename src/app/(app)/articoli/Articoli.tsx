'use client'

import { useState } from 'react'
import Link from 'next/link'
import ServerTable from '@/components/ServerTable'
import Modal from '@/components/Modal'
import Stars from '@/components/Stars'
import { api, notify } from '@/components/client-api'
import { useOpzioni } from '@/components/useOpzioni'
import { AzioniNoteFile, ListaDocumenti, ListaNote, type DocumentoView, type NotaView } from '@/components/NoteDocumenti'
import { fmtDate, fmtDateTime } from '@/lib/format'
import { ImportanzaLabel, TipoAttivitaProceduraLabel, TipoElemento } from '@/lib/enums'

interface ArticoloRow {
  Id: number
  CodiceArticolo: string
  DescrizioneArticolo: string | null
  NoteArticolo: string | null
  Importanza: number
  FamigliaId: number
  Famiglia: string
  LottoMinimo: number
  UltimaModifica_Data: string | null
}

interface Dettaglio {
  articolo: ArticoloRow & { UltimaModifica_Operatore: string | null }
  note: NotaView[]
  documenti: DocumentoView[]
  procedure: { IdProcedura: number; IncrementaleProcedura: number; NomeAttività: string | null; TipoAttivita: number }[]
}

const vuoto = { CodiceArticolo: '', DescrizioneArticolo: '', NoteArticolo: '', FamigliaId: '0', Importanza: '1', LottoMinimo: '0' }

export default function Articoli() {
  const [refresh, setRefresh] = useState(0)
  const [form, setForm] = useState<{ id: number | null; v: typeof vuoto } | null>(null)
  const [det, setDet] = useState<Dettaglio | null>(null)
  const [tab, setTab] = useState<'dett' | 'note' | 'doc' | 'ciclo'>('dett')
  const [busy, setBusy] = useState(false)
  const famiglie = useOpzioni('famiglie', form !== null)
  const reload = () => setRefresh((x) => x + 1)

  async function apriDettaglio(id: number) {
    const r = await api<Dettaglio>(`/api/articoli/${id}`)
    if (!r.ok) return notify(false, r.message)
    setDet(r)
  }
  async function salva() {
    if (!form) return
    setBusy(true)
    const r = form.id ? await api(`/api/articoli/${form.id}`, { method: 'PUT', body: form.v }) : await api('/api/articoli', { body: form.v })
    setBusy(false)
    notify(r.ok, r.message)
    if (r.ok) {
      setForm(null)
      reload()
    }
  }
  const set = (k: keyof typeof vuoto) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => (f ? { ...f, v: { ...f.v, [k]: e.target.value } } : f))

  return (
    <>
      <div className="toolbar">
        <h2 className="page-title m-0">Dashboard Articoli</h2>
        <button className="btn btn-grad px-4" onClick={() => setForm({ id: null, v: { ...vuoto } })}>
          Crea Articolo
        </button>
      </div>
      <ServerTable<ArticoloRow>
        endpoint="/api/articoli"
        refreshKey={refresh}
        rowKey={(r) => r.Id}
        searchPlaceholder="Cerca articoli (codice o descrizione)"
        defaultSort={{ key: 'codice', dir: 'asc' }}
        columns={[
          { key: 'codice', header: 'Codice Articolo', sortKey: 'codice', render: (r) => <b>{r.CodiceArticolo}</b> },
          { key: 'descr', header: 'Descrizione Articolo', sortKey: 'descrizione', render: (r) => r.DescrizioneArticolo },
          { key: 'imp', header: 'Importanza', sortKey: 'importanza', render: (r) => <Stars value={r.Importanza} /> },
          { key: 'fam', header: 'Famiglia Prodotto', sortKey: 'famiglia', render: (r) => r.Famiglia },
          { key: 'lotto', header: 'Lotto Min.', sortKey: 'lotto', render: (r) => r.LottoMinimo },
          { key: 'data', header: 'Ultima Modifica', sortKey: 'data', render: (r) => fmtDate(r.UltimaModifica_Data) },
          {
            key: 'az',
            header: 'Azioni',
            className: 'dt-actions',
            render: (r) => (
              <>
                <button
                  className="btn-icon"
                  title="Modifica"
                  onClick={() =>
                    setForm({
                      id: r.Id,
                      v: {
                        CodiceArticolo: r.CodiceArticolo ?? '',
                        DescrizioneArticolo: r.DescrizioneArticolo ?? '',
                        NoteArticolo: r.NoteArticolo ?? '',
                        FamigliaId: String(r.FamigliaId ?? 0),
                        Importanza: String(r.Importanza || 1),
                        LottoMinimo: String(r.LottoMinimo ?? 0),
                      },
                    })
                  }
                >
                  <i className="fa-solid fa-pen-to-square" />
                </button>{' '}
                <AzioniNoteFile id={r.Id} type={TipoElemento.Articolo} />{' '}
                <button className="btn-icon" title="Dettagli" onClick={() => { setTab('dett'); void apriDettaglio(r.Id) }}>
                  <i className="fa-solid fa-magnifying-glass" />
                </button>
              </>
            ),
          },
        ]}
      />

      <Modal
        title={form?.id ? 'Modifica Articolo' : 'Crea Articolo'}
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
                <input className="form-control" value={form.v.CodiceArticolo} onChange={set('CodiceArticolo')} />
              </div>
              <div>
                <label>Descrizione Articolo</label>
                <input className="form-control" value={form.v.DescrizioneArticolo} onChange={set('DescrizioneArticolo')} />
              </div>
            </div>
            <div className="form-row">
              <div>
                <label>Importanza</label>
                <select className="form-select" value={form.v.Importanza} onChange={set('Importanza')}>
                  {Object.entries(ImportanzaLabel).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Famiglia Prodotto</label>
                <select className="form-select" value={form.v.FamigliaId} onChange={set('FamigliaId')}>
                  <option value="0">Selezionare Voce...</option>
                  {famiglie.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Lotto Minimo</label>
                <input className="form-control" type="number" min="0" value={form.v.LottoMinimo} onChange={set('LottoMinimo')} />
              </div>
            </div>
            <div>
              <label className="small text-muted">Note Articolo</label>
              <textarea className="form-control" rows={5} value={form.v.NoteArticolo} onChange={set('NoteArticolo')} />
            </div>
            {!form.id && (
              <p className="text-muted small mt-2">
                Per i codici che iniziano con G / GT / GP / PCM / SG... o che contengono B viene creato automaticamente il ciclo di lavoro standard.
              </p>
            )}
          </>
        )}
      </Modal>

      <Modal title="Dettagli Articolo" open={det !== null} onClose={() => setDet(null)}>
        {det && (
          <>
            <ul className="nav nav-pills mb-3">
              {(
                [
                  ['dett', 'Dettagli', null],
                  ['note', 'Note', det.note.length],
                  ['doc', 'Documenti', det.documenti.length],
                  ['ciclo', 'Ciclo', det.procedure.length],
                ] as const
              ).map(([k, l, n]) => (
                <li className="nav-item" key={k}>
                  <button className={`nav-link ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>
                    {l} {n !== null && <span className="badge rounded-pill bg-danger">{n}</span>}
                  </button>
                </li>
              ))}
            </ul>
            {tab === 'dett' && (
              <dl className="row">
                <dt className="col-sm-4">Codice Articolo</dt>
                <dd className="col-sm-8">{det.articolo.CodiceArticolo}</dd>
                <dt className="col-sm-4">Importanza</dt>
                <dd className="col-sm-8">{ImportanzaLabel[det.articolo.Importanza] ?? det.articolo.Importanza}</dd>
                <dt className="col-sm-4">Descrizione Articolo</dt>
                <dd className="col-sm-8">{det.articolo.DescrizioneArticolo}</dd>
                <dt className="col-sm-4">Famiglia</dt>
                <dd className="col-sm-8">{det.articolo.Famiglia ?? '-'}</dd>
                <dt className="col-sm-4">Lotto Minimo</dt>
                <dd className="col-sm-8">{det.articolo.LottoMinimo}</dd>
                <dt className="col-sm-4">Note Articolo</dt>
                <dd className="col-sm-8" style={{ whiteSpace: 'pre-wrap' }}>{det.articolo.NoteArticolo}</dd>
                <dt className="col-sm-4">Ultima modifica</dt>
                <dd className="col-sm-8">
                  {fmtDateTime(det.articolo.UltimaModifica_Data)} - {det.articolo.UltimaModifica_Operatore}
                </dd>
              </dl>
            )}
            {tab === 'note' && <ListaNote note={det.note} onChange={() => apriDettaglio(det.articolo.Id)} />}
            {tab === 'doc' && <ListaDocumenti documenti={det.documenti} onChange={() => apriDettaglio(det.articolo.Id)} />}
            {tab === 'ciclo' && (
              <>
                <ul className="list-group">
                  {det.procedure.map((p) => (
                    <li className="list-group-item d-flex justify-content-between" key={p.IdProcedura}>
                      <span>
                        {p.IncrementaleProcedura}. {p.NomeAttività}
                      </span>
                      <span className="chip">{TipoAttivitaProceduraLabel[p.TipoAttivita] ?? p.TipoAttivita}</span>
                    </li>
                  ))}
                  {det.procedure.length === 0 && <li className="list-group-item text-muted">Nessuna fase definita.</li>}
                </ul>
                <Link className="btn btn-sm btn-outline-primary mt-2" href={`/procedure?articolo=${encodeURIComponent(det.articolo.CodiceArticolo)}`}>
                  Gestisci ciclo
                </Link>
              </>
            )}
          </>
        )}
      </Modal>
    </>
  )
}
