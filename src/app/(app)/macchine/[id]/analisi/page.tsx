import { notFound } from 'next/navigation'
import { requirePageUser } from '@/lib/auth/auth'
import { fmtNum } from '@/lib/format'
import { analisiMacchina } from '@/lib/services/macchine'
import { GraficoEfficienza } from '@/components/Charts'
import Gauge from '@/components/Gauge'
import FiltroDate from './FiltroDate'

export const metadata = { title: 'Analisi macchina - EssentiaMES' }
export const dynamic = 'force-dynamic'

/** Analisi macchina (vecchia Macchine/Analisi): efficienza, produzione, coda e indicatori. */
export default async function AnalisiPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ periodo?: string; dateTimeUser?: string }>
}) {
  await requirePageUser({ admin: true })
  const { id } = await params
  const sp = await searchParams
  const a = await analisiMacchina(Number(id), sp.periodo ?? sp.dateTimeUser)
  if (!a) notFound()
  return (
    <>
      <div className="row MainTitleAccount align-items-end mb-3">
        <div className="col-md-6">
          <h1 className="TitleAccount">Macchina &quot;{a.NomeMacchina}&quot;</h1>
          <h4>
            Analisi <small className="text-muted fs-6">dal {a.Dal} al {a.Al}</small>
          </h4>
        </div>
        <div className="col-md-6">
          <FiltroDate idMacchina={a.IdMacchina} />
        </div>
      </div>
      <div className="row g-3">
        <div className="col-md-6">
          <div className="card cardAnalisi p-2">
            <div className="card-header">Grafico Efficienza (ultimi 7 giorni, turno 8h)</div>
            <GraficoEfficienza dati={a.ListaEff} />
          </div>
        </div>
        <div className="col-md-6">
          <div className="card cardAnalisi" style={{ height: '100%' }}>
            <div className="card-header title-card-fixed">Lista Produzione</div>
            <table className="table">
              <thead className="header-table-fixed">
                <tr>
                  <th>Articolo</th>
                  <th>Quantità Prodotta</th>
                  <th>Quantità Scartata</th>
                  <th>Tempo Prod.</th>
                </tr>
              </thead>
              <tbody>
                {a.ListaProduzione.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center text-muted">Nessun dato disponibile</td>
                  </tr>
                )}
                {a.ListaProduzione.map((p, i) => (
                  <tr key={i}>
                    <td>{p.Articolo}</td>
                    <td>{fmtNum(p.QuantitàProdotta)} pz</td>
                    <td>{fmtNum(p.QuantitàScartata)} pz</td>
                    <td>{p.TempoDiProduzione} minuti</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div className="row g-3 mt-1">
        <div className="col-md-6">
          <div className="card cardAnalisi" style={{ height: '100%' }}>
            <div className="card-header title-card-fixed">Attività in previsione</div>
            <table className="table">
              <thead className="header-table-fixed">
                <tr>
                  <th>Articolo</th>
                  <th>Quantità Da Produrre</th>
                  <th>Data Creazione</th>
                </tr>
              </thead>
              <tbody>
                {a.ListaPrevisione.length === 0 && (
                  <tr>
                    <td colSpan={3} className="text-center text-muted">Nessun dato disponibile</td>
                  </tr>
                )}
                {a.ListaPrevisione.map((p, i) => (
                  <tr key={i}>
                    <td>{p.Articolo}</td>
                    <td>{fmtNum(p.qtaProdurre)}</td>
                    <td>{p.DataCreazione}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="col-md-6">
          <div className="row g-3">
            {[
              { t: 'Coda di Produzione', v: a.GaugeCoda, f: `${a.GaugeCoda} in coda` },
              { t: 'Produzione Totale', v: a.GaugeProdotti, f: `${a.GaugeProdotti} pz prodotti` },
              { t: 'Scarto Totale', v: 100 - a.GaugeScartati, f: `${a.GaugeScartati} pz scartati` },
            ].map((g) => (
              <div className="col-md-4" key={g.t}>
                <div className="card cardAnalisi h-100">
                  <div className="card-header text-center">{g.t}</div>
                  <div className="gauge-wrap">
                    <Gauge value={g.v} />
                  </div>
                  <div className="card-footer text-center">{g.f}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
