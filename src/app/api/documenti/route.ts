import { route, int, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { writeAudit, L } from '@/lib/audit'
import { maxUploadBytes, salvaFile } from '@/lib/services/documenti'

/** Upload documento allegato a un elemento (Home/AddFile). */
export const POST = route({ indirizzo: 'Home/AddFile' }, async ({ req, op }) => {
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    throw new ApiError(400, 'Richiesta di upload non valida.')
  }
  const id = int(form.get('id'), NaN)
  if (!Number.isInteger(id)) throw new ApiError(400, "Errore: Dettagli File. Impossibile recuperare l'elemento.")
  const type = int(form.get('Type'))
  const file = form.get('file')
  if (!file || typeof file === 'string' || file.size === 0) throw new ApiError(400, 'Nessun file selezionato.')
  if (file.size > maxUploadBytes()) throw new ApiError(413, `File troppo grande (massimo ${Math.round(maxUploadBytes() / 1048576)} MB).`)
  const percorso = await salvaFile(file.name, Buffer.from(await file.arrayBuffer()))
  await db.exec(
    `INSERT INTO dbo.Brighetti_Documenti (DataCreazioneFile, Nome_File, TypeElem, Operatore_Id, Operatore_Nome, Percorso_File, IdEsterno)
     VALUES (@now, @nome, @t, @opId, @opName, @path, @id)`,
    { now: new Date(), nome: file.name, t: type, opId: op.id, opName: op.name, path: percorso, id },
  )
  await writeAudit(db, L.Info, 'Home/AddFile', 'Aggiunto File', { id, file: file.name }, op)
  return { ok: true, message: `File correttamente aggiunto -> ${id}.`, id }
})
