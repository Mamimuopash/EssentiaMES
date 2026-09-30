import { route } from '@/lib/api'
import { sincronizzaDaConfigurazione } from '@/lib/services/mexal'

/** Sincronizza subito dal file configurato (Brighetti_Sync/EseguiOra). */
export const POST = route({ admin: true, indirizzo: 'Brighetti_Sync/EseguiOra' }, async ({ op }) => {
  const e = await sincronizzaDaConfigurazione(op, false)
  return { ok: e.Ok, message: e.Messaggio, esito: e }
})
