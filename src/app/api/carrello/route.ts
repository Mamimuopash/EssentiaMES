import { route, readJson, int, ApiError } from '@/lib/api'
import { aggiungiAlCarrello } from '@/lib/services/richieste'

/** Aggiunge un articolo alla richiesta materiali (Home/InserisciArticoloDaOrdinare). */
export const POST = route({ indirizzo: 'Home/InserisciArticoloDaOrdinare' }, async ({ req, op }) => {
  const b = await readJson<{ id?: unknown; qta?: unknown }>(req)
  const id = int(b.id)
  const qta = int(b.qta)
  if (!id) throw new ApiError(400, 'Articolo non valido.')
  if (qta < 1) return { ok: false, message: "La quantita' deve essere almeno di 1 pezzo." }
  await aggiungiAlCarrello(id, qta, op)
  return { ok: true, message: 'Articolo correttamente inserito nel carrello.' }
})
