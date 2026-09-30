import { route } from '@/lib/api'
import { inviaRichiesta } from '@/lib/services/richieste'

export const POST = route({ indirizzo: 'Home/InviaRichiestaAmministratore' }, async ({ op }) => {
  const r = await inviaRichiesta(op)
  if (r.articoli === 0) return { ok: false, message: 'Il carrello è vuoto.' }
  return { ok: true, message: 'La richiesta dei materiali è stata inoltrata con successo.', ...r }
})
