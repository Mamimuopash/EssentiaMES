import { notFound, redirect } from 'next/navigation'
import { requirePageUser } from '@/lib/auth/auth'
import { TipoStatoAttivita } from '@/lib/enums'
import { getAttivita } from '@/lib/services/produzione'
import { puoOperareSuMacchina } from '@/lib/services/operatori'
import AttivitaInCorso from './AttivitaInCorso'

export const metadata = { title: 'Attività in corso - EssentiaMES' }
export const dynamic = 'force-dynamic'

/** Attivita' in corso con timer, sospensione e chiusura (vecchia VisualizzaAttività). */
export default async function AttivitaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser()
  const { id } = await params
  const a = await getAttivita(Number(id))
  if (!a) notFound()
  if (!(await puoOperareSuMacchina(user, a.idMacchinaMagazzino))) redirect('/')
  if (a.StatoAttività !== TipoStatoAttivita.In_Attrezzaggio && a.StatoAttività !== TipoStatoAttivita.In_Lavorazione) {
    redirect(user.isAdmin ? `/macchine/${a.idMacchinaMagazzino}` : '/operatore')
  }
  return (
    <AttivitaInCorso
      attivita={{
        IdAttività: a.IdAttività,
        NomeAttività: a.NomeAttività,
        CodiceArticolo: a.CodiceArticolo,
        QuantitàdaProdurre: a.QuantitàdaProdurre,
        QuantitàProdotta: a.QuantitàProdotta,
        QuantitàScartata: a.QuantitàScartata,
        StatoAttività: a.StatoAttività,
        inizio: (a.UltimaModifica_Data ?? new Date()).toISOString(),
      }}
    />
  )
}
