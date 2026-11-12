import { describe, expect, it } from 'vitest'
import {
  fmtOreMinuti,
  giorniLavorativi,
  htmlReportMacchine,
  htmlReportOdp,
  oggettoReportMacchine,
  oggettoReportOdp,
  parseDestinatari,
  percentualeUso,
  riepilogoOdp,
  type RigaOdp,
} from '@/lib/services/report-html'

const odp = (x: Partial<RigaOdp>): RigaOdp => ({
  Odp: '12/11/2026_1',
  CodiceArticolo: 'G8-100',
  Quantita: 50,
  Fasi: 4,
  FasiChiuse: 1,
  FaseAttuale: 'Rettifica',
  StatoFaseAttuale: 0,
  PostazioneFaseAttuale: 'Rettifica 1',
  CreatoOggi: true,
  MinAttrezzaggio: 0,
  MinLavorazione: 0,
  ...x,
})

describe('email automatiche', () => {
  it('destinatari', () => {
    expect(parseDestinatari('a@x.it, b@y.com; A@x.it nonvalido')).toEqual({ validi: ['a@x.it', 'b@y.com'], scartati: ['nonvalido'] })
    expect(parseDestinatari('')).toEqual({ validi: [], scartati: [] })
  })
  it('ore e minuti', () => {
    expect(fmtOreMinuti(0)).toBe('0:00')
    expect(fmtOreMinuti(135)).toBe('2:15')
    expect(fmtOreMinuti(-5)).toBe('0:00')
  })
  it('giorni lavorativi e percentuale del turno', () => {
    // da giovedi' 5/11/2026 a giovedi' 12/11/2026 escluso: 5 giorni lavorativi
    expect(giorniLavorativi(new Date(2026, 10, 5), new Date(2026, 10, 12))).toBe(5)
    expect(percentualeUso(480 * 5, 5)).toBe(100)
    expect(percentualeUso(240, 5)).toBe(10)
    expect(percentualeUso(100, 0)).toBe(0)
  })
  it('report ODP: riepilogo, oggetto ed escape HTML', () => {
    const r = {
      giorno: new Date(2026, 10, 12),
      odpAperti: 7,
      righe: [
        odp({ MinLavorazione: 90 }),
        odp({ Odp: '10/11/2026_5', CreatoOggi: false, FasiChiuse: 4, MinAttrezzaggio: 15, CodiceArticolo: '<script>x</script>' }),
      ],
    }
    expect(riepilogoOdp(r)).toEqual({ creati: 1, lavorati: 2, completati: 1, minuti: 105 })
    expect(oggettoReportOdp(r)).toBe('EssentiaMES - ODP del 12/11/2026 (1 nuovi, 2 lavorati)')
    const html = htmlReportOdp(r, 'http://server:3000')
    expect(html).toContain('12/11/2026_1')
    expect(html).toContain('NUOVO')
    expect(html).toContain('Completato')
    expect(html).toContain('Rettifica 1')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
    expect(htmlReportOdp({ giorno: new Date(2026, 10, 12), odpAperti: 0, righe: [] })).toContain('Nessun ODP')
  })
  it('report uso macchine: ordinamento e macchine mai usate', () => {
    const base = { Reparto: 'Rettifiche', Attivita: 0, Odp: 0, Giorni: 0, UltimoUso: null, MinAttrezzaggio: 0, MinLavorazione: 0 }
    const r = {
      da: new Date(2026, 10, 5),
      a: new Date(2026, 10, 12),
      righe: [
        { ...base, IdMacchina: 1, NomeMacchina: 'Ferma' },
        { ...base, IdMacchina: 2, NomeMacchina: 'Usata', MinLavorazione: 600, MinAttrezzaggio: 60, Attivita: 3, Odp: 2, Giorni: 2, UltimoUso: new Date(2026, 10, 11, 17, 0) },
      ],
    }
    expect(oggettoReportMacchine(r)).toBe('EssentiaMES - Uso macchine dal 05/11/2026 al 11/11/2026 (1/2 usate)')
    const html = htmlReportMacchine(r)
    expect(html.indexOf('Usata')).toBeLessThan(html.indexOf('Ferma'))
    expect(html).toContain('11:00')
    expect(html).toContain('mai')
    expect(html).toContain('28%')
  })
})
