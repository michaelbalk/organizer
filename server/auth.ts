import { randomBytes } from 'crypto'
import type { Express, Request, Response, NextFunction } from 'express'
import { OAuth2Client } from 'google-auth-library'
import { getGoogleConfig } from '../src/main/config'
import { getServerConfig, loginRedirectUri } from './config'
import { issueSession, clearSession, readSession, signState, verifyState } from './session'
import { page } from './html'

const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo'
const LOGIN_STATE_TTL_MS = 10 * 60 * 1000

/** OAuth client used only to verify the user's identity (openid/email). */
function loginClient(): OAuth2Client {
  const cfg = getGoogleConfig()
  if (!cfg) throw new Error('Google credentials are not configured on the server.')
  return new OAuth2Client({
    clientId: cfg.clientId,
    clientSecret: cfg.clientSecret,
    redirectUri: loginRedirectUri()
  })
}

/**
 * Gate middleware. API requests get a 401; page requests are redirected to the
 * Google sign-in. On success the request is tagged with `userEmail`.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const session = readSession(req)
  if (session) {
    ;(req as Request & { userEmail?: string }).userEmail = session.email
    next()
    return
  }
  if (req.path.startsWith('/api/')) {
    res.status(401).json({ error: 'Not authenticated' })
    return
  }
  res.redirect('/auth/login')
}

export function registerAuth(app: Express): void {
  // Kick off Google sign-in.
  app.get('/auth/login', (_req, res) => {
    let client: OAuth2Client
    try {
      client = loginClient()
    } catch (e) {
      res.status(500).send(page('Server not configured', String((e as Error).message)))
      return
    }
    const state = signState({ n: randomBytes(8).toString('hex'), exp: Date.now() + LOGIN_STATE_TTL_MS })
    const url = client.generateAuthUrl({
      scope: ['openid', 'email', 'profile'],
      state,
      prompt: 'select_account'
    })
    res.redirect(url)
  })

  // Handle the Google identity redirect.
  app.get('/auth/login/callback', async (req, res) => {
    const code = String(req.query.code || '')
    const st = verifyState<{ exp: number }>(String(req.query.state || ''))
    if (!st || st.exp < Date.now()) {
      res.status(400).send(page('Sign-in expired', 'Please return to Organizer and try again.'))
      return
    }
    if (!code) {
      res.status(400).send(page('Sign-in failed', 'Missing authorization code.'))
      return
    }
    try {
      const client = loginClient()
      const { tokens } = await client.getToken({ code, redirect_uri: loginRedirectUri() })
      client.setCredentials(tokens)
      const info = await client.request<{ email?: string; email_verified?: boolean }>({
        url: USERINFO_URL
      })
      const email = info.data.email?.toLowerCase()
      const { allowedEmails } = getServerConfig()
      if (!email || (allowedEmails.length > 0 && !allowedEmails.includes(email))) {
        res
          .status(403)
          .send(
            page(
              'Access denied',
              `This Organizer instance is private${email ? ` and ${email} is not on the allow-list` : ''}.`
            )
          )
        return
      }
      issueSession(res, email)
      res.redirect('/')
    } catch (e) {
      res.status(500).send(page('Sign-in failed', String((e as Error).message)))
    }
  })

  app.post('/auth/logout', (_req, res) => {
    clearSession(res)
    res.json({ ok: true })
  })

  app.get('/api/me', requireAuth, (req, res) => {
    res.json({ email: (req as Request & { userEmail?: string }).userEmail })
  })
}
