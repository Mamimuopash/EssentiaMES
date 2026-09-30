import 'server-only'
import { safeLog, L, type Operatore } from '@/lib/audit'
import { Chiavi, leggiNumero, leggiTesto } from '@/lib/services/impostazioni'
import { generaProposte } from '@/lib/services/ordini-automatici'
import { sincronizzaDaConfigurazione } from '@/lib/services/mexal'
import { jobOrdiniDaEseguire, parseOra } from '@/lib/services/regole'

/*
 * Sostituto dello scheduler Hangfire: due job ricorrenti nel processo Node.
 *  - ordini-automatici: ogni N minuti (scheduler.minuti_intervallo_ordini);
 *  - sync-mexal: una volta al giorno all'ora scheduler.ora_sync_giornaliera.
 * Entrambi rispettano i rispettivi interruttori (se spenti non fanno nulla).
 * I parametri sono riletti a ogni minuto: le modifiche dal pannello valgono subito.
 *
 * Con piu' istanze dell'app impostare SCHEDULER_ENABLED=false su tutte tranne una,
 * oppure disattivarlo ovunque e usare un cron esterno su /api/cron/<job>.
 */

const SCHEDULER: Operatore = { id: '', name: 'Scheduler' }

export async function jobOrdiniAutomatici() {
  return generaProposte(SCHEDULER, { rispettaToggle: true, origine: 'Pianificato' })
}

export async function jobSyncMexal() {
  return sincronizzaDaConfigurazione(SCHEDULER, true)
}

declare global {
  var __essentiaSchedulerStarted: boolean | undefined
}

let inEsecuzione = false

async function tick() {
  if (inEsecuzione) return
  inEsecuzione = true
  const now = new Date()
  try {
    const minuti = await leggiNumero(Chiavi.SchedulerMinutiIntervalloOrdini, 60)
    if (jobOrdiniDaEseguire(now, minuti)) await jobOrdiniAutomatici()
    const [ora, minuto] = parseOra(await leggiTesto(Chiavi.SchedulerOraSyncGiornaliera, '02:00'))
    if (now.getHours() === ora && now.getMinutes() === minuto) await jobSyncMexal()
  } catch (e) {
    await safeLog(L.Warning, 'Scheduler/tick', `Errore job pianificato: ${(e as Error).message}`, '', SCHEDULER)
  } finally {
    inEsecuzione = false
  }
}

export function avviaScheduler() {
  const flag = (process.env.SCHEDULER_ENABLED || 'true').toLowerCase()
  if (['0', 'false', 'no', 'off'].includes(flag)) {
    console.log('[scheduler] disattivato (SCHEDULER_ENABLED=false)')
    return
  }
  if (globalThis.__essentiaSchedulerStarted) return
  globalThis.__essentiaSchedulerStarted = true
  // Un tick all'inizio di ogni minuto (riallineato ogni volta: niente deriva).
  const programma = () => {
    const attesa = 60000 - (Date.now() % 60000) + 500
    setTimeout(() => {
      void tick()
      programma()
    }, attesa).unref?.()
  }
  programma()
  console.log('[scheduler] avviato (job: ordini-automatici, sync-mexal)')
}
