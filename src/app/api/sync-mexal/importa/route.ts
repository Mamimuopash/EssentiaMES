import { route, ApiError } from '@/lib/api'
import { Chiavi, leggiTesto } from '@/lib/services/impostazioni'
import { sincronizza } from '@/lib/services/mexal'
import { decodificaTesto, leggiCsvMexal } from '@/lib/services/mexal-csv'

/** Import manuale di un CSV Mexal (Brighetti_Sync/Importa). */
export const POST = route({ admin: true, indirizzo: 'Brighetti_Sync/Importa' }, async ({ req, op }) => {
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!file || typeof file === 'string' || file.size === 0) throw new ApiError(400, 'Nessun file selezionato.')
  if (file.size > 20 * 1024 * 1024) throw new ApiError(413, 'File troppo grande (massimo 20 MB).')
  const testo = decodificaTesto(new Uint8Array(await file.arrayBuffer()))
  const separatore = await leggiTesto(Chiavi.SyncMexalSeparatore, ';')
  let righe
  try {
    righe = leggiCsvMexal(testo, separatore)
  } catch (e) {
    return { ok: false, message: `Errore import: ${(e as Error).message}` }
  }
  const esito = await sincronizza(async () => righe, op)
  return { ok: esito.Ok, message: esito.Messaggio, esito }
})
