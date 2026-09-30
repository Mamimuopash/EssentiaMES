import { requirePageUser } from '@/lib/auth/auth'
import { db } from '@/lib/db'
import Reparti, { type RepartoRow } from './Reparti'

export const metadata = { title: 'Dashboard Reparti - EssentiaMES' }
export const dynamic = 'force-dynamic'

export default async function RepartiPage() {
  await requirePageUser({ admin: true })
  const rows = await db.query<RepartoRow>(
    `SELECT IdReparto, NomeReparto, DescrizioneReparto, UltimaModifica_Data, UltimaModifica_Operatore FROM dbo.Brighetti_Reparti ORDER BY IdReparto`,
  )
  return <Reparti rows={rows} />
}
