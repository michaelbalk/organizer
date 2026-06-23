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
  // gmail.modify includes read access plus label/archive/trash/mark-read.
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  // Full calendar: read events + write meeting briefs into event descriptions.
  'https://www.googleapis.com/auth/calendar'
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

export interface AnthropicConfig {
  apiKey: string
  /** Claude model id. Defaults to Opus 4.8; override with ANTHROPIC_MODEL. */
  model: string
}

// Opus 4.8 is the most capable default. For cheap, high-volume email drafting,
// set ANTHROPIC_MODEL=claude-haiku-4-5 in .env (~5x cheaper, plenty for replies).
const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-4-8'

/** Returns the Anthropic API config, or null if no key is set. */
export function getAnthropicConfig(): AnthropicConfig | null {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) return null
  const model = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL
  return { apiKey, model }
}

export function isAnthropicConfigured(): boolean {
  return getAnthropicConfig() !== null
}
