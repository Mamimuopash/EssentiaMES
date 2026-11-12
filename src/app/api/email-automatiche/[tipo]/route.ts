import { route, readJson, str, ApiError } from '@/lib/api'
import { anteprima, inviaMailOdp, inviaMailUsoMacchine } from '@/lib/services/report-email'

/*
 * Email automatiche dal pannello Automazioni:
 *  GET  /api/email-automatiche/odp|macchine[?giorno=yyyy-mm-dd]  -> anteprima HTML (non invia nulla)
 *  POST /api/email-automatiche/odp|macchine { destinatari?, giorno? } -> invio immediato
 */

function tipoValido(t: string): 'odp' | 'macchine' {
  if (t === 'odp' || t === 'macchine') return t
  throw new ApiError(404, 'Email sconosciuta.')
}

function giorno(v: string | null | undefined): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((v || '').trim())
  if (!m) return undefined
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)
  return Number.isNaN(d.getTime()) ? undefined : d
}

export const GET = route<{ tipo: string }>({ admin: true, indirizzo: 'EmailAutomatiche/Anteprima' }, async ({ req, params }) => {
  const html = await anteprima(tipoValido(params.tipo), giorno(req.nextUrl.searchParams.get('giorno')))
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
      'Cache-Control': 'no-store',
    },
  })
})

export const POST = route<{ tipo: string }>({ admin: true, indirizzo: 'EmailAutomatiche/InvioManuale' }, async ({ req, params, op }) => {
  const tipo = tipoValido(params.tipo)
  const b = await readJson<{ destinatari?: unknown; giorno?: unknown }>(req)
  const opts = { destinatari: str(b.destinatari)?.trim() || undefined, riferimento: giorno(str(b.giorno)) }
  return tipo === 'odp' ? inviaMailOdp(op, opts) : inviaMailUsoMacchine(op, opts)
})
