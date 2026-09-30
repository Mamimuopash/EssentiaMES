import { route, readJson, int, str, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { writeAudit, L } from '@/lib/audit'

/** Aggiunta nota a un elemento (Home/AddNota). Type = TipoElemento. */
export const POST = route({ indirizzo: 'Home/AddNota' }, async ({ req, op }) => {
  const b = await readJson<{ Id?: unknown; Nota?: unknown; Type?: unknown }>(req)
  const id = int(b.Id, NaN)
  if (!Number.isInteger(id)) throw new ApiError(400, "Errore: aggiunta nota. Impossibile recuperare l'elemento.")
  const nota = (str(b.Nota) ?? '').trim()
  if (!nota) throw new ApiError(400, 'La nota è vuota.')
  const type = int(b.Type)
  const now = new Date()
  const newId = await db.insert(
    `INSERT INTO dbo.Brighetti_Note (TypeElem, Data_Nota, Contenuto_Nota, Operatore_Id, Operatore_Nome, IdEsterno)
     VALUES (@t, @now, @nota, @opId, @opName, @id)`,
    { t: type, now, nota, opId: op.id, opName: op.name, id },
  )
  await writeAudit(db, L.Info, 'Home/AddNota', 'Aggiunta nota',
    { Id: newId, TypeElem: type, IdEsterno: id, Contenuto_Nota: nota, Data_Nota: now, Operatore_Id: op.id, Operatore_Nome: op.name }, op)
  return { ok: true, message: `Nota correttamente aggiunta -> ${id}.`, id }
})
