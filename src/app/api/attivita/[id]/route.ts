import { route, reqInt, ApiError } from '@/lib/api'
import { getAttivita } from '@/lib/services/produzione'
import { documentiDi, noteDi } from '@/lib/services/documenti'
import { puoOperareSuMacchina } from '@/lib/services/operatori'
import { TipoElemento } from '@/lib/enums'

/** Dettaglio attivita' + note/documenti della macchina (modale "Apri Attività"). */
export const GET = route<{ id: string }>({ indirizzo: 'Brighetti_Operatori/ApriAttività' }, async ({ params, user }) => {
  const a = await getAttivita(reqInt(params.id))
  if (!a) throw new ApiError(404, 'Attività non trovata.')
  if (!(await puoOperareSuMacchina(user, a.idMacchinaMagazzino))) throw new ApiError(403, 'Attività di un’altra macchina.')
  const [note, documenti] = await Promise.all([
    noteDi(TipoElemento.Macchina, a.idMacchinaMagazzino),
    documentiDi(TipoElemento.Macchina, a.idMacchinaMagazzino),
  ])
  return { ok: true, attivita: a, note, documenti }
})
