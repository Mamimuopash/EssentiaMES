'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import DataTable from '@/components/DataTable'
import Modal from '@/components/Modal'
import { api, conferma, notify } from '@/components/client-api'
import { fmtDateTime } from '@/lib/format'

export interface RepartoRow {
  IdReparto: number
  NomeReparto: string | null
  DescrizioneReparto: string | null
  UltimaModifica_Data: Date | string | null
  UltimaModifica_Operatore: string | null
}

const vuoto = { NomeReparto: '', DescrizioneReparto: '' }

export default function Reparti({ rows }: { rows: RepartoRow[] }) {
  const router = useRouter()
  const [form, setForm] = useState<{ id: number | null; v: typeof vuoto } | null>(null)
  const [det, setDet] = useState<RepartoRow | null>(null)
  const [busy, setBusy] = useState(false)

  async function salva() {
    if (!form) return
    setBusy(true)
    const r = form.id ? await api(`/api/reparti/${form.id}`, { method: 'PUT', body: form.v }) : await api('/api/reparti', { body: form.v })
    setBusy(false)
    notify(r.ok, r.message)
    if (r.ok) {
      setForm(null)
      router.refresh()
    }
  }
  async function elimina(x: RepartoRow) {
    if (!(await conferma(`Eliminare il reparto "${x.NomeReparto}"?`, 'Operazione non reversibile.', 'Sì, elimina'))) return
    const r = await api(`/api/reparti/${x.IdReparto}`, { method: 'DELETE' })
    notify(r.ok, r.message)
    if (r.ok) router.refresh()
  }

  return (
    <>
      <DataTable
        rows={rows}
        rowKey={(r) => r.IdReparto}
        searchPlaceholder="Cerca Reparti"
        toolbar={
          <div className="d-flex align-items-center gap-3">
            <h2 className="page-title m-0">Dashboard Reparti</h2>
            <button className="btn btn-grad px-4" onClick={() => setForm({ id: null, v: { ...vuoto } })}>
              Crea Reparto
            </button>
          </div>
        }
        columns={[
          { key: 'nome', header: 'Nome Reparto', value: (r) => r.NomeReparto, render: (r) => <b>{r.NomeReparto}</b> },
          { key: 'descr', header: 'Descrizione Reparto', value: (r) => r.DescrizioneReparto },
          { key: 'data', header: 'Ultima Modifica', value: (r) => fmtDateTime(r.UltimaModifica_Data) },
          {
            key: 'az',
            header: '',
            className: 'dt-actions',
            render: (r) => (
              <>
                <button className="btn-icon" title="Modifica" onClick={() => setForm({ id: r.IdReparto, v: { NomeReparto: r.NomeReparto ?? '', DescrizioneReparto: r.DescrizioneReparto ?? '' } })}>
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
        title={form?.id ? 'Modifica Reparto' : 'Crea Reparto'}
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
            <label className="small text-muted">Nome Reparto</label>
            <input className="form-control mb-2" value={form.v.NomeReparto} onChange={(e) => setForm({ ...form, v: { ...form.v, NomeReparto: e.target.value } })} />
            <label className="small text-muted">Descrizione Reparto</label>
            <textarea className="form-control" rows={4} value={form.v.DescrizioneReparto} onChange={(e) => setForm({ ...form, v: { ...form.v, DescrizioneReparto: e.target.value } })} />
          </>
        )}
      </Modal>
      <Modal title="Dettagli Reparto" open={det !== null} size="md" onClose={() => setDet(null)}>
        {det && (
          <dl className="row">
            <dt className="col-5">Nome Reparto</dt>
            <dd className="col-7">{det.NomeReparto}</dd>
            <dt className="col-5">Descrizione</dt>
            <dd className="col-7">{det.DescrizioneReparto}</dd>
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
