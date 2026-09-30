import { route, readJson, str } from '@/lib/api'
import { db } from '@/lib/db'
import { writeAudit, L } from '@/lib/audit'
import { TipoImpostazione } from '@/lib/enums'

/** Salva i parametri testuali/numerici (Brighetti_Impostazioni/Salva). Gli interruttori usano /toggle. */
export const PUT = route({ admin: true, indirizzo: 'Brighetti_Impostazioni/Salva' }, async ({ req, op }) => {
  const b = await readJson<{ valori?: Record<string, unknown> }>(req)
  const valori = b.valori || {}
  const now = new Date()
  const imp = await db.query<{ Id: number }>(`SELECT Id FROM dbo.Brighetti_Impostazioni WHERE Tipo <> @t`, { t: TipoImpostazione.Booleano })
  let n = 0
  for (const i of imp) {
    if (!(String(i.Id) in valori)) continue
    await db.exec(
      `UPDATE dbo.Brighetti_Impostazioni SET Valore = @v, UltimaModifica_OperatoreID = @opId, UltimaModifica_Operatore = @opName, UltimaModifica_Data = @now WHERE Id = @id`,
      { id: i.Id, v: str(valori[String(i.Id)]) ?? '', opId: op.id, opName: op.name, now },
    )
    n++
  }
  await writeAudit(db, L.Info, 'Brighetti_Impostazioni/Salva', 'Impostazioni (parametri testuali/numerici) salvate.', { aggiornate: n }, op)
  return { ok: true, message: 'Impostazioni salvate.' }
})
