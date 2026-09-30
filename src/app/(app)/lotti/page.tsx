import { requirePageUser } from '@/lib/auth/auth'
import { db } from '@/lib/db'
import Lotti, { type LottoRow } from './Lotti'

export const metadata = { title: 'Dashboard Lotti - EssentiaMES' }
export const dynamic = 'force-dynamic'

export default async function LottiPage() {
  await requirePageUser({ admin: true })
  const rows = await db.query<LottoRow>(
    `SELECT l.IdLotto, l.NomeLotto, l.DescrizioneLotto, l.StatoLotto, l.CodiceADLACL, l.Fornitore, l.TipologiaLotto, l.UltimaModifica_Data,
            (SELECT COUNT(*) FROM dbo.Brighetti_Lotti_Articoli la WHERE la.IdLotto = l.IdLotto) AS NumArticoli
       FROM dbo.Brighetti_Lotti l ORDER BY l.StatoLotto, l.UltimaModifica_Data DESC`,
  )
  return <Lotti rows={rows} />
}
