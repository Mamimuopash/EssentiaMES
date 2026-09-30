import { redirect } from 'next/navigation'
import { requirePageUser } from '@/lib/auth/auth'
import { db } from '@/lib/db'
import { TipoElemento } from '@/lib/enums'
import { collegamentoUtente } from '@/lib/services/operatori'
import { attivitaDisponibiliMacchina, attivitaInCorsoMacchina } from '@/lib/services/produzione'
import { getMacchina } from '@/lib/services/macchine'
import AttivitaMacchina from '@/components/AttivitaMacchina'

export const metadata = { title: 'Avvio attività - EssentiaMES' }
export const dynamic = 'force-dynamic'

/** Postazione operatore (vecchie AvvioAttivita / AvvioMacchina). */
export default async function OperatorePage() {
  const user = await requirePageUser()
  const link = await collegamentoUtente(user.id)
  if (!link || !link.IdMacchina) {
    return (
      <div className="mt-5 empty-state">
        <i className="fa-solid fa-wrench fa-6x fa-gradient" />
        <h3 className="mt-3 fw-bold text-dark">Nessuna macchina associata</h3>
        <p>Pare che tu non abbia nessuna macchina associata! Richiedi al tuo responsabile l&apos;associazione dalla Dashboard Macchina.</p>
      </div>
    )
  }
  const inCorso = await attivitaInCorsoMacchina(link.IdMacchina)
  if (inCorso) redirect(`/operatore/attivita/${inCorso.IdAttività}`)
  const [macchina, attivita, cnt] = await Promise.all([
    getMacchina(link.IdMacchina),
    attivitaDisponibiliMacchina(link.IdMacchina),
    db.one<{ note: number; doc: number }>(
      `SELECT (SELECT COUNT(*) FROM dbo.Brighetti_Note WHERE IdEsterno = @id AND TypeElem = @t) AS note,
              (SELECT COUNT(*) FROM dbo.Brighetti_Documenti WHERE IdEsterno = @id AND TypeElem = @t) AS doc`,
      { id: link.IdMacchina, t: TipoElemento.Macchina },
    ),
  ])
  return (
    <>
      <div className="row">
        <div className="col-12">
          <h2 className="page-title">Selezione attività</h2>
          <h5>Utente: {user.userName}</h5>
          <h5>Macchina: {macchina?.NomeMacchina ?? '-'}</h5>
        </div>
      </div>
      <AttivitaMacchina attivita={attivita} countNote={cnt?.note ?? 0} countDocumenti={cnt?.doc ?? 0} azionabile autoRefresh />
    </>
  )
}
