import './bootstrap' // sets ORGANIZER_DATA_DIR + AES token encryptor before anything loads
import { existsSync } from 'fs'
import { join } from 'path'
import express from 'express'
import { getServerConfig } from './config'
import { registerAuth, requireAuth } from './auth'
import { registerGoogleConnect } from './googleConnect'
import { registerApi } from './api'
import { page } from './html'
import { startBriefingScheduler } from '../src/main/briefing'
import { startFollowUpScheduler } from '../src/main/followups'

const cfg = getServerConfig()
const app = express()

// Render (and most hosts) terminate TLS at a proxy; trust it so Secure cookies work.
app.set('trust proxy', 1)
app.use(express.json({ limit: '2mb' }))

// Baseline security headers (kept minimal; no external CDNs are used).
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'same-origin')
  res.setHeader('X-Frame-Options', 'DENY')
  next()
})

app.get('/healthz', (_req, res) => res.json({ ok: true }))

// Auth (login/identity), account-connect redirect flow, and the data API.
registerAuth(app)
registerGoogleConnect(app)
registerApi(app)

// --- Static frontend (built in Phase 3) --------------------------------------
const webDist = process.env.WEB_DIST || join(process.cwd(), 'out', 'web')
const hasWeb = existsSync(join(webDist, 'index.html'))
if (hasWeb) {
  // Hashed assets are public; the app shell + data are gated by auth/API.
  app.use(express.static(webDist, { index: false }))
}

// SPA fallback (auth-gated): anything that isn't an API/auth route serves the app.
app.get('*', requireAuth, (_req, res) => {
  if (hasWeb) {
    res.sendFile(join(webDist, 'index.html'))
  } else {
    res
      .status(200)
      .send(
        page(
          'Organizer server is running',
          'You are signed in. The web interface build is not present yet (Phase 3).'
        )
      )
  }
})

app.listen(cfg.port, () => {
  console.log(`[organizer] listening on ${cfg.appUrl} (port ${cfg.port})`)
  if (cfg.allowedEmails.length === 0) {
    console.warn('[organizer] No ALLOWED_EMAILS set — every Google account would be allowed in!')
  }

  // Run the automation schedulers server-side. (Push notifications are a later
  // enhancement; for now results are persisted and shown when the user opens the app.)
  startBriefingScheduler((b) =>
    console.log(`[briefing] ready: ${b.topics.length} topics from ${b.emailCount} emails`)
  )
  startFollowUpScheduler((count) => console.log(`[followups] created ${count} task(s)`))
})
