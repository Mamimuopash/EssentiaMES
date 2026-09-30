import { route, readJson, reqInt, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { writeAudit, L } from '@/lib/audit'
import { getGiacenza, risolviCodiceArticolo } from '@/lib/services/giacenze'
import { datiGiacenza } from '@/lib/services/anagrafiche'

export const GET = route<{ id: string }>({ admin: true, indirizzo: 'Brighetti_Giacenza/Details' }, async ({ params }) => {
  const g = await getGiacenza(reqInt(params.id))
  if (!g) throw new ApiError(404, 'Giacenza non trovata.')
  return { ok: true, giacenza: g }
})

export const PUT = route<{ id: string }>({ admin: true, indirizzo: 'Brighetti_Giacenza/Edit' }, async ({ req, params, op }) => {
  const id = reqInt(params.id)
  const d = datiGiacenza(await readJson<Record<string, unknown>>(req))
  if (!d.art || d.art === '0' || !d.mag || d.mag === '0') throw new ApiError(400, 'Selezionare articolo e magazzino.')
  const codice = await risolviCodiceArticolo(d.art)
  const n = await db.exec(
    `UPDATE dbo.Brighetti_Giacenze SET CodiceArticolo = @art, CodiceMagazzino = @mag, [QuantitàGiacenza] = @g, [QuantitàSottoscorta] = @s, [QuantitàScortaMassima] = @m,
            UltimaModifica_OperatoreID = @opId, UltimaModifica_Operatore = @opName, UltimaModifica_Data = @now WHERE Id = @id`,
    { id, art: codice, mag: d.mag, g: d.QuantitaGiacenza, s: d.QuantitaSottoscorta, m: d.QuantitaScortaMassima, opId: op.id, opName: op.name, now: new Date() },
  )
  if (!n) return { ok: false, message: "Impossibile trovare la giacenza richiesta" }
  await writeAudit(db, L.Info, 'Brighetti_Giacenza/Edit', `Giacenza modificata: articolo ${codice}, magazzino ${d.mag} (Id ${id})`, { Id: id, CodiceArticolo: codice, CodiceMagazzino: d.mag, ...d }, op)
  return { ok: true, message: 'Giacenza correttamente aggiornata' }
})

export const DELETE = route<{ id: string }>({ admin: true, indirizzo: 'Brighetti_Giacenza/DeleteConfirmed' }, async ({ params, op }) => {
  const id = reqInt(params.id)
  const g = await db.one<{ CodiceArticolo: string | null; CodiceMagazzino: string | null }>(
    `SELECT CodiceArticolo, CodiceMagazzino FROM dbo.Brighetti_Giacenze WHERE Id = @id`,
    { id },
  )
  if (!g) throw new ApiError(404, 'Giacenza non trovata.')
  // I dettagli collegati (FK Brighetti_Giacenza_Id) vanno rimossi prima della giacenza.
  await db.exec(`DELETE FROM dbo.Brighetti_DettagliGiacenza WHERE Brighetti_Giacenza_Id = @id OR idGiacenza = @id`, { id })
  await db.exec(`DELETE FROM dbo.Brighetti_Giacenze WHERE Id = @id`, { id })
  await writeAudit(db, L.Warning, 'Brighetti_Giacenza/DeleteConfirmed',
    `Giacenza eliminata: articolo ${g.CodiceArticolo}, magazzino ${g.CodiceMagazzino} (Id ${id})`, { Id: id, ...g }, op)
  return { ok: true, message: 'Cancellazione giacenza confermata correttamente' }
})
