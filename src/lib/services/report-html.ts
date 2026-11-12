/*
 * Contenuto delle email automatiche (ODP giornalieri, uso settimanale delle macchine).
 * Modulo "puro" (nessun accesso al DB): testato in tests/report-html.test.ts.
 * HTML con stili in linea, l'unico formato letto bene da tutti i client di posta.
 */
import { fmtDate, fmtDateTimeShort } from '@/lib/format'
import { TipoStatoAttivitaLabel } from '@/lib/enums'
import { MINUTI_TURNO } from './regole'

/** Destinatari dal pannello ("a@x.it, b@y.it; c@z.it"): validi e scartati. */
export function parseDestinatari(testo: string | null | undefined): { validi: string[]; scartati: string[] } {
  const validi: string[] = []
  const scartati: string[] = []
  for (const voce of (testo || '').split(/[,;\s]+/)) {
    const v = voce.trim()
    if (!v) continue
    if (/^[^@\s<>"]+@[^@\s<>"]+\.[^@\s<>"]+$/.test(v)) {
      if (!validi.some((x) => x.toLowerCase() === v.toLowerCase())) validi.push(v)
    } else scartati.push(v)
  }
  return { validi, scartati }
}

/** Minuti -> "h:mm" (es. 135 -> "2:15"). */
export function fmtOreMinuti(minuti: number): string {
  const m = Math.max(0, Math.round(minuti || 0))
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}

/** Giorni lavorativi (lunedi'-venerdi') nell'intervallo [da, a). */
export function giorniLavorativi(da: Date, a: Date): number {
  let n = 0
  const d = new Date(da.getFullYear(), da.getMonth(), da.getDate())
  while (d < a) {
    const g = d.getDay()
    if (g !== 0 && g !== 6) n++
    d.setDate(d.getDate() + 1)
  }
  return n
}

function esc(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

const TH = 'style="text-align:left;padding:6px 8px;border-bottom:2px solid #c9ced6;background:#f3f5f8;font-size:13px"'
const TD = 'style="padding:6px 8px;border-bottom:1px solid #e3e6eb;font-size:13px;vertical-align:top"'
const TDR = 'style="padding:6px 8px;border-bottom:1px solid #e3e6eb;font-size:13px;text-align:right;white-space:nowrap"'

function pagina(titolo: string, sottotitolo: string, corpo: string, appUrl?: string) {
  const link = appUrl ? `<p style="font-size:12px;color:#6b7280">Apri EssentiaMES: <a href="${esc(appUrl)}">${esc(appUrl)}</a></p>` : ''
  return `<!DOCTYPE html><html><body style="margin:0;padding:16px;font-family:Segoe UI,Arial,sans-serif;color:#1f2937">
<h2 style="margin:0 0 4px 0;font-size:20px">${esc(titolo)}</h2>
<p style="margin:0 0 16px 0;color:#6b7280;font-size:13px">${esc(sottotitolo)}</p>
${corpo}
${link}
<p style="font-size:11px;color:#9ca3af">Email automatica di EssentiaMES: destinatari e orario si cambiano dal pannello Automazioni.</p>
</body></html>`
}

function riquadri(voci: [string, string | number][]) {
  const celle = voci
    .map(
      ([etichetta, valore]) =>
        `<td style="padding:8px 14px;border:1px solid #e3e6eb;border-radius:6px;text-align:center"><div style="font-size:20px;font-weight:bold">${esc(valore)}</div><div style="font-size:12px;color:#6b7280">${esc(etichetta)}</div></td>`,
    )
    .join('<td style="width:8px"></td>')
  return `<table cellspacing="0" cellpadding="0" style="margin-bottom:16px"><tr>${celle}</tr></table>`
}

/* ------------------------------------------------------------- ODP giornalieri */

export interface RigaOdp {
  Odp: string
  CodiceArticolo: string | null
  Quantita: number
  Fasi: number
  FasiChiuse: number
  FaseAttuale: string | null
  StatoFaseAttuale: number | null
  PostazioneFaseAttuale: string | null
  CreatoOggi: boolean
  MinAttrezzaggio: number
  MinLavorazione: number
}

export interface ReportOdp {
  giorno: Date
  righe: RigaOdp[]
  /** ODP con almeno una fase ancora da chiudere (in tutto il database). */
  odpAperti: number
}

export function riepilogoOdp(r: ReportOdp) {
  return {
    creati: r.righe.filter((x) => x.CreatoOggi).length,
    lavorati: r.righe.filter((x) => x.MinAttrezzaggio + x.MinLavorazione > 0).length,
    completati: r.righe.filter((x) => x.Fasi > 0 && x.FasiChiuse >= x.Fasi).length,
    minuti: r.righe.reduce((s, x) => s + x.MinAttrezzaggio + x.MinLavorazione, 0),
  }
}

export function oggettoReportOdp(r: ReportOdp) {
  const s = riepilogoOdp(r)
  return `EssentiaMES - ODP del ${fmtDate(r.giorno)} (${s.creati} nuovi, ${s.lavorati} lavorati)`
}

export function htmlReportOdp(r: ReportOdp, appUrl?: string): string {
  const s = riepilogoOdp(r)
  const testa = riquadri([
    ['ODP creati oggi', s.creati],
    ['ODP lavorati oggi', s.lavorati],
    ['ODP completati', s.completati],
    ['Ore registrate oggi', fmtOreMinuti(s.minuti)],
    ['ODP ancora aperti (totale)', r.odpAperti],
  ])
  let corpo: string
  if (r.righe.length === 0) {
    corpo = `<p>Nessun ODP creato o lavorato in questa giornata.</p>`
  } else {
    const righe = r.righe
      .map((x) => {
        const completato = x.Fasi > 0 && x.FasiChiuse >= x.Fasi
        const fase = completato
          ? '<span style="color:#15803d;font-weight:bold">Completato</span>'
          : x.FaseAttuale
            ? `${esc(x.FaseAttuale)}${x.PostazioneFaseAttuale ? ` <span style="color:#6b7280">(${esc(x.PostazioneFaseAttuale)})</span>` : ''}<br><span style="font-size:12px;color:#6b7280">${esc(TipoStatoAttivitaLabel[x.StatoFaseAttuale ?? -1] ?? '')}</span>`
            : '-'
        return `<tr>
<td ${TD}><b>${esc(x.Odp)}</b>${x.CreatoOggi ? ' <span style="background:#dbeafe;color:#1d4ed8;border-radius:4px;padding:1px 5px;font-size:11px">NUOVO</span>' : ''}</td>
<td ${TD}>${esc(x.CodiceArticolo)}</td>
<td ${TDR}>${esc(x.Quantita)}</td>
<td ${TDR}>${x.FasiChiuse}/${x.Fasi}</td>
<td ${TD}>${fase}</td>
<td ${TDR}>${fmtOreMinuti(x.MinAttrezzaggio)}</td>
<td ${TDR}>${fmtOreMinuti(x.MinLavorazione)}</td>
</tr>`
      })
      .join('')
    corpo = `<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;max-width:1000px">
<tr><th ${TH}>ODP</th><th ${TH}>Articolo</th><th ${TH}>Q.tà</th><th ${TH}>Fasi chiuse</th><th ${TH}>Fase attuale</th><th ${TH}>Attrezz. oggi</th><th ${TH}>Lavoraz. oggi</th></tr>
${righe}
</table>`
  }
  return pagina(`ODP del ${fmtDate(r.giorno)}`, 'ODP creati in giornata e ODP su cui è stato registrato tempo di lavoro.', testa + corpo, appUrl)
}

/* --------------------------------------------------------- uso delle macchine */

export interface RigaUsoMacchina {
  IdMacchina: number
  NomeMacchina: string | null
  Reparto: string | null
  MinAttrezzaggio: number
  MinLavorazione: number
  Attivita: number
  Odp: number
  Giorni: number
  /** Ultima registrazione di tempo in assoluto (anche prima del periodo). */
  UltimoUso: Date | null
}

export interface ReportMacchine {
  da: Date
  a: Date
  righe: RigaUsoMacchina[]
}

const totale = (x: RigaUsoMacchina) => x.MinAttrezzaggio + x.MinLavorazione
/** Usata nel periodo: tempo registrato oppure almeno una fase avviata/chiusa. */
const usata = (x: RigaUsoMacchina) => totale(x) > 0 || x.Attivita > 0

/** Percentuale del tempo disponibile (turno da 8 ore x giorni lavorativi del periodo). */
export function percentualeUso(minuti: number, giorni: number): number {
  if (giorni <= 0) return 0
  return Math.round((minuti * 100) / (MINUTI_TURNO * giorni))
}

/** Ultimo giorno incluso nel periodo [da, a) (a mezzogiorno: nessun problema di fuso nel formato). */
const ultimoGiorno = (a: Date) => new Date(a.getFullYear(), a.getMonth(), a.getDate() - 1, 12)

export function oggettoReportMacchine(r: ReportMacchine) {
  const usate = r.righe.filter(usata).length
  const fine = ultimoGiorno(r.a)
  return `EssentiaMES - Uso macchine dal ${fmtDate(r.da)} al ${fmtDate(fine)} (${usate}/${r.righe.length} usate)`
}

export function htmlReportMacchine(r: ReportMacchine, appUrl?: string): string {
  const gg = giorniLavorativi(r.da, r.a)
  const ordinate = [...r.righe].sort(
    (x, y) => totale(y) - totale(x) || y.Attivita - x.Attivita || (x.NomeMacchina ?? '').localeCompare(y.NomeMacchina ?? ''),
  )
  const usate = ordinate.filter(usata)
  const ferme = ordinate.filter((x) => !usata(x))
  const minTot = usate.reduce((s, x) => s + totale(x), 0)
  const testa = riquadri([
    ['Macchine usate', `${usate.length}/${ordinate.length}`],
    ['Ore registrate', fmtOreMinuti(minTot)],
    ['Giorni lavorativi', gg],
    ['Macchine senza registrazioni', ferme.length],
  ])
  const fine = ultimoGiorno(r.a)
  const riga = (x: RigaUsoMacchina) => {
    const t = totale(x)
    const perc = percentualeUso(t, gg)
    const colore = !usata(x) ? '#b91c1c' : perc < 25 ? '#b45309' : '#15803d'
    return `<tr>
<td ${TD}><b>${esc(x.NomeMacchina ?? `Macchina ${x.IdMacchina}`)}</b>${x.Reparto ? `<br><span style="font-size:12px;color:#6b7280">${esc(x.Reparto)}</span>` : ''}</td>
<td ${TDR}>${fmtOreMinuti(x.MinAttrezzaggio)}</td>
<td ${TDR}>${fmtOreMinuti(x.MinLavorazione)}</td>
<td ${TDR}><b>${fmtOreMinuti(t)}</b></td>
<td ${TDR}><span style="color:${colore};font-weight:bold">${perc}%</span></td>
<td ${TDR}>${x.Giorni}</td>
<td ${TDR}>${x.Attivita}</td>
<td ${TDR}>${x.Odp}</td>
<td ${TD}>${x.UltimoUso ? esc(fmtDateTimeShort(x.UltimoUso)) : '<span style="color:#b91c1c">mai</span>'}</td>
</tr>`
  }
  const tabella = `<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;max-width:1000px">
<tr><th ${TH}>Macchina</th><th ${TH}>Attrezzaggio</th><th ${TH}>Lavorazione</th><th ${TH}>Totale</th><th ${TH}>% turno</th><th ${TH}>Giorni con attività</th><th ${TH}>Fasi</th><th ${TH}>ODP</th><th ${TH}>Ultimo utilizzo</th></tr>
${ordinate.map(riga).join('')}
</table>`
  const nota = `<p style="font-size:12px;color:#6b7280">Tempi registrati dagli operatori su EssentiaMES (avvio/sospensione/chiusura delle attività). "% turno" = ore registrate rispetto a un turno di 8 ore per ${gg} giorni lavorativi. In rosso le macchine senza alcuna registrazione nel periodo.</p>`
  return pagina(
    `Uso delle macchine su EssentiaMES`,
    `Periodo: dal ${fmtDate(r.da)} al ${fmtDate(fine)}`,
    testa + (ordinate.length ? tabella : '<p>Nessuna macchina in anagrafica.</p>') + nota,
    appUrl,
  )
}
