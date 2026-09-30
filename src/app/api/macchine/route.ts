import { route, readJson } from '@/lib/api'
import { datiMacchina } from '@/lib/services/anagrafiche'
import { withTransaction } from '@/lib/db'
import { writeAudit, L } from '@/lib/audit'

/** Creazione macchina + associazione all'operatore (Brighetti_Macchina/Create). */
export const POST = route({ admin: true, indirizzo: 'Brighetti_Macchina/Create' }, async ({ req, op }) => {
  const dati = datiMacchina(await readJson<Record<string, unknown>>(req))
  const id = await withTransaction(async (tx) => {
    const newId = await tx.insert(
      `INSERT INTO dbo.Brighetti_Macchine (NomeMacchina, DescrizioneMacchina, IdReparto, IdUtente, TipologiaMacchina, CollegamentoMacchina,
                                           UltimaModifica_OperatoreID, UltimaModifica_Operatore, UltimaModifica_Data)
       VALUES (@NomeMacchina, @DescrizioneMacchina, @IdReparto, @IdUtente, @TipologiaMacchina, @CollegamentoMacchina, @opId, @opName, @now)`,
      { ...dati, opId: op.id, opName: op.name, now: new Date() },
    )
    if (dati.IdUtente !== '0') {
      // IdReparto = 0: la postazione operatore lavora "per macchina" (la modalita' reparto non e' implementata).
      await tx.exec(`INSERT INTO dbo.AspNetMacchineUsers (IdUtente, IdMacchina, IdReparto) VALUES (@u, @m, 0)`, { u: dati.IdUtente, m: newId })
    }
    await writeAudit(tx, L.Info, 'Brighetti_Macchina/Create', `Macchina creata: ${dati.NomeMacchina} (Id ${newId})`, { IdMacchina: newId, ...dati }, op)
    return newId
  })
  return { ok: true, message: 'Macchina correttamente inserita', id }
})
