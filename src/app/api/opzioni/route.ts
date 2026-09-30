import { route, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { Ruoli } from '@/lib/enums'

/** Valori per i menu a tendina dei form. */
export const GET = route({ admin: true, indirizzo: 'Opzioni' }, async ({ req }) => {
  const tipo = req.nextUrl.searchParams.get('tipo')
  switch (tipo) {
    case 'famiglie':
      return { ok: true, items: await db.query(`SELECT Id AS value, NomeFamiglia AS label FROM dbo.Brighetti_FamiglieProdotto ORDER BY NomeFamiglia`) }
    case 'articoli':
      return { ok: true, items: await db.query(`SELECT Id AS value, CodiceArticolo AS label FROM dbo.Brighetti_Articoli ORDER BY CodiceArticolo`) }
    case 'magazzini':
      return { ok: true, items: await db.query(`SELECT Id AS value, CodiceMagazzino AS label FROM dbo.Brighetti_Magazzini ORDER BY CodiceMagazzino`) }
    case 'reparti':
      return { ok: true, items: await db.query(`SELECT IdReparto AS value, NomeReparto AS label FROM dbo.Brighetti_Reparti ORDER BY NomeReparto`) }
    case 'macchine':
      return { ok: true, items: await db.query(`SELECT IdMacchina AS value, NomeMacchina AS label, IdReparto AS reparto FROM dbo.Brighetti_Macchine ORDER BY NomeMacchina`) }
    case 'operatori':
      return {
        ok: true,
        items: await db.query(
          `SELECT u.Id AS value, u.UserName AS label FROM dbo.AspNetUsers u
            WHERE EXISTS (SELECT 1 FROM dbo.AspNetUserRoles ur JOIN dbo.AspNetRoles r ON r.Id = ur.RoleId WHERE ur.UserId = u.Id AND r.Name = @r)
            ORDER BY u.UserName`,
          { r: Ruoli.Operatore },
        ),
      }
    default:
      throw new ApiError(400, 'Tipo opzioni non valido.')
  }
})
