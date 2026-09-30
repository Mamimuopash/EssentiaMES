import { route, reqInt } from '@/lib/api'
import { db } from '@/lib/db'
import { writeAudit, L } from '@/lib/audit'
import { parseBool } from '@/lib/services/impostazioni'

/** Attiva/disattiva un interruttore (Brighetti_Impostazioni/Toggle). */
export const POST = route<{ id: string }>({ admin: true, indirizzo: 'Brighetti_Impostazioni/Toggle' }, async ({ params, op }) => {
  const id = reqInt(params.id)
  const imp = await db.one<{ Chiave: string; Valore: string | null }>(`SELECT Chiave, Valore FROM dbo.Brighetti_Impostazioni WHERE Id = @id`, { id })
  if (!imp) return { ok: false, messaggio: 'Impostazione non trovata', message: 'Impostazione non trovata' }
  const attuale = parseBool(imp.Valore)
  await db.exec(
    `UPDATE dbo.Brighetti_Impostazioni SET Valore = @v, UltimaModifica_OperatoreID = @opId, UltimaModifica_Operatore = @opName, UltimaModifica_Data = @now WHERE Id = @id`,
    { id, v: attuale ? 'false' : 'true', opId: op.id, opName: op.name, now: new Date() },
  )
  await writeAudit(db, L.Warning, 'Brighetti_Impostazioni/Toggle', `Interruttore '${imp.Chiave}' impostato su ${!attuale ? 'ATTIVO' : 'SPENTO'}`,
    { Chiave: imp.Chiave, NuovoStato: !attuale }, op)
  return { ok: true, nuovoStato: !attuale, message: `${imp.Chiave}: ${!attuale ? 'ATTIVO' : 'SPENTO'}` }
})
