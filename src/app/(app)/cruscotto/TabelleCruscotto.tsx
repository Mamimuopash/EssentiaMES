'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import DataTable from '@/components/DataTable'
import { api, notify } from '@/components/client-api'
import { fmtDateTimeShort, fmtNum } from '@/lib/format'
import { TipoStatoAttivita } from '@/lib/enums'
import type { GiacenzaScoperta, LottoAperto } from '@/lib/services/cruscotto'
import type { Attivita } from '@/lib/services/produzione'

export function TabelleCruscotto({ scoperte, ferme, lotti }: { scoperte: GiacenzaScoperta[]; ferme: Attivita[]; lotti: LottoAperto[] }) {
  const router = useRouter()
  return (
    <>
      <div className="panel" id="scoperte">
        <h5>Giacenze sotto scorta senza ordine in corso</h5>
        <div className="hint">Articoli sotto la scorta minima per cui non esiste già una proposta o un ordine.</div>
        {scoperte.length === 0 ? (
          <div className="empty-note">Tutto coperto: nessun articolo scoperto.</div>
        ) : (
          <DataTable
            rows={scoperte}
            rowKey={(r) => r.Id}
            pageSize={8}
            searchable={false}
            toolbar={
              <button
                className="btn btn-sm btn-primary"
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
              { key: 'a', header: 'Articolo', value: (r) => r.CodiceArticolo },
              { key: 'm', header: 'Magazzino', value: (r) => r.NomeMagazzino ?? r.CodiceMagazzino },
              { key: 'g', header: 'Giacenza', value: (r) => r.QuantitàGiacenza, render: (r) => fmtNum(r.QuantitàGiacenza) },
              { key: 'i', header: 'In arrivo', value: (r) => r.InPrevisioneEntrata, render: (r) => fmtNum(r.InPrevisioneEntrata) },
              { key: 's', header: 'Scorta min.', value: (r) => r.QuantitàSottoscorta, render: (r) => fmtNum(r.QuantitàSottoscorta) },
            ]}
          />
        )}
      </div>
      <div className="panel" id="ferme">
        <h5>Attività ferme</h5>
        <div className="hint">Lavorazioni sospese o bloccate in ordini che non possono avanzare.</div>
        {ferme.length === 0 ? (
          <div className="empty-note">Nessuna attività ferma.</div>
        ) : (
          <DataTable
            rows={ferme}
            rowKey={(r) => r.IdAttività}
            pageSize={8}
            searchable={false}
            columns={[
              { key: 'o', header: 'ODP', value: (r) => r.OrdineDiProduzione },
              { key: 'a', header: 'Articolo', value: (r) => r.CodiceArticolo },
              { key: 'f', header: 'Fase', value: (r) => r.NomeAttività },
              {
                key: 's',
                header: 'Stato',
                value: (r) => r.StatoAttività,
                render: (r) =>
                  r.StatoAttività === TipoStatoAttivita.StandBy ? (
                    <span className="badge" style={{ background: '#cf7a0c' }}>Sospesa</span>
                  ) : (
                    <span className="badge" style={{ background: '#6c7a89' }}>Bloccata</span>
                  ),
              },
              { key: 'd', header: 'Dal', value: (r) => fmtDateTimeShort(r.UltimaModifica_Data) },
            ]}
          />
        )}
      </div>
      <div className="panel">
        <h5>Lotti da seguire</h5>
        <div className="hint">Lotti ancora in attesa o inviati (non ancora ritornati).</div>
        {lotti.length === 0 ? (
          <div className="empty-note">Nessun lotto in sospeso.</div>
        ) : (
          <DataTable
            rows={lotti}
            rowKey={(r) => r.IdLotto}
            pageSize={8}
            searchable={false}
            columns={[
              { key: 'n', header: 'Lotto', value: (r) => r.NomeLotto },
              { key: 'a', header: 'ADL/ACL', value: (r) => r.CodiceADLACL },
              {
                key: 's',
                header: 'Stato',
                value: (r) => r.StatoLotto,
                render: (r) => (r.StatoLotto === 0 ? <span className="badge bg-warning text-dark">In attesa</span> : <span className="badge bg-primary">Inviato</span>),
              },
              { key: 'd', header: 'Aggiornato', value: (r) => fmtDateTimeShort(r.UltimaModifica_Data) },
              { key: 'x', header: '', render: () => <Link className="btn btn-sm btn-outline-secondary" href="/lotti">Apri</Link> },
            ]}
          />
        )}
      </div>
    </>
  )
}
