import 'server-only'
import fs from 'node:fs/promises'
import { db, withTransaction } from '@/lib/db'
import { writeAudit, writeLog, safeLog, L, type Operatore } from '@/lib/audit'
import { Chiavi, leggiBool, leggiTesto } from './impostazioni'
import { decodificaTesto, leggiCsvMexal, type MexalGiacenza } from './mexal-csv'
import { chiaveArticolo, indiceMagazzini, nomeOggettoSql, preparaRigheVista, risolviMagazzino, vistaSenzaMagazzino, type RigaVista } from './mexal-db'

/*
 * Porting di MexalSyncService.vb: aggiorna Brighetti_Giacenze da una sorgente
 * Mexal (oggi file CSV; la sorgente e' "pluggable": basta produrre un array di
 * MexalGiacenza per aggiungere API/lettura DB in futuro).
 */

export interface EsitoSync {
  Aggiornate: number
  Create: number
  Lette: number
  /** Righe scartate (articolo o magazzino non presenti in EssentiaMES, dati mancanti). */
  Ignorate: number
  Messaggio: string
  Ok: boolean
}

/** Righe da sincronizzare, con il numero di quelle scartate dalla sorgente. */
export interface DatiSorgente {
  righe: MexalGiacenza[]
  ignorate: number
}

async function indiceMagazziniDb() {
  return indiceMagazzini(await db.query<{ Id: number; CodiceMagazzino: string | null }>(`SELECT Id, CodiceMagazzino FROM dbo.Brighetti_Magazzini`))
}

/**
 * Lettura diretta dal database di Mexal: la vista configurata (es. Mexal_Frontier.dbo.EssentiaMES_Giacenze)
 * espone Articolo, Giacenza e, facoltativi, Magazzino, ScortaMinima, InArrivo.
 */
export async function leggiVistaConfigurata(): Promise<DatiSorgente> {
  const nome = nomeOggettoSql(await leggiTesto(Chiavi.SyncMexalVista, ''))
  const soloAnagrafica = await leggiBool(Chiavi.SyncMexalSoloAnagrafica, true)
  const predefinito = (await leggiTesto(Chiavi.SyncMexalMagazzino, '')).trim()
  let righe: RigaVista[]
  try {
    righe = await db.query<RigaVista>(`SELECT * FROM ${nome}`)
  } catch (e) {
    throw new Error(`Lettura della vista Mexal ${nome} non riuscita: ${(e as Error).message}`)
  }
  const magazzini = await indiceMagazziniDb()
  if (vistaSenzaMagazzino(righe)) {
    if (!predefinito) throw new Error('La vista Mexal non ha la colonna Magazzino: indicare nel pannello Automazioni il magazzino di EssentiaMES in cui scrivere le giacenze.')
    if (!risolviMagazzino(predefinito, magazzini)) throw new Error(`Magazzino "${predefinito}" non trovato in EssentiaMES (indicare il nome o l'Id di un magazzino esistente).`)
  }
  const articoli = new Set(
    (await db.query<{ CodiceArticolo: string | null }>(`SELECT CodiceArticolo FROM dbo.Brighetti_Articoli WHERE CodiceArticolo IS NOT NULL`))
      .map((a) => chiaveArticolo(a.CodiceArticolo || '')),
  )
  return preparaRigheVista(righe, { articoli, magazzini, soloAnagrafica, magazzinoPredefinito: predefinito })
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
    return { Ok: false, Aggiornate: 0, Create: 0, Lette: 0, Ignorate: 0, Messaggio: 'Sincronizzazione Mexal disattivata.' }
  }
  if (await leggiBool(Chiavi.SyncMexalDaDatabase)) return sincronizza(leggiVistaConfigurata, op)
  return sincronizza(leggiFileConfigurato, op)
}

export async function sincronizza(sorgente: () => Promise<MexalGiacenza[] | DatiSorgente>, op: Operatore): Promise<EsitoSync> {
  const esito: EsitoSync = { Aggiornate: 0, Create: 0, Lette: 0, Ignorate: 0, Messaggio: '', Ok: false }
  try {
    const dati = await sorgente()
    const righe = Array.isArray(dati) ? dati : dati.righe
    esito.Ignorate = Array.isArray(dati) ? 0 : dati.ignorate
    esito.Lette = righe.length + esito.Ignorate
    // Magazzino indicato per nome: si salva l'Id, come fa la produzione (evita giacenze doppie).
    const magazzini = await indiceMagazziniDb()
    for (const r of righe) r.CodiceMagazzino = risolviMagazzino(r.CodiceMagazzino, magazzini) ?? r.CodiceMagazzino
    await withTransaction(async (tx) => {
      const now = new Date()
      for (const r of righe) {
        const extra = { smin: r.ScortaMinima ?? null, arr: r.InArrivo ?? null }
        const n = await tx.exec(
          `UPDATE TOP (1) dbo.Brighetti_Giacenze
              SET [QuantitàGiacenza] = @qta,
                  [QuantitàSottoscorta] = COALESCE(@smin, [QuantitàSottoscorta]),
                  InPrevisioneEntrata = COALESCE(@arr, InPrevisioneEntrata),
                  UltimaModifica_OperatoreID = @opId, UltimaModifica_Operatore = @opName, UltimaModifica_Data = @now
            WHERE CodiceArticolo = @art AND CodiceMagazzino = @mag`,
          { qta: r.Quantita, ...extra, art: r.CodiceArticolo, mag: r.CodiceMagazzino, opId: op.id, opName: op.name, now },
        )
        if (n > 0) {
          esito.Aggiornate++
        } else {
          await tx.exec(
            `INSERT INTO dbo.Brighetti_Giacenze (CodiceArticolo, CodiceMagazzino, [QuantitàGiacenza], [QuantitàSottoscorta], [QuantitàScortaMassima], InPrevisioneEntrata,
                                                  UltimaModifica_OperatoreID, UltimaModifica_Operatore, UltimaModifica_Data)
             VALUES (@art, @mag, @qta, COALESCE(@smin, 0), 0, COALESCE(@arr, 0), @opId, @opName, @now)`,
            { qta: r.Quantita, ...extra, art: r.CodiceArticolo, mag: r.CodiceMagazzino, opId: op.id, opName: op.name, now },
          )
          esito.Create++
        }
      }
      const msg = `lette ${esito.Lette}, aggiornate ${esito.Aggiornate}, create ${esito.Create}` +
        (esito.Ignorate ? `, ignorate ${esito.Ignorate} (articolo o magazzino non presenti in EssentiaMES)` : '')
      await writeLog(tx, L.Info, 'MexalSyncService/Sincronizza', `Sync Mexal: ${msg}`, '', op)
      await writeAudit(tx, L.Info, 'MexalSyncService/Sincronizza', `Sincronizzazione giacenze da Mexal: ${msg}`,
        { Aggiornate: esito.Aggiornate, Create: esito.Create, Lette: esito.Lette, Ignorate: esito.Ignorate }, op)
    })
    esito.Ok = true
    esito.Messaggio = `Sincronizzazione completata: ${esito.Aggiornate} aggiornate, ${esito.Create} create (su ${esito.Lette} righe lette` +
      (esito.Ignorate ? `, ${esito.Ignorate} ignorate perché l'articolo o il magazzino non è in EssentiaMES).` : ').')
  } catch (e) {
    esito.Ok = false
    esito.Aggiornate = 0
    esito.Create = 0
    esito.Ignorate = 0
    esito.Messaggio = `Errore sincronizzazione Mexal: ${(e as Error).message}`
    await safeLog(L.Errors, 'MexalSyncService/Sincronizza', esito.Messaggio, '', op)
  }
  return esito
}

