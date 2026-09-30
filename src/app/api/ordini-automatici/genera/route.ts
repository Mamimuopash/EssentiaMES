import { route } from '@/lib/api'
import { db } from '@/lib/db'
import { writeAudit, L } from '@/lib/audit'
import { generaProposte } from '@/lib/services/ordini-automatici'

/** Generazione manuale delle proposte (ignora l'interruttore, come nel vecchio software). */
export const POST = route({ admin: true, indirizzo: 'Brighetti_OrdiniAutomatici/Genera' }, async ({ op }) => {
  const esito = await generaProposte(op, { rispettaToggle: false, origine: 'Manuale' })
  await writeAudit(db, L.Info, 'Brighetti_OrdiniAutomatici/Genera', `Generazione manuale proposte di riordino: ${esito.Messaggio}`, esito, op)
  return { ok: true, message: esito.Messaggio, esito }
})
