import { route, readJson, int, str, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { macchineSenzaPin } from '@/lib/services/macchine'

/** Macchine senza pin (Home/ListaMacchine). */
export const GET = route({ admin: true, indirizzo: 'Home/ListaMacchine' }, async () => {
  return { ok: true, listaMacchine: await macchineSenzaPin() }
})

/** Nuovo pin in planimetria (Home/SalvaPinpoint): posizione in percentuale. */
export const POST = route({ admin: true, indirizzo: 'Home/SalvaPinpoint' }, async ({ req, op }) => {
  const b = await readJson<{ id?: unknown; posX?: unknown; posY?: unknown }>(req)
  const id = int(b.id, NaN)
  const x = Number(str(b.posX))
  const y = Number(str(b.posY))
  if (!Number.isInteger(id) || !Number.isFinite(x) || !Number.isFinite(y)) throw new ApiError(400, 'Dati pinpoint non validi.')
  const esiste = await db.one<{ n: number }>(`SELECT COUNT(*) AS n FROM dbo.Brighetti_Planimetria WHERE IdEsternoMacchina = @id`, { id })
  if (esiste && esiste.n > 0) throw new ApiError(409, 'La macchina ha già un pinpoint.')
  await db.exec(
    `INSERT INTO dbo.Brighetti_Planimetria (IdEsternoMacchina, posX, posY, UltimaModifica_OperatoreID, UltimaModifica_Operatore, UltimaModifica_Data)
     VALUES (@id, @x, @y, @opId, @opName, @now)`,
    { id, x: String(x), y: String(y), opId: op.id, opName: op.name, now: new Date() },
  )
  return { ok: true, message: 'Pinpoint aggiunto' }
})
