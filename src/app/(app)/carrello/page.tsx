import { requirePageUser } from '@/lib/auth/auth'
import { articoliRichiedibili, carrello } from '@/lib/services/richieste'
import Carrello from './Carrello'

export const metadata = { title: 'Richiesta materiali - EssentiaMES' }
export const dynamic = 'force-dynamic'

/** Richiesta materiali (vecchi Home/Index catalogo + Home/Carrello). */
export default async function CarrelloPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requirePageUser()
  const { q } = await searchParams
  const [righe, catalogo] = await Promise.all([carrello(user.id), articoliRichiedibili(q)])
  return <Carrello righe={righe} catalogo={catalogo} q={q ?? ''} isAdmin={user.isAdmin} />
}
