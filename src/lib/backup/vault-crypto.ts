/**
 * Vault content encryption for R2 backups.
 *
 * Vault objects are Tier-2 (owner-only, never read by Claude). When we mirror
 * them to R2, we wrap each object with AES-256-GCM using VAULT_BACKUP_KEY so
 * R2 never sees plaintext. Without that key (kept in 1Password, never in code),
 * an R2 leak yields opaque bytes.
 *
 * Stored layout for each encrypted blob:
 *   [ 12-byte IV ][ ciphertext ][ 16-byte GCM auth tag ]
 *
 * No additional authenticated data (AAD) — the bucket+key path is implicit
 * context but not strictly bound. Acceptable for this use case; if we ever
 * mirror to a multi-tenant store, bind AAD to the object key.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGO = 'aes-256-gcm'
const IV_LEN = 12      // 96-bit nonce, GCM standard
const TAG_LEN = 16     // 128-bit auth tag
const KEY_LEN = 32     // 256-bit key

export function isVaultKeyConfigured(): boolean {
  const k = process.env.VAULT_BACKUP_KEY
  if (!k) return false
  // Allow either 64-char hex (preferred) or 32-byte base64.
  if (/^[0-9a-fA-F]{64}$/.test(k)) return true
  try {
    const decoded = Buffer.from(k, 'base64')
    return decoded.length === KEY_LEN
  } catch {
    return false
  }
}

function getKey(): Buffer {
  const raw = process.env.VAULT_BACKUP_KEY
  if (!raw) throw new Error('VAULT_BACKUP_KEY not configured')
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex')
  }
  const decoded = Buffer.from(raw, 'base64')
  if (decoded.length !== KEY_LEN) {
    throw new Error(`VAULT_BACKUP_KEY must be 64 hex chars or 32-byte base64 (got ${decoded.length} bytes)`)
  }
  return decoded
}

/**
 * Encrypts `plaintext` with a fresh random IV. Returns the layout described
 * at top: IV | ciphertext | tag. Restore script splits the same way.
 */
export function encryptVaultBuffer(plaintext: Buffer): Buffer {
  const key = getKey()
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGO, key, iv)
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, ct, tag])
}

/**
 * Inverse of encryptVaultBuffer. Throws if the auth tag is invalid (wrong
 * key, corrupted blob).
 */
export function decryptVaultBuffer(blob: Buffer): Buffer {
  if (blob.length < IV_LEN + TAG_LEN) {
    throw new Error('Encrypted blob too short to contain IV + tag')
  }
  const key = getKey()
  const iv = blob.subarray(0, IV_LEN)
  const tag = blob.subarray(blob.length - TAG_LEN)
  const ct = blob.subarray(IV_LEN, blob.length - TAG_LEN)
  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()])
}
