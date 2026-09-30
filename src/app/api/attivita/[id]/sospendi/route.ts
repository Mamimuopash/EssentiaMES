import { route, reqInt, readJson, num, ApiError } from '@/lib/api'
import { getAttivita, sospendiAttivita } from '@/lib/services/produzione'
import { puoOperareSuMacchina } from '@/lib/services/operatori'

export const POST = route<{ id: string }>({ indirizzo: 'Brighetti_Operatori/SospendiAttività' }, async ({ req, params, user, op }) => {
  const id = reqInt(params.id)
  const b = await readJson<{ QuantitaProdotta?: unknown; QuantitaScartata?: unknown }>(req)
  const a = await getAttivita(id)
  if (!a) throw new ApiError(404, 'Attività non trovata.')
  if (!(await puoOperareSuMacchina(user, a.idMacchinaMagazzino))) throw new ApiError(403, 'Attività di un’altra macchina.')
  await sospendiAttivita(id, num(b.QuantitaProdotta), num(b.QuantitaScartata), op)
  return { ok: true, message: 'Attività correttamente sospesa', pathRedirect: '/operatore' }
})
