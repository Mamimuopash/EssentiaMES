import 'server-only'
import { safeLog, L, type Operatore } from '@/lib/audit'
import { Chiavi, leggiNumero, leggiTesto, predefinito } from '@/lib/services/impostazioni'
import { generaProposte } from '@/lib/services/ordini-automatici'
import { sincronizzaDaConfigurazione } from '@/lib/services/mexal'
import { inviaMailOdp, inviaMailUsoMacchine } from '@/lib/services/report-email'
import { eOrario, jobOrdiniDaEseguire, parseGiornoSettimana, parseOra, parseOrari } from '@/lib/services/regole'

/*
 * Sostituto dello scheduler Hangfire: job ricorrenti nel processo Node.
 *  - ordini-automatici: agli orari fissi scheduler.orari_ordini (es. 20:30),
 *    oppure, se vuoto, ogni N minuti (scheduler.minuti_intervallo_ordini);
 *  - sync-mexal: una volta al giorno all'ora scheduler.ora_sync_giornaliera;
 *  - mail-odp: ogni giorno all'ora mail_odp.ora;
 *  - mail-uso-macchine: una volta a settimana (mail_uso_macchine.giorno/ora).
 * Tutti rispettano i rispettivi interruttori (se spenti non fanno nulla).
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

/** Giornata da riepilogare: oggi, oppure ieri se l'invio e' impostato nelle ore notturne (prima delle 6). */
function giornataDiRiferimento(now = new Date()) {
  return now.getHours() < 6 ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12) : now
}

export async function jobMailOdp() {
  return inviaMailOdp(SCHEDULER, { rispettaToggle: true, riferimento: giornataDiRiferimento() })
}

export async function jobMailUsoMacchine() {
  return inviaMailUsoMacchine(SCHEDULER, { rispettaToggle: true, riferimento: giornataDiRiferimento() })
}

/** Esegue un job senza fermare gli altri dello stesso minuto in caso di errore. */
async function esegui(nome: string, job: () => Promise<unknown>) {
  try {
    await job()
  } catch (e) {
    await safeLog(L.Warning, 'Scheduler/tick', `Errore job pianificato ${nome}: ${(e as Error).message}`, '', SCHEDULER)
  }
}

const leggi = (chiave: string) => leggiTesto(chiave, predefinito(chiave))

/** Orario/i della chiave; se il valore non e' valido si usa quello predefinito. */
async function orariDi(chiave: string) {
  const orari = parseOrari(await leggi(chiave))
  return orari.length > 0 ? orari : parseOrari(predefinito(chiave))
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
    // Prima la sincronizzazione Mexal, poi il controllo scorte (se cadono nello stesso minuto).
    if (eOrario(now, [parseOra(await leggi(Chiavi.SchedulerOraSyncGiornaliera))])) await esegui('sync-mexal', jobSyncMexal)
    const orari = parseOrari(await leggi(Chiavi.SchedulerOrariOrdini))
    const ordiniOra =
      orari.length > 0 ? eOrario(now, orari) : jobOrdiniDaEseguire(now, await leggiNumero(Chiavi.SchedulerMinutiIntervalloOrdini, 60))
    if (ordiniOra) await esegui('ordini-automatici', jobOrdiniAutomatici)
    if (eOrario(now, await orariDi(Chiavi.MailOdpOra))) await esegui('mail-odp', jobMailOdp)
    const giorno = parseGiornoSettimana(await leggi(Chiavi.MailMacchineGiorno))
    if (now.getDay() === giorno && eOrario(now, await orariDi(Chiavi.MailMacchineOra))) {
      await esegui('mail-uso-macchine', jobMailUsoMacchine)
    }
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
  console.log('[scheduler] avviato (job: ordini-automatici, sync-mexal, mail-odp, mail-uso-macchine)')
}
