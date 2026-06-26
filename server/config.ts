import { config as loadEnv } from 'dotenv'

// Load .env (local dev). On Render, real env vars are injected by the host.
loadEnv()

export interface ServerConfig {
  port: number
  /** Public base URL, e.g. https://organizer.onrender.com (no trailing slash). */
  appUrl: string
  /** HMAC secret for signed session + OAuth-state cookies. */
  sessionSecret: string
  /** Lowercased allow-list of Google emails permitted to sign in. */
  allowedEmails: string[]
}

let cached: ServerConfig | null = null

export function getServerConfig(): ServerConfig {
  if (cached) return cached
  const port = Number(process.env.PORT) || 3000
  const appUrl = (process.env.APP_URL || `http://localhost:${port}`).replace(/\/+$/, '')
  const sessionSecret = process.env.SESSION_SECRET?.trim() || ''
  const allowedEmails = (process.env.ALLOWED_EMAILS || process.env.ALLOWED_EMAIL || '')
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  cached = { port, appUrl, sessionSecret, allowedEmails }
  return cached
}

/** Where Google sends the user back after the *login* (identity) consent. */
export function loginRedirectUri(): string {
  return `${getServerConfig().appUrl}/auth/login/callback`
}

/** Where Google sends the user back after *connecting* a Gmail/Calendar account. */
export function connectRedirectUri(): string {
  return `${getServerConfig().appUrl}/auth/google/callback`
}

export function isSecureContext(): boolean {
  return getServerConfig().appUrl.startsWith('https')
}
