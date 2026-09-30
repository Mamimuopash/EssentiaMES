import { route, readJson, str, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { writeAudit, L } from '@/lib/audit'

/** Nuovo articolo nel catalogo richieste materiali (Home/CreaArticolo). */
export const POST = route({ admin: true, indirizzo: 'Home/CreaArticolo' }, async ({ req, op }) => {
  const b = await readJson<{ CodiceArticolo?: unknown; DescrizioneArticolo?: unknown }>(req)
  const codice = (str(b.CodiceArticolo) ?? '').trim()
  if (!codice) throw new ApiError(400, 'Il codice articolo è obbligatorio.')
  const descr = str(b.DescrizioneArticolo)
  const id = await db.insert(
    `INSERT INTO dbo.Articoli (Nome_Articolo, Descrizione_Articolo, MagazzinoId, ArticoloCancellato, FamigliaId) VALUES (@c, @d, 1, 0, 0)`,
    { c: codice, d: descr },
  )
  await writeAudit(db, L.Info, 'Home/CreaArticolo', `Articolo creato: ${codice} - ${descr ?? ''}`, { Id: id, Nome_Articolo: codice, Descrizione_Articolo: descr }, op)
  return { ok: true, message: 'Articolo aggiunto correttamente.' }
})
