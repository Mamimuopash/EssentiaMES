'use client'

import { useRouter } from 'next/navigation'
import DataTable from '@/components/DataTable'
import { api, notify } from '@/components/client-api'
import { fmtDateTimeShort, fmtNum } from '@/lib/format'
import { StatoOrdineAutomatico, StatoOrdineAutomaticoLabel } from '@/lib/enums'

export interface OrdineRow {
  Id: number
  DataGenerazione: Date | string
  CodiceArticolo: string | null
  CodiceMagazzino: string | null
  NomeMagazzino: string | null
  Giacenza: number
  ScortaMinima: number
  ScortaMassima: number
  LottoMinimo: number
  Proposta: number
  Origine: string | null
  Stato: number
  UltimaModifica_Operatore: string | null
}

const BADGE: Record<number, string> = { 0: 'bg-warning text-dark', 1: 'bg-success', 2: 'bg-danger', 3: 'bg-primary', 4: 'bg-secondary' }

export default function OrdiniAutomatici({ righe }: { righe: OrdineRow[] }) {
  const router = useRouter()
  async function azione(id: number, azione: 'conferma' | 'annulla' | 'evaso') {
    const r = await api(`/api/ordini-automatici/${id}`, { body: { azione } })
    notify(r.ok, r.message)
    router.refresh()
  }
  return (
    <DataTable
      rows={righe}
      rowKey={(r) => r.Id}
      pageSize={15}
      searchPlaceholder="Cerca articolo, stato..."
      empty='Nessuna proposta di riordino al momento. Premi "Genera proposte ora" oppure attendi la generazione pianificata.'
      toolbar={
        <button
          className="btn btn-primary"
          onClick={async () => {
            const r = await api('/api/ordini-automatici/genera', { method: 'POST' })
            notify(r.ok, r.message)
            router.refresh()
          }}
        >
          <i className="fa-solid fa-rotate" /> Genera proposte ora
        </button>
      }
      columns={[
        { key: 'd', header: 'Data', value: (r) => new Date(r.DataGenerazione).getTime(), render: (r) => fmtDateTimeShort(r.DataGenerazione) },
        { key: 'a', header: 'Codice Articolo', value: (r) => r.CodiceArticolo, render: (r) => <strong>{r.CodiceArticolo}</strong> },
        { key: 'm', header: 'Magazzino', value: (r) => r.NomeMagazzino ?? r.CodiceMagazzino },
        { key: 'g', header: 'Giacenza', value: (r) => r.Giacenza, render: (r) => fmtNum(r.Giacenza) },
        { key: 'smin', header: 'Scorta Min.', value: (r) => r.ScortaMinima, render: (r) => fmtNum(r.ScortaMinima) },
        { key: 'smax', header: 'Scorta Max.', value: (r) => r.ScortaMassima, render: (r) => fmtNum(r.ScortaMassima) },
        { key: 'l', header: 'Lotto Min.', value: (r) => r.LottoMinimo },
        { key: 'p', header: 'Q.tà Proposta', value: (r) => r.Proposta, render: (r) => <strong>{fmtNum(r.Proposta)}</strong> },
        { key: 'o', header: 'Origine', value: (r) => r.Origine, render: (r) => <span className="badge bg-light text-dark border">{r.Origine}</span> },
        {
          key: 's',
          header: 'Stato',
          value: (r) => StatoOrdineAutomaticoLabel[r.Stato],
          render: (r) => <span className={`badge ${BADGE[r.Stato] ?? 'bg-secondary'}`}>{StatoOrdineAutomaticoLabel[r.Stato]}</span>,
        },
        {
          key: 'az',
          header: 'Azioni',
          className: 'dt-actions',
          render: (r) =>
            r.Stato === StatoOrdineAutomatico.Proposto ? (
              <>
                <button className="btn btn-sm btn-success" onClick={() => azione(r.Id, 'conferma')}>
                  <i className="fa-solid fa-check" /> Conferma
                </button>{' '}
                <button className="btn btn-sm btn-outline-danger" onClick={() => azione(r.Id, 'annulla')}>
                  <i className="fa-solid fa-xmark" /> Annulla
                </button>
              </>
            ) : r.Stato === StatoOrdineAutomatico.Confermato ? (
              <button className="btn btn-sm btn-outline-secondary" onClick={() => azione(r.Id, 'evaso')}>
                <i className="fa-solid fa-box" /> Segna evaso
              </button>
            ) : (
              <span className="text-muted">—</span>
            ),
        },
      ]}
    />
  )
}
