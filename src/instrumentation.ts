export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (!process.env.TZ) process.env.TZ = process.env.APP_TIMEZONE || 'Europe/Rome'
    const secret = process.env.SESSION_SECRET || ''
    if (process.env.NODE_ENV === 'production' && secret.length < 32) {
      console.error('[config] SESSION_SECRET mancante o troppo corto (min. 32 caratteri): il login non funzionera\'.')
    }
    // Durante `next build` non avviamo job ne' connessioni al DB.
    if (process.env.NEXT_PHASE === 'phase-production-build') return
    const { avviaScheduler } = await import('@/lib/scheduler')
    avviaScheduler()
  }
}
