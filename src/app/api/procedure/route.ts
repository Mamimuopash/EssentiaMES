import { route, readJson } from '@/lib/api'
import { db } from '@/lib/db'
import { writeAudit, L } from '@/lib/audit'
import { datiProcedura } from '@/lib/services/anagrafiche'

export const POST = route({ admin: true, indirizzo: 'Brighetti_Procedura/Create' }, async ({ req, op }) => {
  const d = datiProcedura(await readJson<Record<string, unknown>>(req))
  const id = await db.insert(
    `INSERT INTO dbo.Brighetti_Procedure (CodiceArticolo, IncrementaleProcedura, TipoAttivita, [NomeAttività], idReparto, idMacchinaMagazzino,
                                          UltimaModifica_OperatoreID, UltimaModifica_Operatore, UltimaModifica_Data)
     VALUES (@CodiceArticolo, @IncrementaleProcedura, @TipoAttivita, @NomeAttivita, @idReparto, @idMacchinaMagazzino, @opId, @opName, @now)`,
    { ...d, opId: op.id, opName: op.name, now: new Date() },
  )
  await writeAudit(db, L.Info, 'Brighetti_Procedura/Create', `Procedura creata: ${d.NomeAttivita ?? ''} (articolo ${d.CodiceArticolo})`, { IdProcedura: id, ...d }, op)
  return { ok: true, message: 'Procedura creata', id }
})
