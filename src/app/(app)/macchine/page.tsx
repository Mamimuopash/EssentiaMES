import { requirePageUser } from '@/lib/auth/auth'
import { db } from '@/lib/db'
import Macchine, { type MacchinaRow } from './Macchine'

export const metadata = { title: 'Dashboard Macchine - EssentiaMES' }
export const dynamic = 'force-dynamic'

export default async function MacchinePage() {
  await requirePageUser({ admin: true })
  const rows = await db.query<MacchinaRow>(
    `SELECT m.IdMacchina, m.NomeMacchina, m.DescrizioneMacchina, m.IdReparto, r.NomeReparto, m.IdUtente, u.UserName AS NomeUtente,
            m.TipologiaMacchina, m.CollegamentoMacchina, m.UltimaModifica_Data
       FROM dbo.Brighetti_Macchine m
       LEFT JOIN dbo.Brighetti_Reparti r ON r.IdReparto = m.IdReparto
       LEFT JOIN dbo.AspNetUsers u ON u.Id = m.IdUtente
      ORDER BY m.NomeMacchina`,
  )
  return <Macchine rows={rows} />
}
