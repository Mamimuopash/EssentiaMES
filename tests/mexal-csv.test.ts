import { describe, expect, it } from 'vitest'
import { decodificaTesto, leggiCsvMexal, parseDecimale, splitRiga } from '@/lib/services/mexal-csv'

describe('CSV Mexal', () => {
  it('riconosce le colonne dall intestazione', () => {
    const csv = 'Codice Articolo;Deposito;Esistenza\nG8-001;1;12,5\n"B12;X";2;7\n\n;3;1\n'
    expect(leggiCsvMexal(csv, ';')).toEqual([
      { CodiceArticolo: 'G8-001', CodiceMagazzino: '1', Quantita: 12.5 },
      { CodiceArticolo: 'B12;X', CodiceMagazzino: '2', Quantita: 7 },
    ])
  })
  it('funziona senza colonna magazzino e con separatore virgola', () => {
    expect(leggiCsvMexal('articolo,qta\nA1,3', ',')).toEqual([{ CodiceArticolo: 'A1', CodiceMagazzino: '', Quantita: 3 }])
  })
  it('errore se mancano le colonne obbligatorie', () => {
    expect(() => leggiCsvMexal('foo;bar\n1;2')).toThrow(/Intestazione CSV non riconosciuta/)
  })
  it('numeri in formato italiano e internazionale', () => {
    expect(parseDecimale('12,5')).toBe(12.5)
    expect(parseDecimale('1.234,56')).toBe(1234.56)
    expect(parseDecimale('1,234.56')).toBe(1234.56)
    expect(parseDecimale('12.5')).toBe(12.5)
    expect(parseDecimale('')).toBe(0)
    expect(parseDecimale('abc')).toBe(0)
  })
  it('virgolette raddoppiate e BOM', () => {
    expect(splitRiga('"a ""b""";c', ';')).toEqual(['a "b"', 'c'])
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, 0x61])
    expect(decodificaTesto(bom)).toBe('a')
    expect(decodificaTesto(new Uint8Array([0x51, 0xe0]))).toBe('Qà') // Windows-1252
  })
})
