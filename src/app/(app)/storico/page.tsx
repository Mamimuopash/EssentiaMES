import { requirePageUser } from '@/lib/auth/auth'
import { storicoOrdini } from '@/lib/services/produzione'
import { elencoUtenti } from '@/lib/services/utenti'
import Storico from './Storico'

export const metadata = { title: 'Storico e utenti - EssentiaMES' }
export const dynamic = 'force-dynamic'

/** Storico ODP (ultimi 7 giorni) e gestione account (vecchi Home/Storico + Account/Utenti). */
export default async function StoricoPage() {
  const user = await requirePageUser({ admin: true })
  const [ordini, utenti] = await Promise.all([storicoOrdini(), elencoUtenti()])
  return <Storico ordini={ordini} utenti={utenti} meId={user.id} />
}
