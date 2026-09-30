import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, verifySession } from '@/lib/auth/session'

/*
 * Controllo "ottimistico" sulle pagine: senza sessione valida -> /login.
 * Le API verificano da sole utente e ruoli (src/lib/api.ts), qui sono escluse.
 */
export async function proxy(req: NextRequest) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value)
  if (!session) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.search = req.nextUrl.pathname !== '/' ? `?returnUrl=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}` : ''
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|login|_next/static|_next/image|assets|favicon.ico).*)'],
}
