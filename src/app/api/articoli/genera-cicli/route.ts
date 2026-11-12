import { route } from '@/lib/api'
import { writeAudit, L } from '@/lib/audit'
import { db } from '@/lib/db'
import { anteprimaCicliMancanti, generaCicliMancanti } from '@/lib/services/cicli'

/** Quanti cicli verrebbero creati (nessuna modifica). */
export const GET = route({ admin: true, indirizzo: 'Brighetti_Articolo/GeneraCicliMancanti' }, async () => {
  return { ok: true, anteprima: await anteprimaCicliMancanti() }
})

/** Genera il ciclo completo (G, B o generico) per gli articoli senza procedure (vecchio ImbarazzanteCreazioneArticoli). */
export const POST = route({ admin: true, indirizzo: 'Brighetti_Articolo/GeneraCicliMancanti' }, async ({ op }) => {
  const r = await generaCicliMancanti(op)
  await writeAudit(db, L.Warning, 'Brighetti_Articolo/GeneraCicliMancanti', `Cicli generati: ${r.creati}, saltati: ${r.saltati}`, r, op)
  const extra = r.errori.length ? ` Attenzione: ${r.errori.slice(0, 3).join('; ')}` : ''
  return { ok: r.errori.length === 0 || r.creati > 0, message: `Cicli creati per ${r.creati} articoli.${extra}` }
})
