import { route } from '@/lib/api'
import { anteprimaSenzaAffilatura, togliAffilaturaDaiCicli } from '@/lib/services/cicli'

/** Articoli con le parole chiave (HDRED, TIN, ...) il cui ciclo ha ancora l'affilatura (nessuna modifica). */
export const GET = route({ admin: true, indirizzo: 'Brighetti_Procedure/TogliAffilatura' }, async () => {
  return { ok: true, ...(await anteprimaSenzaAffilatura()) }
})

/** Toglie l'affilatura dai cicli di quegli articoli (saltando quelli con ODP aperti). */
export const POST = route({ admin: true, indirizzo: 'Brighetti_Procedure/TogliAffilatura' }, async ({ op }) => {
  const r = await togliAffilaturaDaiCicli(op)
  const extra = r.saltati.length
    ? ` ${r.saltati.length} articoli saltati perché hanno ODP ancora aperti (${r.saltati.slice(0, 10).join(', ')}${r.saltati.length > 10 ? '...' : ''}): riprovare quando gli ODP sono chiusi.`
    : ''
  return { ok: true, message: `Affilatura tolta dal ciclo di ${r.modificati} articoli.${extra}`, ...r }
})
