import { describe, expect, it } from 'vitest'
import { consentiTentativo, ipClient } from '@/lib/rate-limit'

describe('ipClient', () => {
  it('prende il primo indirizzo di X-Forwarded-For', () => {
    expect(ipClient('10.0.0.5, 192.168.1.1')).toBe('10.0.0.5')
  })
  it('toglie la porta aggiunta da IIS/ARR', () => {
    expect(ipClient('192.168.1.20:51234')).toBe('192.168.1.20')
    expect(ipClient('[2001:db8::1]:443')).toBe('2001:db8::1')
    expect(ipClient('[::1]')).toBe('::1')
  })
  it('lascia invariati gli IPv6 senza porta', () => {
    expect(ipClient('2001:db8::1')).toBe('2001:db8::1')
  })
  it('usa "locale" senza intestazione', () => {
    expect(ipClient(null)).toBe('locale')
    expect(ipClient('')).toBe('locale')
  })
})

describe('consentiTentativo', () => {
  it('blocca oltre il massimo nella finestra', () => {
    const k = `t-${Math.random()}`
    for (let i = 0; i < 3; i++) expect(consentiTentativo(k, 3, 60_000)).toBe(true)
    expect(consentiTentativo(k, 3, 60_000)).toBe(false)
  })
})
