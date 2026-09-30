import Link from 'next/link'
import { requirePageUser } from '@/lib/auth/auth'
import { db } from '@/lib/db'
import { Chiavi, leggiBool, leggiTesto } from '@/lib/services/impostazioni'
import OrdiniAutomatici, { type OrdineRow } from './OrdiniAutomatici'

export const metadata = { title: 'Ordini Automatici - EssentiaMES' }
export const dynamic = 'force-dynamic'

export default async function OrdiniAutomaticiPage() {
  await requirePageUser({ admin: true })
  const [righe, abilitato, prefissi] = await Promise.all([
    db.query<OrdineRow>(
      `SELECT o.Id, o.DataGenerazione, o.CodiceArticolo, o.CodiceMagazzino, m.CodiceMagazzino AS NomeMagazzino,
              CAST(o.[QuantitàGiacenza] AS FLOAT) AS Giacenza, CAST(o.ScortaMinima AS FLOAT) AS ScortaMinima, CAST(o.ScortaMassima AS FLOAT) AS ScortaMassima,
              o.LottoMinimo, CAST(o.[QuantitàProposta] AS FLOAT) AS Proposta, o.Origine, o.Stato, o.UltimaModifica_Operatore
         FROM dbo.Brighetti_OrdiniAutomatici o
         LEFT JOIN dbo.Brighetti_Magazzini m ON CAST(m.Id AS NVARCHAR(20)) = o.CodiceMagazzino
        ORDER BY o.DataGenerazione DESC`,
    ),
    leggiBool(Chiavi.OrdiniAutomaticiAbilitato),
    leggiTesto(Chiavi.OrdiniAutomaticiPrefissi, ''),
  ])
  return (
    <div style={{ marginTop: 24 }}>
      <h2 className="page-title mb-1">Proposte di riordino automatico</h2>
      <div className="text-muted mb-3">
        Stato automatismo:{' '}
        {abilitato ? (
          <span className="badge bg-success"><i className="fa-solid fa-circle-check" /> ATTIVO</span>
        ) : (
          <span className="badge bg-secondary"><i className="fa-solid fa-circle-pause" /> SPENTO</span>
        )}
        &nbsp;·&nbsp; Prefissi codice: <code>{prefissi || 'tutti'}</code>
        &nbsp;·&nbsp; <Link href="/automazioni">Configura nel pannello Automazioni</Link>
      </div>
      <OrdiniAutomatici righe={righe} />
    </div>
  )
}
