import type { Express } from 'express'
import { IPC } from '@shared/ipc'
import { buildCommands, type CommandHandler } from '../src/main/commands'
import { gmailThreadUrl } from '../src/main/google/gmail'
import { requireAuth } from './auth'

/**
 * Exposes every app operation over HTTP via a single authenticated endpoint that
 * dispatches through the same command map the desktop IPC bridge uses.
 *
 * `connectAccount` is intentionally NOT invokable here — the web client performs
 * the browser redirect to /api/account/connect instead (see googleConnect.ts).
 * `openEmail` returns the Gmail URL for the browser to open in a new tab.
 */
export function registerApi(app: Express): void {
  const commands: Record<string, CommandHandler> = {
    ...buildCommands(),
    [IPC.openEmail]: ([accountEmail, threadId]) =>
      gmailThreadUrl(String(accountEmail), String(threadId))
  }

  app.post('/api/invoke', requireAuth, async (req, res) => {
    const { channel, args } = (req.body ?? {}) as { channel?: string; args?: unknown[] }
    if (!channel || typeof channel !== 'string') {
      res.status(400).json({ error: 'Missing "channel".' })
      return
    }
    if (channel === IPC.connectAccount) {
      res.status(400).json({ error: 'Use the /api/account/connect redirect to connect an account.' })
      return
    }
    const handler = commands[channel]
    if (!handler) {
      res.status(404).json({ error: `Unknown channel: ${channel}` })
      return
    }
    try {
      const result = await handler(Array.isArray(args) ? args : [])
      res.json({ result: result ?? null })
    } catch (e) {
      console.error(`[api] ${channel} failed:`, e)
      res.status(500).json({ error: String((e as Error).message || e) })
    }
  })
}
