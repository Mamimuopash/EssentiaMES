import { route, readJson, str, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { writeAudit, L } from '@/lib/audit'

export const POST = route({ admin: true, indirizzo: 'Brighetti_Reparto/Create' }, async ({ req, op }) => {
  const b = await readJson<Record<string, unknown>>(req)
  const nome = (str(b.NomeReparto) ?? '').trim()
  if (!nome) throw new ApiError(400, 'Il nome reparto è obbligatorio.')
  const dati = { NomeReparto: nome, DescrizioneReparto: str(b.DescrizioneReparto) }
  const id = await db.insert(
    `INSERT INTO dbo.Brighetti_Reparti (NomeReparto, DescrizioneReparto, UltimaModifica_OperatoreID, UltimaModifica_Operatore, UltimaModifica_Data)
     VALUES (@NomeReparto, @DescrizioneReparto, @opId, @opName, @now)`,
    { ...dati, opId: op.id, opName: op.name, now: new Date() },
  )
  await writeAudit(db, L.Info, 'Brighetti_Reparto/Create', `Reparto creato: ${nome}`, { IdReparto: id, ...dati }, op)
  return { ok: true, message: 'Reparto correttamente inserito', id }
})
