import 'server-only'
import nodemailer from 'nodemailer'
import { db, withTransaction } from '@/lib/db'
import { writeAudit, writeLog, safeLog, L, type Operatore } from '@/lib/audit'

/*
 * Richieste materiali (tabelle legacy OrdiniInCorso -> Ordini) con notifica email,
 * porting di HomeController.Carrello/InserisciArticoloDaOrdinare/InviaRichiestaAmministratore.
 */

export interface RigaCarrello {
  Id: number
  IdArticolo: number
  QtaArticolo: number
  NomeArticolo: string | null
  DescrizioneArticolo: string | null
  UltimaModifica_Data: Date | null
}

export async function carrello(opId: string): Promise<RigaCarrello[]> {
  return db.query<RigaCarrello>(
    `SELECT o.Id, o.IdArticolo, o.QtaArticolo, a.Nome_Articolo AS NomeArticolo, a.Descrizione_Articolo AS DescrizioneArticolo, o.UltimaModifica_Data
       FROM dbo.OrdiniInCorso o LEFT JOIN dbo.Articoli a ON a.Id = o.IdArticolo
      WHERE o.UltimaModifica_OperatoreID = @op ORDER BY o.Id`,
    { op: opId },
  )
}

export async function articoliRichiedibili(q?: string | null) {
  return db.query<{ Id: number; Nome_Articolo: string | null; Descrizione_Articolo: string | null }>(
    `SELECT Id, Nome_Articolo, Descrizione_Articolo FROM dbo.Articoli
      WHERE ArticoloCancellato = 0 AND (@q IS NULL OR Nome_Articolo LIKE N'%' + @q + N'%') ORDER BY Nome_Articolo`,
    { q: q && q.trim() ? q.trim() : null },
  )
}

export async function aggiungiAlCarrello(idArticolo: number, qta: number, op: Operatore) {
  const n = await db.exec(
    `UPDATE TOP (1) dbo.OrdiniInCorso SET QtaArticolo = QtaArticolo + @qta WHERE UltimaModifica_OperatoreID = @opId AND IdArticolo = @id`,
    { id: idArticolo, qta, opId: op.id },
  )
  if (n === 0) {
    await db.exec(
      `INSERT INTO dbo.OrdiniInCorso (IdArticolo, QtaArticolo, UltimaModifica_OperatoreID, UltimaModifica_Operatore, UltimaModifica_Data)
       VALUES (@id, @qta, @opId, @opName, @now)`,
      { id: idArticolo, qta, opId: op.id, opName: op.name, now: new Date() },
    )
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

export function smtpConfigurato() {
  return !!process.env.SMTP_HOST && !!process.env.SMTP_RICHIESTE_MATERIALI_TO
}

async function inviaMail(to: string, subject: string, html: string) {
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 25),
    secure: ['1', 'true'].includes((process.env.SMTP_SECURE || '').toLowerCase()),
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD || '' } : undefined,
  })
  await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, html })
}

/** Converte il carrello in un ordine (tabella Ordini) e avvisa l'amministratore via email. */
export async function inviaRichiesta(op: Operatore): Promise<{ idOrdine: number; articoli: number }> {
  const righe = await carrello(op.id)
  let idOrdine = 0
  await withTransaction(async (tx) => {
    const last = await tx.one<{ IdOrdine: number }>(`SELECT TOP 1 IdOrdine FROM dbo.Ordini ORDER BY Id DESC`)
    idOrdine = last ? last.IdOrdine + 1 : 0
    const now = new Date()
    for (const r of righe) {
      await tx.exec(
        `INSERT INTO dbo.Ordini (IdOrdine, IdArticolo, QtaArticolo, UltimaModifica_OperatoreID, UltimaModifica_Operatore, UltimaModifica_Data)
         VALUES (@ord, @art, @qta, @opId, @opName, @now)`,
        { ord: idOrdine, art: r.IdArticolo, qta: r.QtaArticolo, opId: op.id, opName: op.name, now },
      )
      await tx.exec(`DELETE FROM dbo.OrdiniInCorso WHERE Id = @id`, { id: r.Id })
    }
    await writeAudit(tx, L.Info, 'Home/InviaRichiestaAmministratore',
      `Richiesta materiali inviata da ${op.name} (ordine ${idOrdine}, ${righe.length} articoli)`,
      { IdOrdine: idOrdine, Articoli: righe.map((r) => r.IdArticolo) }, op)
  })

  // L'ordine e' registrato: un errore email non deve far credere che la richiesta sia persa.
  try {
    const to = process.env.SMTP_RICHIESTE_MATERIALI_TO
    if (to && process.env.SMTP_HOST) {
      const lista = righe
        .map((r) => `<li>${escapeHtml(r.NomeArticolo ?? String(r.IdArticolo))} - q.tà ${r.QtaArticolo}</li>`)
        .join('')
      await inviaMail(
        to,
        'Richiesta Materiali',
        `Ciao admin, <br> <br> qui di seguito trovi tutti gli articoli richiesti da '${escapeHtml(op.name)}'.<br><ul>${lista}</ul>Buon lavoro.`,
      )
    } else {
      await writeLog(db, L.Warning, 'Home/InviaRichiestaAmministratore',
        'Notifica email non inviata: destinatario/SMTP non configurati (SMTP_HOST, SMTP_RICHIESTE_MATERIALI_TO).', '', op)
    }
  } catch (e) {
    await safeLog(L.Errors, 'Home/InviaRichiestaAmministratore', `Ordine registrato ma invio email di notifica fallito: ${(e as Error).message}`, '', op)
  }
  return { idOrdine, articoli: righe.length }
}
