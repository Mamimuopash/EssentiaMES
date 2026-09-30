import Link from 'next/link'
import { requirePageUser } from '@/lib/auth/auth'
import { datiCruscotto } from '@/lib/services/cruscotto'
import { TabelleCruscotto } from './TabelleCruscotto'

export const metadata = { title: 'Centro di Controllo - EssentiaMES' }
export const dynamic = 'force-dynamic'

/** Centro di Controllo (vecchio Brighetti_Cruscotto): cosa richiede attenzione o e' fermo. */
export default async function CruscottoPage() {
  await requirePageUser({ admin: true })
  const m = await datiCruscotto()
  const kpi = (n: number, colore: string, label: string, href: string) => (
    <Link className={`kpi ${n > 0 ? colore : 'zero'}`} href={href}>
      <div className="n">{n}</div>
      <div className="l">{label}</div>
    </Link>
  )
  return (
    <div className="cruscotto">
      <style>{`
        .cruscotto { padding: 22px 0 60px; }
        .cruscotto h2 { font-weight: 700; letter-spacing: -.5px; }
        .cruscotto .sub { color: #7f8c8d; margin-bottom: 22px; }
        .cruscotto .kpi-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 28px; }
        .cruscotto .kpi { border-radius: 14px; padding: 16px 18px; color: #fff; text-decoration: none; display: block; transition: transform .12s ease; }
        .cruscotto .kpi:hover { transform: translateY(-2px); color: #fff; }
        .cruscotto .kpi .n { font-size: 2.1rem; font-weight: 800; line-height: 1; }
        .cruscotto .kpi .l { font-size: .78rem; text-transform: uppercase; letter-spacing: .04em; opacity: .92; margin-top: 6px; }
        .cruscotto .kpi.red { background: #c0392b; } .cruscotto .kpi.amber { background: #cf7a0c; }
        .cruscotto .kpi.slate { background: #2c3e50; } .cruscotto .kpi.muted { background: #6c7a89; }
        .cruscotto .kpi.zero { background: #95a5a6; opacity: .6; }
        .cruscotto .panel { background: #fff; border: 1px solid #ececec; border-radius: 14px; padding: 18px 20px; margin-bottom: 22px; }
        .cruscotto .panel h5 { font-weight: 700; margin-bottom: 4px; }
        .cruscotto .panel .hint { color: #95a5a6; font-size: .82rem; margin-bottom: 14px; }
        .cruscotto .flow { display: flex; align-items: stretch; overflow-x: auto; padding: 6px 2px 2px; }
        .cruscotto .stage { flex: 1 1 0; min-width: 104px; display: flex; align-items: stretch; }
        .cruscotto .stage .card { flex: 1; background: #f7f9fa; border: 1px solid #e7ecef; border-radius: 12px; padding: 14px 10px 12px; text-align: center; display: flex; flex-direction: column; }
        .cruscotto .stage .card .cnt { font-size: 1.6rem; font-weight: 800; color: #2c3e50; line-height: 1; }
        .cruscotto .stage .card .nm { font-size: .72rem; color: #5a6b7b; margin-top: 8px; line-height: 1.15; min-height: 2.3em; display: flex; align-items: center; justify-content: center; word-break: break-word; }
        .cruscotto .stage .card .load { height: 5px; border-radius: 3px; background: #e4e9ec; margin-top: 10px; overflow: hidden; }
        .cruscotto .stage .card .load > span { display: block; height: 100%; background: linear-gradient(90deg,#3d566e,#2c3e50); border-radius: 3px; }
        .cruscotto .stage.empty .card { opacity: .55; } .cruscotto .stage.empty .card .cnt { color: #9aa7b1; }
        .cruscotto .stage .arrow { color: #cdd6dd; align-self: center; padding: 0 6px; flex: 0 0 auto; }
        .cruscotto .stage:last-child .arrow { display: none; }
        .cruscotto .empty-note { color: #27ae60; font-weight: 600; }
      `}</style>
      <h2>Centro di Controllo</h2>
      <div className="sub">Stato di produzione, scorte e ordini in un&apos;unica pagina.</div>
      <div className="kpi-row">
        {kpi(m.GiacenzeScoperte, 'red', 'Sotto scorta senza ordine', '#scoperte')}
        {kpi(m.OdpFermi, 'red', 'ODP fermi', '#ferme')}
        {kpi(m.ProposteAperte, 'amber', 'Proposte da valutare', '/ordini-automatici')}
        {kpi(m.AttivitaStandBy, 'amber', 'Attività sospese', '#ferme')}
        {kpi(m.OrdiniConfermati, 'slate', 'Ordini in arrivo', '/ordini-automatici')}
        {kpi(m.LottiNonRitornati, 'slate', 'Lotti non ritornati', '/lotti')}
        <a className="kpi muted" href="#ferme">
          <div className="n">{m.AttivitaBloccate}</div>
          <div className="l">Fasi in attesa</div>
        </a>
      </div>
      <div className="panel">
        <h5>Flusso di produzione</h5>
        <div className="hint">Attività attive per reparto: dove si trova il materiale lungo la linea.</div>
        {m.Flusso.length === 0 ? (
          <div className="empty-note">Nessun reparto configurato.</div>
        ) : (
          <div className="flow">
            {m.Flusso.map((s, i) => (
              <div className={`stage ${s.Conteggio === 0 ? 'empty' : ''}`} key={i}>
                <div className="card">
                  <div className="cnt">{s.Conteggio}</div>
                  <div className="nm">{s.NomeReparto}</div>
                  <div className="load">
                    <span style={{ width: `${Math.round((s.Conteggio / m.FlussoMax) * 100)}%` }} />
                  </div>
                </div>
                <i className="fa-solid fa-chevron-right arrow" />
              </div>
            ))}
          </div>
        )}
      </div>
      <TabelleCruscotto scoperte={m.Scoperte} ferme={m.AttivitaFerme} lotti={m.LottiAperti} />
    </div>
  )
}
