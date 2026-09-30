import { route } from '@/lib/api'
import { writeAudit, L } from '@/lib/audit'
import { db } from '@/lib/db'
import { generaCicliMancanti } from '@/lib/services/cicli'

/** Genera il ciclo generico per gli articoli senza procedure (vecchio ImbarazzanteCreazioneArticoli). */
export const POST = route({ admin: true, indirizzo: 'Brighetti_Articolo/GeneraCicliMancanti' }, async ({ op }) => {
  const r = await generaCicliMancanti(op)
  await writeAudit(db, L.Warning, 'Brighetti_Articolo/GeneraCicliMancanti', `Cicli generati: ${r.creati}, saltati: ${r.saltati}`, r, op)
  const extra = r.errori.length ? ` Attenzione: ${r.errori.slice(0, 3).join('; ')}` : ''
  return { ok: r.errori.length === 0 || r.creati > 0, message: `Cicli creati per ${r.creati} articoli.${extra}` }
})
