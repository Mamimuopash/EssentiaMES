import { route, reqInt, readJson, ApiError } from '@/lib/api'
import { getAttivita, nascondiAttivita, ErroreProduzione } from '@/lib/services/produzione'
import { puoOperareSuMacchina } from '@/lib/services/operatori'

/** L'operatore nasconde un'attività inutile dalla lista della sua macchina { nascosta: true } o la rimette { nascosta: false }. */
export const POST = route<{ id: string }>({ indirizzo: 'Brighetti_Operatori/NascondiAttività' }, async ({ req, params, user, op }) => {
  const id = reqInt(params.id)
  const b = await readJson<{ nascosta?: unknown }>(req)
  const nascosta = b.nascosta === true || b.nascosta === 'true' || b.nascosta === 1
  const a = await getAttivita(id)
  if (!a) throw new ApiError(404, 'Attività non trovata.')
  if (!(await puoOperareSuMacchina(user, a.idMacchinaMagazzino))) throw new ApiError(403, 'Attività di un’altra macchina.')
  try {
    await nascondiAttivita(id, nascosta, op)
  } catch (e) {
    if (e instanceof ErroreProduzione) return { ok: false, message: e.message }
    throw e
  }
  return { ok: true, message: nascosta ? 'Attività nascosta dalla lista.' : 'Attività di nuovo visibile.' }
})
