import { describe, expect, it } from 'vitest'
import {
  calcolaQuantitaProposta,
  efficienzaDaIntervalli,
  efficienzaDaLetture,
  jobOrdiniDaEseguire,
  parseOra,
  parsePrefissi,
  codiceInAutomatismo,
  parseOrari,
  eOrario,
  parseGiornoSettimana,
  nomeGiorno,
  sottoScorta,
} from '@/lib/services/regole'
import { dateDiffMinutes, fmtDate, fmtDateTime, vbCInt } from '@/lib/format'

describe('ordini automatici', () => {
  it('prefissi', () => {
    expect(parsePrefissi('G8, G12 ,,')).toEqual(['G8', 'G12'])
    expect(parsePrefissi('')).toEqual([])
    expect(parsePrefissi(null)).toEqual([])
  })
  it('sotto scorta solo con punto di riordino definito', () => {
    expect(sottoScorta(5, 0, 0)).toBe(false)
    expect(sottoScorta(5, 0, 5)).toBe(true)
    expect(sottoScorta(3, 3, 5)).toBe(false)
  })
  it('quantità proposta: scorta massima, moltiplicatore e lotto minimo', () => {
    // scorta massima impostata: 100 - (10 + 0) = 90 -> lotto 50 -> 100
    expect(calcolaQuantitaProposta({ giacenza: 10, inArrivo: 0, scortaMinima: 20, scortaMassima: 100, moltiplicatore: 2, lottoMinimo: 50 })).toBe(100)
    // senza scorta massima: 2 x 20 = 40 - 10 = 30, nessun lotto minimo
    expect(calcolaQuantitaProposta({ giacenza: 10, inArrivo: 0, scortaMinima: 20, scortaMassima: 0, moltiplicatore: 2, lottoMinimo: 0 })).toBe(30)
    // fabbisogno nullo
    expect(calcolaQuantitaProposta({ giacenza: 50, inArrivo: 0, scortaMinima: 20, scortaMassima: 40, moltiplicatore: 2, lottoMinimo: 10 })).toBe(0)
    // multiplo esatto del lotto
    expect(calcolaQuantitaProposta({ giacenza: 0, inArrivo: 0, scortaMinima: 10, scortaMassima: 30, moltiplicatore: 2, lottoMinimo: 15 })).toBe(30)
  })
})

describe('scheduler', () => {
  it('ora sync con default 02:00', () => {
    expect(parseOra('06:30')).toEqual([6, 30])
    expect(parseOra('xx')).toEqual([2, 0])
    expect(parseOra('25:99')).toEqual([2, 0])
  })
  it('intervallo ordini come il cron Hangfire', () => {
    const d = (m: number) => new Date(2026, 0, 1, 10, m)
    expect(jobOrdiniDaEseguire(d(0), 60)).toBe(true)
    expect(jobOrdiniDaEseguire(d(30), 60)).toBe(false)
    expect(jobOrdiniDaEseguire(d(30), 15)).toBe(true)
    expect(jobOrdiniDaEseguire(d(31), 15)).toBe(false)
    expect(jobOrdiniDaEseguire(d(0), 0)).toBe(true)
  })
})

describe('efficienza macchine (turno 480 minuti)', () => {
  it('letture MTConnect consecutive', () => {
    const base = new Date(2026, 0, 1, 8, 0, 0)
    const letture = [0, 10, 20, 30].map((m) => new Date(base.getTime() + m * 60000))
    expect(efficienzaDaLetture(letture)).toEqual({ minuti: 30, perc: 6, percFermo: 94 })
    expect(efficienzaDaLetture([])).toEqual({ minuti: 0, perc: 0, percFermo: 100 })
  })
  it('intervalli CSV', () => {
    const i = new Date(2026, 0, 1, 8, 0)
    const f = new Date(2026, 0, 1, 12, 0)
    expect(efficienzaDaIntervalli([{ inizio: i, fine: f }])).toEqual({ minuti: 240, perc: 50, percFermo: 50 })
  })
})

describe('formati e funzioni VB', () => {
  it('DateDiff minuti conta i confini di minuto', () => {
    expect(dateDiffMinutes(new Date(2026, 0, 1, 8, 0, 59), new Date(2026, 0, 1, 8, 1, 0))).toBe(1)
    expect(dateDiffMinutes(new Date(2026, 0, 1, 8, 0, 0), new Date(2026, 0, 1, 8, 0, 59))).toBe(0)
  })
  it('CInt arrotonda al pari', () => {
    expect(vbCInt(2.5)).toBe(2)
    expect(vbCInt(3.5)).toBe(4)
    expect(vbCInt(6.25)).toBe(6)
  })
  it('date nel fuso Europe/Rome', () => {
    const d = new Date('2026-07-15T08:05:09Z') // 10:05:09 ora legale italiana
    expect(fmtDateTime(d)).toBe('15/07/2026 10:05:09')
    expect(fmtDate(d)).toBe('15/07/2026')
  })
})

describe('esclusioni e orari degli automatismi', () => {
  it('prefissi esclusi (es. G8A) hanno la precedenza sugli inclusi', () => {
    expect(codiceInAutomatismo('G8A-100', ['G8'], ['G8A'])).toBe(false)
    expect(codiceInAutomatismo('g8a-100', ['G8'], ['G8A'])).toBe(false)
    expect(codiceInAutomatismo('G8B-100', ['G8'], ['G8A'])).toBe(true)
    expect(codiceInAutomatismo('G12-1', ['G8'], ['G8A'])).toBe(false)
    expect(codiceInAutomatismo('X1', [], [])).toBe(true)
    expect(codiceInAutomatismo('G8A1', [], ['G8A'])).toBe(false)
    expect(codiceInAutomatismo(null, [], ['G8A'])).toBe(true)
  })
  it('orari fissi', () => {
    expect(parseOrari('20:30, 21:00')).toEqual([[20, 30], [21, 0]])
    expect(parseOrari('20.00;21:00 21:00')).toEqual([[20, 0], [21, 0]])
    expect(parseOrari('20:00/21:00')).toEqual([[20, 0], [21, 0]])
    expect(parseOrari('25:00, 8, abc, 7:5')).toEqual([])
    expect(parseOrari('')).toEqual([])
    const d = new Date(2026, 10, 12, 20, 30, 0)
    expect(eOrario(d, [[20, 30]])).toBe(true)
    expect(eOrario(d, [[20, 0], [21, 0]])).toBe(false)
  })
  it('giorno della settimana', () => {
    expect(parseGiornoSettimana('venerdì')).toBe(5)
    expect(parseGiornoSettimana('Ven')).toBe(5)
    expect(parseGiornoSettimana('1')).toBe(1)
    expect(parseGiornoSettimana('7')).toBe(0)
    expect(parseGiornoSettimana('domenica')).toBe(0)
    expect(parseGiornoSettimana('mer')).toBe(3)
    expect(parseGiornoSettimana('mar')).toBe(2)
    expect(parseGiornoSettimana('xx', 4)).toBe(4)
    expect(parseGiornoSettimana('', 5)).toBe(5)
    expect(nomeGiorno(5)).toBe('venerdì')
  })
})
