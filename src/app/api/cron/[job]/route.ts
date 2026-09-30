import crypto from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { jobOrdiniAutomatici, jobSyncMexal } from '@/lib/scheduler'

/*
 * Esecuzione dei job pianificati da uno scheduler ESTERNO (cron di sistema,
 * Vercel Cron, Task Scheduler...), in alternativa allo scheduler interno.
 * Richiede: Authorization: Bearer <CRON_SECRET>. I job rispettano gli interruttori.
 */
async function handle(req: NextRequest, { params }: { params: Promise<{ job: string }> }) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  const atteso = `Bearer ${secret}`
  if (!secret || auth.length !== atteso.length || !crypto.timingSafeEqual(Buffer.from(auth), Buffer.from(atteso))) {
    return NextResponse.json({ ok: false, message: 'Non autorizzato' }, { status: 401 })
  }
  const { job } = await params
  if (job === 'ordini-automatici') return NextResponse.json({ ok: true, esito: await jobOrdiniAutomatici() })
  if (job === 'sync-mexal') return NextResponse.json({ ok: true, esito: await jobSyncMexal() })
  return NextResponse.json({ ok: false, message: 'Job sconosciuto' }, { status: 404 })
}

export const GET = handle
export const POST = handle
