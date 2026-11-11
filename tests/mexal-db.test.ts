import { describe, expect, it } from 'vitest'
import { indiceMagazzini, nomeOggettoSql, preparaRigheVista, vistaSenzaMagazzino } from '@/lib/services/mexal-db'

describe('nomeOggettoSql', () => {
  it('racchiude ogni parte tra parentesi quadre', () => {
    expect(nomeOggettoSql('dbo.EssentiaMES_GiacenzeMexal')).toBe('[dbo].[EssentiaMES_GiacenzeMexal]')
    expect(nomeOggettoSql(' Mexal_Frontier.dbo.Articoli ')).toBe('[Mexal_Frontier].[dbo].[Articoli]')
    expect(nomeOggettoSql('[Brighetti].[dbo].[Vista Mexal]')).toBe('[Brighetti].[dbo].[Vista Mexal]')
  })
  it('rifiuta nomi vuoti o pericolosi', () => {
    expect(() => nomeOggettoSql('')).toThrow(/non configurata/)
    expect(() => nomeOggettoSql('dbo.x; DROP TABLE y')).toThrow(/non valido/)
    expect(() => nomeOggettoSql("dbo.x'--")).toThrow(/non valido/)
    expect(() => nomeOggettoSql('a.b.c.d')).toThrow(/non valido/)
  })
})

describe('preparaRigheVista', () => {
  const magazzini = indiceMagazzini([
    { Id: 6, CodiceMagazzino: 'Magazzino Finito' },
    { Id: 2, CodiceMagazzino: 'Magazzino Fresatura' },
  ])
  const articoli = new Set(['BR-G8M-C-20', 'BRC-G8-C-10'])

  it('usa il magazzino predefinito (nome -> Id) quando la vista non ha la colonna Magazzino', () => {
    const righe = [
      { Articolo: 'BR-G8M-C-20  ', Giacenza: 5 },
      { articolo: 'brc-g8-c-10', GIACENZA: '1,5' },
      { Articolo: 'B25-20-70', Giacenza: 117 },
    ]
    expect(vistaSenzaMagazzino(righe)).toBe(true)
    const r = preparaRigheVista(righe, { articoli, magazzini, soloAnagrafica: true, magazzinoPredefinito: 'magazzino finito' })
    expect(r.righe).toEqual([
      { CodiceArticolo: 'BR-G8M-C-20', CodiceMagazzino: '6', Quantita: 5 },
      { CodiceArticolo: 'brc-g8-c-10', CodiceMagazzino: '6', Quantita: 1.5 },
    ])
    expect(r.ignorate).toBe(1)
  })

  it('senza filtro anagrafica tiene tutti gli articoli', () => {
    const r = preparaRigheVista([{ Articolo: 'B25-20-70', Giacenza: 117 }], { articoli, magazzini, soloAnagrafica: false, magazzinoPredefinito: '6' })
    expect(r.righe).toEqual([{ CodiceArticolo: 'B25-20-70', CodiceMagazzino: '6', Quantita: 117 }])
  })

  it('legge le colonne facoltative e scarta magazzini sconosciuti e righe incomplete', () => {
    const r = preparaRigheVista(
      [
        { Articolo: 'BR-G8M-C-20', Magazzino: 'Magazzino Fresatura', Giacenza: 3, ScortaMinima: 2, InArrivo: 10 },
        { Articolo: 'BR-G8M-C-20', Magazzino: 'Inesistente', Giacenza: 3 },
        { Articolo: 'BRC-G8-C-10', Magazzino: '6', Giacenza: null },
        { Articolo: null, Magazzino: '6', Giacenza: 1 },
      ],
      { articoli, magazzini, soloAnagrafica: true },
    )
    expect(r.righe).toEqual([{ CodiceArticolo: 'BR-G8M-C-20', CodiceMagazzino: '2', Quantita: 3, ScortaMinima: 2, InArrivo: 10 }])
    expect(r.ignorate).toBe(3)
  })
})
