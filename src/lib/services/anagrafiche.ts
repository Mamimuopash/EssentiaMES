import 'server-only'
import { ApiError, int, num, str } from '@/lib/api'

/** Validazione/normalizzazione dei dati macchina dai form. */
export function datiMacchina(b: Record<string, unknown>) {
  const nome = (str(b.NomeMacchina) ?? '').trim()
  if (!nome) throw new ApiError(400, 'Il nome macchina è obbligatorio.')
  const utente = str(b.IdUtente)
  const tip = int(b.TipologiaMacchina)
  return {
    NomeMacchina: nome,
    DescrizioneMacchina: str(b.DescrizioneMacchina),
    IdReparto: int(b.IdReparto),
    IdUtente: utente && utente !== '0' ? utente : '0',
    TipologiaMacchina: [0, 1, 2, 3].includes(tip) ? tip : 0,
    CollegamentoMacchina: str(b.CollegamentoMacchina),
  }
}


/** Dati giacenza dai form (IdArticolo/IdMagazzino dai menu a tendina). */
export function datiGiacenza(b: Record<string, unknown>) {
  return {
    art: str(b.IdArticolo),
    mag: str(b.IdMagazzino),
    QuantitaGiacenza: num(b.QuantitaGiacenza),
    QuantitaSottoscorta: num(b.QuantitaSottoscorta),
    QuantitaScortaMassima: num(b.QuantitaScortaMassima),
  }
}


/** Dati procedura (fase del ciclo di un articolo). */
export function datiProcedura(b: Record<string, unknown>) {
  const codice = (str(b.CodiceArticolo) ?? '').trim()
  if (!codice) throw new ApiError(400, 'Il codice articolo è obbligatorio.')
  const inc = int(b.IncrementaleProcedura)
  if (inc < 1 || inc > 32767) throw new ApiError(400, 'Incrementale procedura non valido (1..32767).')
  const tipo = int(b.TipoAttivita, 1)
  return {
    CodiceArticolo: codice,
    IncrementaleProcedura: inc,
    TipoAttivita: [1, 2, 99].includes(tipo) ? tipo : 1,
    NomeAttivita: str(b.NomeAttivita),
    idReparto: int(b.idReparto),
    idMacchinaMagazzino: int(b.idMacchinaMagazzino),
  }
}
