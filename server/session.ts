import { createHmac, timingSafeEqual, randomBytes } from 'crypto'
import type { Request, Response } from 'express'
import { getServerConfig, isSecureContext } from './config'

const COOKIE = 'org_session'
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

let ephemeralSecret: string | null = null
function secret(): string {
  const s = getServerConfig().sessionSecret
  if (s) return s
  if (!ephemeralSecret) {
    ephemeralSecret = randomBytes(32).toString('hex')
    console.warn(
      '[auth] SESSION_SECRET is not set — using an ephemeral secret. Sessions will reset on restart.'
    )
  }
  return ephemeralSecret
}

function sign(data: string): string {
  return createHmac('sha256', secret()).update(data).digest('base64url')
}

/** Constant-time compare of a value against its expected signature. */
function verify(body: string, sig: string): boolean {
  const expected = sign(body)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

// --- Session cookie (who is logged in) ---------------------------------------

interface SessionPayload {
  email: string
  exp: number
}

export function issueSession(res: Response, email: string): void {
  const payload: SessionPayload = { email, exp: Date.now() + MAX_AGE_MS }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const token = `${body}.${sign(body)}`
  const secure = isSecureContext() ? ' Secure;' : ''
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${token}; HttpOnly;${secure} SameSite=Lax; Path=/; Max-Age=${Math.floor(MAX_AGE_MS / 1000)}`
  )
}

export function clearSession(res: Response): void {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`)
}

export function readSession(req: Request): SessionPayload | null {
  const raw = parseCookies(req.headers.cookie)[COOKIE]
  if (!raw) return null
  const [body, sig] = raw.split('.')
  if (!body || !sig || !verify(body, sig)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8')) as SessionPayload
    if (!payload.exp || payload.exp < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

// --- Signed OAuth state (CSRF protection on the redirect flows) ---------------

export function signState(obj: unknown): string {
  const body = Buffer.from(JSON.stringify(obj)).toString('base64url')
  return `${body}.${sign(body)}`
}

export function verifyState<T>(token: string): T | null {
  const [body, sig] = (token || '').split('.')
  if (!body || !sig || !verify(body, sig)) return null
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf-8')) as T
  } catch {
    return null
  }
}

function parseCookies(header?: string): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}
