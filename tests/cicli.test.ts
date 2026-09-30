import { describe, expect, it } from 'vitest'
import { templateCiclo, templateCicloGenerico } from '@/lib/services/cicli-template'

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
