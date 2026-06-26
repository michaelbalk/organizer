import { randomBytes } from 'crypto'
import type { Express, Request } from 'express'
import { OAuth2Client } from 'google-auth-library'
import { getGoogleConfig } from '../src/main/config'
import { linkGoogleAccount } from '../src/main/google/accounts'
import { connectRedirectUri } from './config'
import { signState, verifyState } from './session'
import { requireAuth } from './auth'
import { page } from './html'

const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo'
const CONNECT_STATE_TTL_MS = 10 * 60 * 1000

interface ConnectState {
  workspaceId: string
  loginHint?: string
  exp: number
  n: string
}

/** OAuth client that requests the full Gmail + Calendar scopes. */
function connectClient(): OAuth2Client {
  const cfg = getGoogleConfig()
  if (!cfg) throw new Error('Google credentials are not configured on the server.')
  return new OAuth2Client({
    clientId: cfg.clientId,
    clientSecret: cfg.clientSecret,
    redirectUri: connectRedirectUri()
  })
}

export function registerGoogleConnect(app: Express): void {
  // The web client navigates here to attach a Gmail/Calendar account.
  app.get('/api/account/connect', requireAuth, (req, res) => {
    const workspaceId = String(req.query.workspaceId || '')
    if (!workspaceId) {
      res.status(400).send(page('Cannot connect', 'A workspace is required.'))
      return
    }
    const cfg = getGoogleConfig()
    if (!cfg) {
      res.status(500).send(page('Server not configured', 'Google credentials are missing.'))
      return
    }
    const loginHint = req.query.loginHint ? String(req.query.loginHint) : undefined
    const state = signState({
      workspaceId,
      loginHint,
      exp: Date.now() + CONNECT_STATE_TTL_MS,
      n: randomBytes(8).toString('hex')
    } satisfies ConnectState)

    const url = connectClient().generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent', // force a refresh_token even on re-consent
      scope: cfg.scopes,
      state,
      ...(loginHint ? { login_hint: loginHint } : {})
    })
    res.redirect(url)
  })

  // Google sends the user back here after granting Gmail/Calendar access.
  app.get('/auth/google/callback', requireAuth, async (req, res) => {
    const st = verifyState<ConnectState>(String(req.query.state || ''))
    if (!st || st.exp < Date.now() || !st.workspaceId) {
      res.status(400).send(page('Connection expired', 'Please try connecting the account again.'))
      return
    }
    const code = String(req.query.code || '')
    if (!code) {
      const err = String(req.query.error || 'Missing authorization code')
      res.status(400).send(page('Connection canceled', err))
      return
    }
    try {
      const client = connectClient()
      const { tokens } = await client.getToken({ code, redirect_uri: connectRedirectUri() })
      client.setCredentials(tokens)
      const info = await client.request<{ email?: string; name?: string }>({ url: USERINFO_URL })
      const email = info.data.email
      if (!email) {
        res.status(500).send(page('Connection failed', 'Could not read the account email from Google.'))
        return
      }
      linkGoogleAccount(st.workspaceId, {
        email,
        name: info.data.name ?? email,
        credentials: tokens
      })
      res.redirect(`/?connected=${encodeURIComponent(email)}`)
    } catch (e) {
      res.status(500).send(page('Connection failed', String((e as Error).message)))
    }
  })
}
