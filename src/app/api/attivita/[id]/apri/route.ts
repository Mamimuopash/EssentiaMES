import { route, reqInt, readJson, int, ApiError } from '@/lib/api'
import { apriAttivita, getAttivita, ErroreProduzione } from '@/lib/services/produzione'
import { puoOperareSuMacchina } from '@/lib/services/operatori'

/** Avvio attività: StatoAttivita 0 = Attrezzaggio, 1 = Lavorazione. */
export const POST = route<{ id: string }>({ indirizzo: 'Brighetti_Operatori/ApriAttività' }, async ({ req, params, user, op }) => {
  const id = reqInt(params.id)
  const b = await readJson<{ StatoAttivita?: number | string }>(req)
  const a = await getAttivita(id)
  if (!a) throw new ApiError(404, 'Attività non trovata.')
  if (!(await puoOperareSuMacchina(user, a.idMacchinaMagazzino))) throw new ApiError(403, 'Attività di un’altra macchina.')
  try {
    await apriAttivita(id, int(b.StatoAttivita) === 0 ? 0 : 1, op)
  } catch (e) {
    if (e instanceof ErroreProduzione) return { ok: false, message: e.message }
    throw e
  }
  return { ok: true, message: 'Attività correttamente aperta', pathRedirect: `/operatore/attivita/${id}` }
})
