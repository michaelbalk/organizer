import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs'
import { join } from 'path'
import type { Credentials } from 'google-auth-library'

/**
 * Per-account OAuth token storage. Tokens are encrypted at rest with Electron's
 * safeStorage (DPAPI on Windows) when available, so refresh tokens never touch
 * disk in plaintext. Falls back to base64 only if the OS keychain is unavailable.
 */
interface StoredToken {
  enc: boolean
  data: string
}
type TokenFile = Record<string, StoredToken>

class TokenStore {
  private filePath: string
  private cache: TokenFile | null = null

  constructor() {
    const dir = join(app.getPath('userData'), 'data')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.filePath = join(dir, 'google-tokens.json')
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
    if (safeStorage.isEncryptionAvailable()) {
      return { enc: true, data: safeStorage.encryptString(json).toString('base64') }
    }
    return { enc: false, data: Buffer.from(json, 'utf-8').toString('base64') }
  }

  private decode(token: StoredToken): Credentials {
    if (token.enc) {
      return JSON.parse(safeStorage.decryptString(Buffer.from(token.data, 'base64')))
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
