import 'server-only'
import fs from 'node:fs/promises'
import { withTransaction } from '@/lib/db'
import { writeAudit, writeLog, safeLog, L, type Operatore } from '@/lib/audit'
import { Chiavi, leggiBool, leggiTesto } from './impostazioni'
import { decodificaTesto, leggiCsvMexal, type MexalGiacenza } from './mexal-csv'

/*
 * Porting di MexalSyncService.vb: aggiorna Brighetti_Giacenze da una sorgente
 * Mexal (oggi file CSV; la sorgente e' "pluggable": basta produrre un array di
 * MexalGiacenza per aggiungere API/lettura DB in futuro).
 */

export interface EsitoSync {
  Aggiornate: number
  Create: number
  Lette: number
  Messaggio: string
  Ok: boolean
}

export async function leggiFileConfigurato(): Promise<MexalGiacenza[]> {
  const percorso = await leggiTesto(Chiavi.SyncMexalPercorsoFile, '')
  const separatore = await leggiTesto(Chiavi.SyncMexalSeparatore, ';')
  if (!percorso.trim()) throw new Error('Percorso del file CSV Mexal non configurato.')
  let buf: Buffer
  try {
    buf = await fs.readFile(percorso)
  } catch {
    throw new Error(`File CSV Mexal non trovato: ${percorso}`)
  }
  return leggiCsvMexal(decodificaTesto(buf), separatore)
}

export async function sincronizzaDaConfigurazione(op: Operatore, rispettaToggle = false): Promise<EsitoSync> {
  if (rispettaToggle && !(await leggiBool(Chiavi.SyncMexalAbilitato))) {
    return { Ok: false, Aggiornate: 0, Create: 0, Lette: 0, Messaggio: 'Sincronizzazione Mexal disattivata.' }
  }
  return sincronizza(leggiFileConfigurato, op)
}

export async function sincronizza(sorgente: () => Promise<MexalGiacenza[]>, op: Operatore): Promise<EsitoSync> {
  const esito: EsitoSync = { Aggiornate: 0, Create: 0, Lette: 0, Messaggio: '', Ok: false }
  try {
    const righe = await sorgente()
    esito.Lette = righe.length
    await withTransaction(async (tx) => {
      const now = new Date()
      for (const r of righe) {
        const n = await tx.exec(
          `UPDATE TOP (1) dbo.Brighetti_Giacenze
              SET [QuantitàGiacenza] = @qta, UltimaModifica_OperatoreID = @opId, UltimaModifica_Operatore = @opName, UltimaModifica_Data = @now
            WHERE CodiceArticolo = @art AND CodiceMagazzino = @mag`,
          { qta: r.Quantita, art: r.CodiceArticolo, mag: r.CodiceMagazzino, opId: op.id, opName: op.name, now },
        )
        if (n > 0) {
          esito.Aggiornate++
        } else {
          await tx.exec(
            `INSERT INTO dbo.Brighetti_Giacenze (CodiceArticolo, CodiceMagazzino, [QuantitàGiacenza], [QuantitàSottoscorta], [QuantitàScortaMassima], InPrevisioneEntrata,
                                                  UltimaModifica_OperatoreID, UltimaModifica_Operatore, UltimaModifica_Data)
             VALUES (@art, @mag, @qta, 0, 0, 0, @opId, @opName, @now)`,
            { qta: r.Quantita, art: r.CodiceArticolo, mag: r.CodiceMagazzino, opId: op.id, opName: op.name, now },
          )
          esito.Create++
        }
      }
      const msg = `lette ${esito.Lette}, aggiornate ${esito.Aggiornate}, create ${esito.Create}`
      await writeLog(tx, L.Info, 'MexalSyncService/Sincronizza', `Sync Mexal: ${msg}`, '', op)
      await writeAudit(tx, L.Info, 'MexalSyncService/Sincronizza', `Sincronizzazione giacenze da Mexal: ${msg}`,
        { Aggiornate: esito.Aggiornate, Create: esito.Create, Lette: esito.Lette }, op)
    })
    esito.Ok = true
    esito.Messaggio = `Sincronizzazione completata: ${esito.Aggiornate} aggiornate, ${esito.Create} create (su ${esito.Lette} righe lette).`
  } catch (e) {
    esito.Ok = false
    esito.Aggiornate = 0
    esito.Create = 0
    esito.Messaggio = `Errore sincronizzazione Mexal: ${(e as Error).message}`
    await safeLog(L.Errors, 'MexalSyncService/Sincronizza', esito.Messaggio, '', op)
  }
  return esito
}

