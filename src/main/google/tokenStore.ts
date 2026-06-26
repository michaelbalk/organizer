import { existsSync, readFileSync, writeFileSync, renameSync } from 'fs'
import { join } from 'path'
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto'
import type { Credentials } from 'google-auth-library'
import { dataDir } from '../paths'

/**
 * Per-account OAuth token storage, encrypted at rest. The encryption strategy is
 * pluggable so this module stays Electron-free:
 *  - Desktop injects an OS-keystore encryptor (safeStorage / DPAPI) at startup.
 *  - The server uses AES-256-GCM keyed by ORGANIZER_ENCRYPTION_KEY.
 * Refresh tokens never touch disk in plaintext when either is configured.
 */
export interface Encryptor {
  available: () => boolean
  encrypt: (plain: string) => string
  decrypt: (b64: string) => string
}

let encryptor: Encryptor | null = null
export function setEncryptor(e: Encryptor): void {
  encryptor = e
}

interface StoredToken {
  method?: 'os' | 'aes' | 'plain'
  /** Legacy flag (pre-`method`): true meant OS-keystore encrypted. */
  enc?: boolean
  data: string
}
type TokenFile = Record<string, StoredToken>

function aesKey(): Buffer | null {
  const k = process.env.ORGANIZER_ENCRYPTION_KEY
  return k ? createHash('sha256').update(k).digest() : null
}
function aesEncrypt(plain: string, key: Buffer): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64')
}
function aesDecrypt(b64: string, key: Buffer): string {
  const buf = Buffer.from(b64, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12))
  decipher.setAuthTag(buf.subarray(12, 28))
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8')
}

class TokenStore {
  private filePath: string
  private cache: TokenFile | null = null

  constructor() {
    this.filePath = join(dataDir(), 'google-tokens.json')
  }

  private read(): TokenFile {
    if (this.cache) return this.cache
    if (existsSync(this.filePath)) {
      try {
        this.cache = JSON.parse(readFileSync(this.filePath, 'utf-8')) as TokenFile
      } catch {
        this.cache = {}
      }
    } else {
      this.cache = {}
    }
    return this.cache
  }

  private write(file: TokenFile): void {
    this.cache = file
    const tmp = `${this.filePath}.tmp`
    writeFileSync(tmp, JSON.stringify(file), 'utf-8')
    renameSync(tmp, this.filePath)
  }

  private encode(creds: Credentials): StoredToken {
    const json = JSON.stringify(creds)
    if (encryptor?.available()) return { method: 'os', data: encryptor.encrypt(json) }
    const key = aesKey()
    if (key) return { method: 'aes', data: aesEncrypt(json, key) }
    return { method: 'plain', data: Buffer.from(json, 'utf-8').toString('base64') }
  }

  private decode(token: StoredToken): Credentials {
    const method = token.method ?? (token.enc ? 'os' : 'plain')
    if (method === 'os') {
      if (!encryptor) throw new Error('No OS keystore available to decrypt this token.')
      return JSON.parse(encryptor.decrypt(token.data))
    }
    if (method === 'aes') {
      const key = aesKey()
      if (!key) throw new Error('ORGANIZER_ENCRYPTION_KEY missing to decrypt this token.')
      return JSON.parse(aesDecrypt(token.data, key))
    }
    return JSON.parse(Buffer.from(token.data, 'base64').toString('utf-8'))
  }

  save(accountId: string, creds: Credentials): void {
    const file = this.read()
    file[accountId] = this.encode(creds)
    this.write(file)
  }

  get(accountId: string): Credentials | null {
    const token = this.read()[accountId]
    if (!token) return null
    try {
      return this.decode(token)
    } catch {
      return null
    }
  }

  remove(accountId: string): void {
    const file = this.read()
    if (file[accountId]) {
      delete file[accountId]
      this.write(file)
    }
  }
}

let instance: TokenStore | null = null
export function getTokenStore(): TokenStore {
  if (!instance) instance = new TokenStore()
  return instance
}
