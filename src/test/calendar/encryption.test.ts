import { describe, it, expect } from 'vitest'
import { encryptToken, decryptToken } from '@/lib/calendar/encryption'

// 32-byte key as 64 hex chars
const TEST_KEY = 'a'.repeat(64)
const WRONG_KEY = 'b'.repeat(64)

describe('encryptToken / decryptToken', () => {
  it('round-trip: decrypted value equals original', () => {
    const original = 'my_secret_access_token_12345'
    const encrypted = encryptToken(original, TEST_KEY)
    const decrypted = decryptToken(encrypted, TEST_KEY)
    expect(decrypted).toBe(original)
  })

  it('produces different ciphertext for different tokens', () => {
    const enc1 = encryptToken('token_a', TEST_KEY)
    const enc2 = encryptToken('token_b', TEST_KEY)
    expect(enc1).not.toBe(enc2)
  })

  it('produces different ciphertext on repeated encryptions (random IV)', () => {
    const enc1 = encryptToken('same_token', TEST_KEY)
    const enc2 = encryptToken('same_token', TEST_KEY)
    expect(enc1).not.toBe(enc2)
  })

  it('throws when decrypting with the wrong key', () => {
    const encrypted = encryptToken('secret', TEST_KEY)
    expect(() => decryptToken(encrypted, WRONG_KEY)).toThrow()
  })

  it('throws on malformed encrypted string', () => {
    expect(() => decryptToken('not:valid', TEST_KEY)).toThrow()
    expect(() => decryptToken('garbage', TEST_KEY)).toThrow()
  })

  it('throws when key length is wrong', () => {
    expect(() => encryptToken('token', 'tooshort')).toThrow()
    expect(() => decryptToken('iv:tag:cipher', 'tooshort')).toThrow()
  })
})
