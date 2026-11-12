import { describe, expect, it } from 'vitest'
import { parolaSenzaAffilatura, parseParoleChiave, templateCiclo, templateCicloGenerico, togliAffilatura } from '@/lib/services/cicli-template'

describe('cicli di lavoro automatici', () => {
  it('codici G / PCM / SG -> ciclo brocce G (10 fasi, lavorazione e versamento alternati)', () => {
    for (const c of ['G8-001', 'GT12', 'PCM5', 'SGPCM1']) {
      const t = templateCiclo(c)!
      expect(t).toHaveLength(10)
      expect(t[0].risorsa).toBe('Mazak 200MSY L')
      expect(t.map((f) => f.tipo)).toEqual([1, 2, 1, 2, 1, 2, 1, 2, 1, 2])
      expect(t[5]).toMatchObject({ risorsa: 'Magazzino Rettifica', nome: 'Versamento da Trattamento a Rettifica' })
    }
  })
  it('codici con B -> ciclo brocce B', () => {
    const t = templateCiclo('XBA10')!
    expect(t[0].risorsa).toBe('Mazak 250 MSY')
    expect(t[6].risorsa).toBe('Macchina_Brunitura')
  })
  it('altri codici -> nessun ciclo automatico', () => {
    expect(templateCiclo('XYZ')).toBeNull()
  })
  it('ciclo generico per la generazione massiva', () => {
    expect(templateCicloGenerico()).toHaveLength(8)
  })
})

describe('articoli senza affilatura (HDRED, TIN, WONDER, WOND, ZIRI, INOX)', () => {
  const parole = parseParoleChiave('HDRED, Tin, wonder, wond, ziri, Inox')
  it('parole chiave', () => {
    expect(parole).toEqual(['HDRED', 'TIN', 'WONDER', 'WOND', 'ZIRI', 'INOX'])
  })
  it('riconoscimento nel codice o nella descrizione, a inizio parola', () => {
    expect(parolaSenzaAffilatura('G8-100', 'Broccia rivestita TiN', parole)).toBe('TIN')
    expect(parolaSenzaAffilatura('G8-INOX-2', '', parole)).toBe('INOX')
    expect(parolaSenzaAffilatura('G8-1', 'broccia Wonderline', parole)).toBe('WONDER')
    expect(parolaSenzaAffilatura('G8-1', 'Hdred', parole)).toBe('HDRED')
    expect(parolaSenzaAffilatura('G8-1', 'finitura satinato', parole)).toBeNull()
    expect(parolaSenzaAffilatura('G8-1', null, parole)).toBeNull()
  })
  it('ciclo G senza affilatura: 8 fasi rinumerate, ultimo versamento a Finito', () => {
    const t = togliAffilatura(templateCiclo('G8-001')!)
    expect(t).toHaveLength(8)
    expect(t.map((f) => f.incrementale)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(t.map((f) => f.tipo)).toEqual([1, 2, 1, 2, 1, 2, 1, 2])
    expect(t.some((f) => /affilatura/i.test(f.nome) || /Schneberger|Affilatura/.test(f.risorsa))).toBe(false)
    expect(t[7]).toMatchObject({ risorsa: 'Magazzino Finito', nome: 'Versamento da Rettifica a Finito' })
  })
  it('ciclo generico senza affilatura e ciclo B invariato', () => {
    const g = togliAffilatura(templateCicloGenerico())
    expect(g).toHaveLength(6)
    expect(g[5]).toMatchObject({ incrementale: 6, risorsa: 'Magazzino Finito', nome: 'Versamento Finito' })
    const b = templateCiclo('XBA10')!
    expect(togliAffilatura(b)).toEqual(b)
  })
})
