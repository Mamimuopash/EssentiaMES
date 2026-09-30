import { route } from '@/lib/api'
import { db } from '@/lib/db'
import { writeAudit, L } from '@/lib/audit'

/** Elimina le richieste materiali aperte (OrdiniInCorso); lo storico (Ordini) resta. */
export const DELETE = route({ admin: true, indirizzo: 'Brighetti_Impostazioni/CancellaRichiesteAperte' }, async ({ op }) => {
  const n = await db.exec(`DELETE FROM dbo.OrdiniInCorso`)
  await writeAudit(db, L.Warning, 'Brighetti_Impostazioni/CancellaRichiesteAperte', `Cancellate ${n} richieste aperte (OrdiniInCorso). Storico (Ordini) mantenuto.`, '', op)
  return { ok: true, message: `${n} richieste aperte eliminate. Le richieste già inviate (storico) sono state mantenute.` }
})
