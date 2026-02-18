/**
 * AES-256-GCM token encryption/decryption.
 * Server-only — never import in client components.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { createLogger } from '@/lib/logger'

const logger = createLogger('calendar/encryption')

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32 // bytes
const IV_LENGTH = 12  // bytes (96-bit IV recommended for GCM)
const AUTH_TAG_LENGTH = 16 // bytes

function getKey(keyHex: string): Buffer {
  const key = Buffer.from(keyHex, 'hex')
  if (key.length !== KEY_LENGTH) {
    throw new Error(`TOKEN_ENCRYPTION_KEY must be exactly ${KEY_LENGTH * 2} hex characters (${KEY_LENGTH} bytes). Got ${keyHex.length} chars.`)
  }
  return key
}

/**
 * Encrypts a token string using AES-256-GCM.
 * Returns a base64-encoded string: iv:authTag:ciphertext
 */
export function encryptToken(token: string, keyHex: string): string {
  const key = getKey(keyHex)
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })

  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  const result = `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`

  logger.debug('token encrypted', { length: token.length, outputLength: result.length })
  return result
}

/**
 * Decrypts a token encrypted with encryptToken.
 * Throws on tampered/wrong-key input.
 */
export function decryptToken(encrypted: string, keyHex: string): string {
  const key = getKey(keyHex)

  const parts = encrypted.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted token format — expected iv:authTag:ciphertext')
  }

  const [ivBase64, authTagBase64, ciphertextBase64] = parts
  if (!ivBase64 || !authTagBase64 || !ciphertextBase64) {
    throw new Error('Invalid encrypted token — missing component')
  }

  const iv = Buffer.from(ivBase64, 'base64')
  const authTag = Buffer.from(authTagBase64, 'base64')
  const ciphertext = Buffer.from(ciphertextBase64, 'base64')

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })
  decipher.setAuthTag(authTag)

  try {
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    logger.debug('token decrypted', { length: decrypted.length })
    return decrypted.toString('utf8')
  } catch {
    throw new Error('Decryption failed — token may be tampered or key is incorrect')
  }
}
