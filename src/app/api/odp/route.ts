import { route, readJson, int, num, ApiError } from '@/lib/api'
import { creaOdp, dettaglioOrdine, ErroreProduzione } from '@/lib/services/produzione'

/** Dettaglio ODP (Home/MostraOrdine): ?ordine=<OrdineDiProduzione> */
export const GET = route({ admin: true, indirizzo: 'Home/MostraOrdine' }, async ({ req }) => {
  const ordine = req.nextUrl.searchParams.get('ordine')
  if (!ordine) throw new ApiError(400, 'Ordine non indicato.')
  return { ok: true, fasi: await dettaglioOrdine(ordine) }
})

/** Creazione ODP manuale (Brighetti_Giacenza/CreateODP). */
export const POST = route({ admin: true, indirizzo: 'Brighetti_Giacenza/CreateODP' }, async ({ req, op }) => {
  const b = await readJson<{ IdArticolo?: unknown; Qta?: unknown }>(req)
  try {
    const odp = await creaOdp(int(b.IdArticolo), num(b.Qta), op)
    return { ok: true, message: `ODP Creato Correttamente (${odp})`, odp }
  } catch (e) {
    if (e instanceof ErroreProduzione) return { ok: false, message: e.message }
    throw e
  }
})
