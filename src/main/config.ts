import { config as loadEnv } from 'dotenv'

// Load .env from the project root. In `electron-vite dev` the process cwd is the
// project root, so this resolves the developer's local .env. Packaging (Phase 2+)
// will instead read credentials from a config file in userData — tracked as a TODO.
loadEnv()

export interface GoogleConfig {
  clientId: string
  clientSecret: string
  scopes: string[]
}

const DEFAULT_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly'
]

/** Returns the configured Google OAuth credentials, or null if not set up yet. */
export function getGoogleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim()
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) return null

  const scopes = (process.env.GOOGLE_SCOPES ?? '')
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean)

  return { clientId, clientSecret, scopes: scopes.length ? scopes : DEFAULT_SCOPES }
}

export function isGoogleConfigured(): boolean {
  return getGoogleConfig() !== null
}
