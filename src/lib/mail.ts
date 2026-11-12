import 'server-only'
import nodemailer from 'nodemailer'

/*
 * Invio email (SMTP da variabili d'ambiente: SMTP_HOST, SMTP_PORT, SMTP_SECURE,
 * SMTP_USER, SMTP_PASSWORD, SMTP_FROM). Usato dalle richieste materiali e dalle
 * email automatiche (ODP giornalieri, uso macchine).
 */

export function smtpPresente(): boolean {
  return !!process.env.SMTP_HOST
}

export async function inviaMail(to: string | string[], subject: string, html: string) {
  if (!smtpPresente()) throw new Error('SMTP non configurato (SMTP_HOST nel file di configurazione).')
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 25),
    secure: ['1', 'true'].includes((process.env.SMTP_SECURE || '').toLowerCase()),
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD || '' } : undefined,
  })
  await transport.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: Array.isArray(to) ? to.join(', ') : to,
    subject,
    html,
  })
}
