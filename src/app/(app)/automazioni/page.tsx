import { requirePageUser } from '@/lib/auth/auth'
import { assicuraDefault, elenco } from '@/lib/services/impostazioni'
import Automazioni from './Automazioni'

export const metadata = { title: 'Automazioni - EssentiaMES' }
export const dynamic = 'force-dynamic'

/** Pannello Automazioni (vecchio Brighetti_Impostazioni). */
export default async function AutomazioniPage() {
  await requirePageUser({ admin: true })
  await assicuraDefault()
  const lista = await elenco()
  const gruppi: { Categoria: string; Impostazioni: typeof lista }[] = []
  for (const i of lista) {
    const c = i.Categoria ?? 'Generale'
    let g = gruppi.find((x) => x.Categoria === c)
    if (!g) gruppi.push((g = { Categoria: c, Impostazioni: [] }))
    g.Impostazioni.push(i)
  }
  const scheduler = !['0', 'false', 'no', 'off'].includes((process.env.SCHEDULER_ENABLED || 'true').toLowerCase())
  return <Automazioni gruppi={gruppi} schedulerAttivo={scheduler} />
}
