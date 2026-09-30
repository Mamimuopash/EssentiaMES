import { NextResponse } from 'next/server'
import { ping } from '@/lib/db'

/** Stato applicazione e connessione al database (per monitoraggio / healthcheck Docker). */
export async function GET() {
  const db = await ping()
  return NextResponse.json({ ok: db.ok, app: 'EssentiaMES', db: db.ok ? 'connesso' : 'non raggiungibile', error: db.ok ? undefined : 'Database non raggiungibile' }, { status: db.ok ? 200 : 503 })
}
