import http from 'http'
import type { AddressInfo } from 'net'
import { randomBytes } from 'crypto'
import { shell } from 'electron'
import { OAuth2Client, type Credentials } from 'google-auth-library'
import { getGoogleConfig } from '../config'

export interface GoogleAuthResult {
  credentials: Credentials
  email: string
  name: string
}

const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo'
const FLOW_TIMEOUT_MS = 5 * 60 * 1000

/**
 * Runs the OAuth 2.0 loopback flow for a Desktop-app client:
 *  1. spin up a throwaway localhost server on an ephemeral port,
 *  2. open the consent screen in the system browser,
 *  3. capture the redirect, exchange the code for tokens,
 *  4. read the account's email/name from the userinfo endpoint.
 */
export function runGoogleAuthFlow(): Promise<GoogleAuthResult> {
  const cfg = getGoogleConfig()
  if (!cfg) {
    return Promise.reject(
      new Error(
        'Google credentials are not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your .env file.'
      )
    )
  }

  return new Promise<GoogleAuthResult>((resolve, reject) => {
    const state = randomBytes(16).toString('hex')
    const server = http.createServer()

    let settled = false
    const timer = setTimeout(() => fail(new Error('Sign-in timed out. Please try again.')), FLOW_TIMEOUT_MS)

    const cleanup = (): void => {
      clearTimeout(timer)
      server.close()
    }
    const succeed = (result: GoogleAuthResult): void => {
      if (settled) return
      settled = true
      cleanup()
      resolve(result)
    }
    const fail = (err: Error): void => {
      if (settled) return
      settled = true
      cleanup()
      reject(err)
    }

    server.on('error', fail)

    server.listen(0, '127.0.0.1', async () => {
      const { port } = server.address() as AddressInfo
      const redirectUri = `http://127.0.0.1:${port}`
      const client = new OAuth2Client({
        clientId: cfg.clientId,
        clientSecret: cfg.clientSecret,
        redirectUri
      })

      server.on('request', async (req, res) => {
        try {
          const url = new URL(req.url ?? '/', redirectUri)
          if (url.pathname !== '/') {
            res.writeHead(404).end()
            return
          }

          const error = url.searchParams.get('error')
          if (error) {
            sendPage(res, 'Sign-in canceled', 'You can close this tab and return to Organizer.')
            fail(new Error(`Authorization was denied (${error}).`))
            return
          }

          const code = url.searchParams.get('code')
          if (url.searchParams.get('state') !== state) {
            res.writeHead(400).end('State mismatch')
            fail(new Error('OAuth state mismatch — possible CSRF; aborted.'))
            return
          }
          if (!code) {
            res.writeHead(400).end('Missing authorization code')
            return
          }

          const { tokens } = await client.getToken({ code, redirect_uri: redirectUri })
          client.setCredentials(tokens)

          const info = await client.request<{ email?: string; name?: string }>({ url: USERINFO_URL })
          const email = info.data.email
          if (!email) {
            fail(new Error('Could not read the account email from Google.'))
            return
          }

          sendPage(res, 'Connected ✓', 'Organizer is now linked to this Google account. You can close this tab.')
          succeed({ credentials: tokens, email, name: info.data.name ?? email })
        } catch (err) {
          try {
            res.writeHead(500).end('Authentication failed')
          } catch {
            /* response may already be sent */
          }
          fail(err instanceof Error ? err : new Error(String(err)))
        }
      })

      const authUrl = client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent', // force a refresh_token even on re-consent
        scope: cfg.scopes,
        state
      })

      try {
        await shell.openExternal(authUrl)
      } catch (err) {
        fail(err instanceof Error ? err : new Error('Failed to open the browser for sign-in.'))
      }
    })
  })
}

function sendPage(res: http.ServerResponse, heading: string, body: string): void {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Organizer</title>
<style>body{font-family:system-ui,Segoe UI,sans-serif;background:#0f172a;color:#e2e8f0;
display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
.card{background:#1e293b;padding:40px 48px;border-radius:14px;text-align:center;max-width:420px;
box-shadow:0 10px 40px rgba(0,0,0,.4)}h1{margin:0 0 12px;font-size:22px}p{margin:0;color:#94a3b8;line-height:1.5}</style>
</head><body><div class="card"><h1>${heading}</h1><p>${body}</p></div></body></html>`
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(html)
}
