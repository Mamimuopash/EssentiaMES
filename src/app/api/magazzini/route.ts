import { route, readJson, int, str, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { writeAudit, L } from '@/lib/audit'

export const POST = route({ admin: true, indirizzo: 'Brighetti_Magazzino/Create' }, async ({ req, op }) => {
  const b = await readJson<Record<string, unknown>>(req)
  const codice = (str(b.CodiceMagazzino) ?? '').trim()
  if (!codice) throw new ApiError(400, 'Il codice magazzino è obbligatorio.')
  const dati = { CodiceMagazzino: codice, DescrizioneMagazzino: str(b.DescrizioneMagazzino), TipologiaMagazzino: int(b.TipologiaMagazzino) === 1 ? 1 : 0 }
  const id = await db.insert(
    `INSERT INTO dbo.Brighetti_Magazzini (CodiceMagazzino, DescrizioneMagazzino, TipologiaMagazzino, UltimaModifica_OperatoreID, UltimaModifica_Operatore, UltimaModifica_Data)
     VALUES (@CodiceMagazzino, @DescrizioneMagazzino, @TipologiaMagazzino, @opId, @opName, @now)`,
    { ...dati, opId: op.id, opName: op.name, now: new Date() },
  )
  await writeAudit(db, L.Info, 'Brighetti_Magazzino/Create', `Magazzino creato: ${codice}`, { Id: id, ...dati }, op)
  return { ok: true, message: 'Magazzino correttamente inserito', id }
})
