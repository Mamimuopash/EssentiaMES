import { route, reqInt, ApiError } from '@/lib/api'
import { datiPinpoint } from '@/lib/services/macchine'

/** Dati per il popover del pin (Macchine/getDatiMacchina + Home/getDataPinPoint). */
export const GET = route<{ id: string }>({ indirizzo: 'Macchine/getDatiMacchina' }, async ({ params }) => {
  const d = await datiPinpoint(reqInt(params.id))
  if (!d) throw new ApiError(404, 'Macchina non trovata.')
  return { ok: true, ...d }
})
