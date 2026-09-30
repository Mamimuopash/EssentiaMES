import crypto from 'node:crypto'

/*
 * Hash delle password compatibili con ASP.NET Identity.
 *
 * Gli utenti esistenti (tabella AspNetUsers) hanno la password cifrata dal
 * vecchio software (Identity 2.x, "V2": PBKDF2-HMAC-SHA1, 1000 iterazioni,
 * salt 16 byte, chiave 32 byte). Qui la verifichiamo senza chiedere reset.
 * Supportiamo anche il formato "V3" (Identity 3+ / Core) per completezza.
 *
 * Le nuove password vengono salvate in formato V2: cosi' restano valide anche
 * per la vecchia applicazione durante un eventuale periodo di convivenza.
 */

const V2_ITER = 1000
const V2_SALT = 16
const V2_KEY = 32

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(V2_SALT)
  const key = crypto.pbkdf2Sync(Buffer.from(password, 'utf8'), salt, V2_ITER, V2_KEY, 'sha1')
  return Buffer.concat([Buffer.from([0x00]), salt, key]).toString('base64')
}

export function verifyPassword(hashed: string | null | undefined, password: string): boolean {
  if (!hashed) return false
  let buf: Buffer
  try {
    buf = Buffer.from(hashed, 'base64')
  } catch {
    return false
  }
  if (buf.length === 0) return false

  if (buf[0] === 0x00) {
    if (buf.length !== 1 + V2_SALT + V2_KEY) return false
    const salt = buf.subarray(1, 1 + V2_SALT)
    const expected = buf.subarray(1 + V2_SALT)
    const actual = crypto.pbkdf2Sync(Buffer.from(password, 'utf8'), salt, V2_ITER, V2_KEY, 'sha1')
    return crypto.timingSafeEqual(expected, actual)
  }

  if (buf[0] === 0x01) {
    if (buf.length < 13) return false
    const prf = buf.readUInt32BE(1)
    const iter = buf.readUInt32BE(5)
    const saltLen = buf.readUInt32BE(9)
    if (saltLen < 16 || 13 + saltLen >= buf.length) return false
    const salt = buf.subarray(13, 13 + saltLen)
    const expected = buf.subarray(13 + saltLen)
    const digest = prf === 0 ? 'sha1' : prf === 1 ? 'sha256' : prf === 2 ? 'sha512' : null
    if (!digest || expected.length < 16) return false
    const actual = crypto.pbkdf2Sync(Buffer.from(password, 'utf8'), salt, iter, expected.length, digest)
    return crypto.timingSafeEqual(expected, actual)
  }

  return false
}

/**
 * Regole password del vecchio ApplicationUserManager: minimo 6 caratteri,
 * almeno una cifra, una minuscola, una maiuscola e un carattere speciale.
 */
export function validatePassword(password: string): string[] {
  const errors: string[] = []
  if (!password || password.length < 6) errors.push('La password deve contenere almeno 6 caratteri.')
  if (!/[0-9]/.test(password)) errors.push('La password deve contenere almeno una cifra (0-9).')
  if (!/[a-z]/.test(password)) errors.push('La password deve contenere almeno una lettera minuscola.')
  if (!/[A-Z]/.test(password)) errors.push('La password deve contenere almeno una lettera maiuscola.')
  if (!/[^a-zA-Z0-9]/.test(password)) errors.push('La password deve contenere almeno un carattere speciale.')
  return errors
}
