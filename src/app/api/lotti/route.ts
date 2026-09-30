import { route, readJson, str, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { writeAudit, L } from '@/lib/audit'
import { StatoLotto } from '@/lib/enums'

/** Creazione lotto manuale (Brighetti_Lotti/Create). */
export const POST = route({ admin: true, indirizzo: 'Brighetti_Lotti/Create' }, async ({ req, op }) => {
  const b = await readJson<Record<string, unknown>>(req)
  const nome = (str(b.NomeLotto) ?? '').trim()
  if (!nome) throw new ApiError(400, 'Il nome lotto è obbligatorio.')
  const d = { NomeLotto: nome, DescrizioneLotto: str(b.DescrizioneLotto), CodiceADLACL: str(b.CodiceADLACL), Fornitore: str(b.Fornitore) }
  const id = await db.insert(
    `INSERT INTO dbo.Brighetti_Lotti (NomeLotto, DescrizioneLotto, CodiceADLACL, Fornitore, StatoLotto, TipologiaLotto, IdMagazzinoProvenienza,
                                      UltimaModifica_OperatoreID, UltimaModifica_Operatore, UltimaModifica_Data)
     VALUES (@NomeLotto, @DescrizioneLotto, @CodiceADLACL, @Fornitore, @stato, N'Manuale', 0, @opId, @opName, @now)`,
    { ...d, stato: StatoLotto.In_Attesa, opId: op.id, opName: op.name, now: new Date() },
  )
  await writeAudit(db, L.Info, 'Brighetti_Lotti/Create', `Lotto creato: ${nome} (Id ${id})`, { IdLotto: id, ...d }, op)
  return { ok: true, message: 'Lotto creato', id }
})
