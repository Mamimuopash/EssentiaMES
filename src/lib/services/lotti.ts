import 'server-only'
import { db } from '@/lib/db'
import { StatoArticoloLotto, StatoLotto, TipoStatoAttivita } from '@/lib/enums'
import { writeLog, L, type Operatore } from '@/lib/audit'
import { Chiavi, leggiBool } from './impostazioni'

/* Porting di Servizi/LottiAutomaticiService.vb */

function yyyyMMdd_HHmm(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`
}

/**
 * Crea un lotto (stato "In attesa") per l'articolo/quantita' appena versato.
 * Ritorna l'IdLotto creato oppure 0 se l'automatismo e' spento.
 */
export async function creaLottoDaVersamento(codiceArticolo: string | null, quantita: number, op: Operatore): Promise<number> {
  if (!(await leggiBool(Chiavi.LottiCreazioneAutomaticaAbilitato))) return 0
  if (!codiceArticolo || !codiceArticolo.trim()) return 0
  const now = new Date()
  const art = await db.one<{ Id: number }>(
    `SELECT TOP 1 Id FROM dbo.Brighetti_Articoli WHERE CodiceArticolo = @c ORDER BY Id`,
    { c: codiceArticolo },
  )
  const nome = `AUTO ${codiceArticolo} ${yyyyMMdd_HHmm(now)}`
  const idLotto = await db.insert(
    `INSERT INTO dbo.Brighetti_Lotti (NomeLotto, DescrizioneLotto, StatoLotto, TipologiaLotto, CodiceADLACL, Fornitore, IdMagazzinoProvenienza,
                                      UltimaModifica_OperatoreID, UltimaModifica_Operatore, UltimaModifica_Data)
     VALUES (@nome, N'Lotto generato automaticamente alla chiusura della fase.', @stato, N'Automatico', N'', NULL, 0, @opId, @opName, @now)`,
    { nome, stato: StatoLotto.In_Attesa, opId: op.id, opName: op.name, now },
  )
  await db.exec(
    `INSERT INTO dbo.Brighetti_Lotti_Articoli (IdLotto, IdArticolo, NomeArticolo, [QuantitàArticolo], NoteArticolo, StatoArticoloLotto,
                                               UltimaModifica_OperatoreID, UltimaModifica_Operatore, UltimaModifica_Data)
     VALUES (@idLotto, @idArt, @nomeArt, @qta, N'', @stato, @opId, @opName, @now)`,
    {
      idLotto,
      idArt: art?.Id ?? 0,
      nomeArt: codiceArticolo,
      qta: formatDecimaleNet(quantita),
      stato: StatoArticoloLotto.In_Attesa,
      opId: op.id,
      opName: op.name,
      now,
    },
  )
  await writeLog(db, L.Info, 'LottiAutomaticiService/CreaLottoDaVersamento', `Lotto automatico creato: ${nome} (id ${idLotto})`, '', op)
  return idLotto
}

/** Quantita' come testo in formato italiano (es. 10 -> "10", 10.5 -> "10,5"). */
function formatDecimaleNet(n: number) {
  return String(Math.round(n * 100) / 100).replace('.', ',')
}

/**
 * Quando un lotto passa a "Ritornato" sblocca la fase successiva degli articoli
 * del lotto, SOLO se univoca (una sola attivita' bloccata per quel codice);
 * i casi ambigui vengono annotati nel Log. Ritorna il numero di attivita' sbloccate.
 */
export async function sbloccaFaseDaLottoRitornato(idLotto: number, op: Operatore): Promise<number> {
  if (!(await leggiBool(Chiavi.LottiRitornatoSbloccaFase))) return 0
  let sbloccate = 0
  const articoli = await db.query<{ IdArticolo: number; NomeArticolo: string | null; CodiceAnagrafica: string | null }>(
    `SELECT la.IdArticolo, la.NomeArticolo, a.CodiceArticolo AS CodiceAnagrafica
       FROM dbo.Brighetti_Lotti_Articoli la LEFT JOIN dbo.Brighetti_Articoli a ON a.Id = la.IdArticolo
      WHERE la.IdLotto = @id ORDER BY la.IdLottoArticolo`,
    { id: idLotto },
  )
  for (const la of articoli) {
    const codice = la.CodiceAnagrafica && la.CodiceAnagrafica.trim() ? la.CodiceAnagrafica : la.NomeArticolo
    if (!codice || !codice.trim()) continue
    const bloccate = await db.query<{ IdAttività: number }>(
      `SELECT [IdAttività] FROM dbo.[Brighetti_Attività] WHERE CodiceArticolo = @c AND [StatoAttività] = @s`,
      { c: codice, s: TipoStatoAttivita.BloccoDaAttivitaPrecedente },
    )
    if (bloccate.length === 1) {
      await db.exec(
        `UPDATE dbo.[Brighetti_Attività] SET [StatoAttività] = @s, UltimaModifica_OperatoreID = @opId, UltimaModifica_Operatore = @opName, UltimaModifica_Data = @now
          WHERE [IdAttività] = @id`,
        { s: TipoStatoAttivita.In_attesa, id: bloccate[0].IdAttività, opId: op.id, opName: op.name, now: new Date() },
      )
      sbloccate++
    } else if (bloccate.length > 1) {
      await writeLog(
        db,
        L.Warning,
        'LottiAutomaticiService/SbloccaFaseDaLottoRitornato',
        `Sblocco non univoco per articolo ${codice} (lotto ${idLotto}): ${bloccate.length} attività bloccate. Nessuno sblocco automatico.`,
        '',
        op,
      )
    }
  }
  return sbloccate
}
