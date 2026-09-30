import { describe, expect, it } from 'vitest'
import { hashPassword, validatePassword, verifyPassword } from '@/lib/auth/password'

describe('password compatibili ASP.NET Identity', () => {
  it('verifica gli hash di riferimento di ASP.NET Identity (password "my password")', () => {
    // Vettori dei test ufficiali di Microsoft.AspNetCore.Identity (PasswordHasherTest).
    // V2: PBKDF2-HMAC-SHA1, 1000 iterazioni, salt 128 bit, chiave 256 bit.
    expect(verifyPassword('AAABAgMEBQYHCAkKCwwNDg+ukCEMDf0yyQ29NYubggHIVY0sdEUfdyeM+E1LtH1uJg==', 'my password')).toBe(true)
    // V3: SHA1 250 iter / SHA256 250 iter / SHA512 250 iter.
    expect(verifyPassword('AQAAAAAAAAD6AAAAEAhftMyfTJylOlZT+eEotFXd1elee8ih5WsjXaR3PA9M', 'my password')).toBe(true)
    expect(verifyPassword('AQAAAAEAAAD6AAAAEAhftMyfTJyAAAAAAAAAAAAAAAAAAAih5WsjXaR3PA9M', 'my password')).toBe(false)
    expect(verifyPassword('AAABAgMEBQYHCAkKCwwNDg+ukCEMDf0yyQ29NYubggHIVY0sdEUfdyeM+E1LtH1uJg==', 'altra password')).toBe(false)
  })

  it('genera hash V2 verificabili', () => {
    const h = hashPassword('Brighetti.1')
    const buf = Buffer.from(h, 'base64')
    expect(buf.length).toBe(49)
    expect(buf[0]).toBe(0)
    expect(verifyPassword(h, 'Brighetti.1')).toBe(true)
    expect(verifyPassword(h, 'brighetti.1')).toBe(false)
  })

  it('riconosce il formato degli hash presenti nel vecchio database', () => {
    const legacy = 'AA37fyq3mhO15VK23Qr4UCumpMhUoyaNJ8UqjxjYDDSs7b37nP9mndM6kjxG7/W9+Q=='
    const buf = Buffer.from(legacy, 'base64')
    expect(buf.length).toBe(49)
    expect(buf[0]).toBe(0)
    expect(verifyPassword(legacy, 'password-sbagliata')).toBe(false)
  })

  it('gestisce valori non validi senza eccezioni', () => {
    expect(verifyPassword(null, 'x')).toBe(false)
    expect(verifyPassword('', 'x')).toBe(false)
    expect(verifyPassword('non-base64-!!', 'x')).toBe(false)
  })

  it('applica le regole password del vecchio UserManager', () => {
    expect(validatePassword('abc')).not.toHaveLength(0)
    expect(validatePassword('Password1')).toHaveLength(1) // manca il carattere speciale
    expect(validatePassword('Password.1')).toHaveLength(0)
  })
})
