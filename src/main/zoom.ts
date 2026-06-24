import { getZoomConfig } from './config'

const TOKEN_URL = 'https://zoom.us/oauth/token'
const API_BASE = 'https://api.zoom.us/v2'

interface TokenCache {
  token: string
  expiresAt: number
}
let cache: TokenCache | null = null

/** Gets (and caches) a Server-to-Server OAuth access token. */
async function getAccessToken(): Promise<string> {
  const cfg = getZoomConfig()
  if (!cfg) {
    throw new Error(
      'Zoom is not configured. Add ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, and ZOOM_CLIENT_SECRET to your .env.'
    )
  }
  if (cache && cache.expiresAt > Date.now() + 60_000) return cache.token

  const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')
  const url = `${TOKEN_URL}?grant_type=account_credentials&account_id=${encodeURIComponent(cfg.accountId)}`
  const res = await fetch(url, { method: 'POST', headers: { Authorization: `Basic ${basic}` } })
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string
    expires_in?: number
    reason?: string
    message?: string
  }
  if (!res.ok || !data.access_token) {
    throw new Error(`Zoom authentication failed (${res.status}): ${data.reason ?? data.message ?? 'unknown error'}`)
  }
  cache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 }
  return cache.token
}

export interface ZoomMeeting {
  id: string
  joinUrl: string
}

/** Creates a scheduled Zoom meeting and returns its join URL. */
export async function createZoomMeeting(input: {
  topic: string
  /** Local "YYYY-MM-DDTHH:mm:ss" start, interpreted in timeZone. */
  start: string
  timeZone: string
  durationMinutes: number
  agenda?: string
}): Promise<ZoomMeeting> {
  const token = await getAccessToken()
  const res = await fetch(`${API_BASE}/users/me/meetings`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      topic: input.topic,
      type: 2, // scheduled
      start_time: input.start,
      timezone: input.timeZone,
      duration: input.durationMinutes,
      agenda: input.agenda || undefined,
      settings: { join_before_host: true, waiting_room: false }
    })
  })
  const data = (await res.json().catch(() => ({}))) as {
    id?: number | string
    join_url?: string
    message?: string
  }
  if (!res.ok || !data.join_url) {
    throw new Error(`Zoom meeting creation failed (${res.status}): ${data.message ?? 'unknown error'}`)
  }
  return { id: String(data.id ?? ''), joinUrl: data.join_url }
}
