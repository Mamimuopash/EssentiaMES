'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import DataTable from '@/components/DataTable'
import Modal from '@/components/Modal'
import { api, conferma, notify } from '@/components/client-api'
import { fmtDateTime } from '@/lib/format'
import { TipoMagazzinoLabel } from '@/lib/enums'

export interface MagazzinoRow {
  Id: number
  CodiceMagazzino: string | null
  DescrizioneMagazzino: string | null
  TipologiaMagazzino: number
  UltimaModifica_Data: Date | string | null
  UltimaModifica_Operatore: string | null
}

const vuoto = { CodiceMagazzino: '', DescrizioneMagazzino: '', TipologiaMagazzino: '0' }

export default function Magazzini({ rows }: { rows: MagazzinoRow[] }) {
  const router = useRouter()
  const [form, setForm] = useState<{ id: number | null; v: typeof vuoto } | null>(null)
  const [det, setDet] = useState<MagazzinoRow | null>(null)
  const [busy, setBusy] = useState(false)

  async function salva() {
    if (!form) return
    setBusy(true)
    const r = form.id ? await api(`/api/magazzini/${form.id}`, { method: 'PUT', body: form.v }) : await api('/api/magazzini', { body: form.v })
    setBusy(false)
    notify(r.ok, r.message)
    if (r.ok) {
      setForm(null)
      router.refresh()
    }
  }
  async function elimina(m: MagazzinoRow) {
    if (!(await conferma(`Eliminare il magazzino "${m.CodiceMagazzino}"?`, 'Le giacenze e i cicli che lo usano non verranno modificati.', 'Sì, elimina'))) return
    const r = await api(`/api/magazzini/${m.Id}`, { method: 'DELETE' })
    notify(r.ok, r.message)
    if (r.ok) router.refresh()
  }
  const set = (k: keyof typeof vuoto) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => (f ? { ...f, v: { ...f.v, [k]: e.target.value } } : f))

  return (
    <>
      <DataTable
        rows={rows}
        rowKey={(r) => r.Id}
        searchPlaceholder="Cerca Magazzini"
        toolbar={
          <div className="d-flex align-items-center gap-3">
            <h2 className="page-title m-0">Dashboard Magazzini</h2>
            <button className="btn btn-grad px-4" onClick={() => setForm({ id: null, v: { ...vuoto } })}>
              Crea Magazzino
            </button>
          </div>
        }
        columns={[
          { key: 'cod', header: 'Codice Magazzino', value: (r) => r.CodiceMagazzino, render: (r) => <b>{r.CodiceMagazzino}</b> },
          { key: 'descr', header: 'Descrizione Magazzino', value: (r) => r.DescrizioneMagazzino },
          { key: 'tipo', header: 'Tipo Magazzino', value: (r) => TipoMagazzinoLabel[r.TipologiaMagazzino] },
          { key: 'data', header: 'Ultima Modifica', value: (r) => fmtDateTime(r.UltimaModifica_Data) },
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
                    setForm({ id: r.Id, v: { CodiceMagazzino: r.CodiceMagazzino ?? '', DescrizioneMagazzino: r.DescrizioneMagazzino ?? '', TipologiaMagazzino: String(r.TipologiaMagazzino) } })
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
        title={form?.id ? 'Modifica Magazzino' : 'Crea Magazzino'}
        open={form !== null}
        size="md"
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
                <label>Codice Magazzino</label>
                <input className="form-control" value={form.v.CodiceMagazzino} onChange={set('CodiceMagazzino')} />
              </div>
              <div>
                <label>Tipo Magazzino</label>
                <select className="form-select" value={form.v.TipologiaMagazzino} onChange={set('TipologiaMagazzino')}>
                  <option value="0">Magazzino interno</option>
                  <option value="1">Magazzino conto lavoro (semilavorati)</option>
                </select>
              </div>
            </div>
            <label className="small text-muted">Descrizione Magazzino</label>
            <input className="form-control" value={form.v.DescrizioneMagazzino} onChange={set('DescrizioneMagazzino')} />
            <p className="small text-muted mt-2">
              Attenzione: i cicli di lavoro automatici cercano i magazzini per nome (es. &quot;Magazzino Finito&quot;).
            </p>
          </>
        )}
      </Modal>
      <Modal title="Dettagli Magazzino" open={det !== null} size="md" onClose={() => setDet(null)}>
        {det && (
          <dl className="row">
            <dt className="col-5">Codice</dt>
            <dd className="col-7">{det.CodiceMagazzino}</dd>
            <dt className="col-5">Descrizione</dt>
            <dd className="col-7">{det.DescrizioneMagazzino}</dd>
            <dt className="col-5">Tipo</dt>
            <dd className="col-7">{TipoMagazzinoLabel[det.TipologiaMagazzino]}</dd>
            <dt className="col-5">Id (usato nelle giacenze)</dt>
            <dd className="col-7">{det.Id}</dd>
            <dt className="col-5">Ultima modifica</dt>
            <dd className="col-7">
              {fmtDateTime(det.UltimaModifica_Data)} {det.UltimaModifica_Operatore}
            </dd>
          </dl>
        )}
      </Modal>
    </>
  )
}
