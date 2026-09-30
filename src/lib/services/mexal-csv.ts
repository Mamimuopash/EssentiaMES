/*
 * Lettura del CSV giacenze esportato da Mexal (porting di MexalCsvSource.vb).
 * Colonne individuate dall'intestazione in modo tollerante. Modulo "puro":
 * testato in tests/mexal-csv.test.ts.
 */

export interface MexalGiacenza {
  CodiceArticolo: string
  CodiceMagazzino: string
  Quantita: number
}

/** Decodifica: UTF-8 (con o senza BOM), in fallback Windows-1252 (tipico degli export gestionali). */
export function decodificaTesto(buf: Uint8Array): string {
  let bytes = buf
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) bytes = bytes.subarray(3)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

/** Divide una riga CSV rispettando i campi tra virgolette ("" = virgoletta letterale). */
export function splitRiga(riga: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuote = false
  let i = 0
  while (i < riga.length) {
    const ch = riga[i]
    if (inQuote) {
      if (ch === '"') {
        if (riga[i + 1] === '"') {
          cur += '"'
          i += 2
          continue
        }
        inQuote = false
        i++
        continue
      }
      cur += ch
      i++
      continue
    }
    if (ch === '"' && cur.trim() === '') {
      cur = ''
      inQuote = true
      i++
      continue
    }
    if (riga.startsWith(sep, i)) {
      out.push(cur.trim())
      cur = ''
      i += sep.length
      continue
    }
    cur += ch
    i++
  }
  out.push(cur.trim())
  return out
}

/** Righe logiche (una riga fisica puo' continuare dentro un campo tra virgolette). */
function righeLogiche(testo: string): string[] {
  const fisiche = testo.split(/\r\n|\n|\r/)
  const out: string[] = []
  let buffer: string | null = null
  for (const r of fisiche) {
    const corrente: string = buffer === null ? r : `${buffer}\n${r}`
    const virgolette = (corrente.match(/"/g) || []).length
    if (virgolette % 2 === 1) {
      buffer = corrente
      continue
    }
    buffer = null
    out.push(corrente)
  }
  if (buffer !== null) out.push(buffer)
  return out.filter((r) => r.trim() !== '')
}

const normalizza = (h: string) => (h || '').trim().toLowerCase().replace(/ /g, '')

function trovaColonna(header: string[], candidati: string[]): number {
  for (let i = 0; i < header.length; i++) {
    const h = normalizza(header[i])
    for (const c of candidati) if (h === c.replace(/ /g, '')) return i
  }
  return -1
}

/**
 * Numero in formato italiano o internazionale: "12,5" -> 12.5 ; "1.234,56" -> 1234.56 ;
 * "1,234.56" -> 1234.56 ; "12.5" -> 12.5 ; vuoto/non valido -> 0.
 */
export function parseDecimale(valore: string | null | undefined): number {
  if (!valore) return 0
  let v = valore.trim().replace(/\s/g, '')
  if (!v) return 0
  const lastComma = v.lastIndexOf(',')
  const lastDot = v.lastIndexOf('.')
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) v = v.replace(/\./g, '').replace(',', '.')
    else v = v.replace(/,/g, '')
  } else if (lastComma >= 0) {
    v = (v.match(/,/g) || []).length > 1 ? v.replace(/,/g, '') : v.replace(',', '.')
  }
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export function leggiCsvMexal(testo: string, separatore = ';'): MexalGiacenza[] {
  const sep = separatore && separatore.length > 0 ? separatore : ';'
  const righe = righeLogiche(testo)
  if (righe.length === 0) return []
  const header = splitRiga(righe[0], sep)
  const idxArt = trovaColonna(header, ['codicearticolo', 'articolo', 'codart', 'cod_articolo', 'codice articolo'])
  const idxMag = trovaColonna(header, ['codicemagazzino', 'magazzino', 'codmag', 'cod_magazzino', 'codice magazzino', 'deposito'])
  const idxQta = trovaColonna(header, ['giacenza', 'quantita', 'quantità', 'qta', 'qty', 'esistenza', 'quantitagiacenza'])
  if (idxArt < 0 || idxQta < 0) {
    throw new Error("Intestazione CSV non riconosciuta: servono almeno le colonne 'Articolo' e 'Giacenza/Quantità'.")
  }
  const out: MexalGiacenza[] = []
  for (const r of righe.slice(1)) {
    const campi = splitRiga(r, sep)
    if (campi.length === 0 || idxArt >= campi.length) continue
    const dto: MexalGiacenza = {
      CodiceArticolo: campi[idxArt],
      CodiceMagazzino: idxMag >= 0 && idxMag < campi.length ? campi[idxMag] : '',
      Quantita: parseDecimale(idxQta < campi.length ? campi[idxQta] : '0'),
    }
    if (dto.CodiceArticolo && dto.CodiceArticolo.trim()) out.push(dto)
  }
  return out
}
