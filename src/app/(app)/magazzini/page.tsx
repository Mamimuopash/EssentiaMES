import { requirePageUser } from '@/lib/auth/auth'
import { db } from '@/lib/db'
import Magazzini, { type MagazzinoRow } from './Magazzini'

export const metadata = { title: 'Gestione Magazzini - EssentiaMES' }
export const dynamic = 'force-dynamic'

export default async function MagazziniPage() {
  await requirePageUser({ admin: true })
  const rows = await db.query<MagazzinoRow>(
    `SELECT Id, CodiceMagazzino, DescrizioneMagazzino, TipologiaMagazzino, UltimaModifica_Data, UltimaModifica_Operatore
       FROM dbo.Brighetti_Magazzini ORDER BY CodiceMagazzino`,
  )
  return <Magazzini rows={rows} />
}
