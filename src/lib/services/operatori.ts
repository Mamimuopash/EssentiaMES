import 'server-only'
import { db } from '@/lib/db'
import type { CurrentUser } from '@/lib/auth/auth'

/* Associazione operatore -> macchina (tabella AspNetMacchineUsers). */

export async function collegamentoUtente(userId: string) {
  return db.one<{ Id: number; IdMacchina: number; IdReparto: number }>(
    `SELECT TOP 1 Id, IdMacchina, IdReparto FROM dbo.AspNetMacchineUsers WHERE IdUtente = @u ORDER BY Id`,
    { u: userId },
  )
}

export async function puoOperareSuMacchina(user: CurrentUser, idMacchina: number): Promise<boolean> {
  if (user.isAdmin) return true
  const r = await db.one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM dbo.AspNetMacchineUsers WHERE IdUtente = @u AND IdMacchina = @m`,
    { u: user.id, m: idMacchina },
  )
  if (r && r.n > 0) return true
  // Fallback: operatore indicato direttamente sulla macchina (Brighetti_Macchine.IdUtente).
  const m = await db.one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM dbo.Brighetti_Macchine WHERE IdMacchina = @m AND IdUtente = @u`,
    { u: user.id, m: idMacchina },
  )
  return !!m && m.n > 0
}
