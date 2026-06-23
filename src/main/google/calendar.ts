import type { CalendarEvent, CalendarResult, InboxError } from '@shared/types'
import { getStore } from '../store'
import { getAuthorizedClient } from './accounts'

const CAL_BASE = 'https://www.googleapis.com/calendar/v3'

interface CalListEntry {
  id: string
  summary?: string
  primary?: boolean
  selected?: boolean
}
interface GEvent {
  id: string
  summary?: string
  location?: string
  htmlLink?: string
  status?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
}

/**
 * Lists events from today through `daysAhead` across every connected account and
 * every calendar the user keeps visible. Per-account failures are collected, not
 * thrown, so one expired token doesn't blank the whole calendar.
 */
export async function listCalendarEvents(daysAhead = 7): Promise<CalendarResult> {
  const connected = getStore()
    .getData()
    .accounts.filter((a) => a.provider === 'google' && a.connected)

  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(start)
  end.setDate(end.getDate() + daysAhead + 1)
  const timeMin = start.toISOString()
  const timeMax = end.toISOString()

  const events: CalendarEvent[] = []
  const errors: InboxError[] = []

  await Promise.all(
    connected.map(async (account) => {
      try {
        const client = getAuthorizedClient(account.id)
        const list = await client.request<{ items?: CalListEntry[] }>({
          url: `${CAL_BASE}/users/me/calendarList`
        })
        const calendars = (list.data.items ?? []).filter((c) => c.selected !== false)

        await Promise.all(
          calendars.map(async (cal) => {
            try {
              const qs = new URLSearchParams({
                timeMin,
                timeMax,
                singleEvents: 'true',
                orderBy: 'startTime',
                maxResults: '100'
              })
              const res = await client.request<{ items?: GEvent[] }>({
                url: `${CAL_BASE}/calendars/${encodeURIComponent(cal.id)}/events?${qs.toString()}`
              })
              for (const e of res.data.items ?? []) {
                const projected = projectEvent(e, account, cal)
                if (projected) events.push(projected)
              }
            } catch {
              /* skip a single calendar we can't read */
            }
          })
        )
      } catch (err) {
        errors.push(toFetchError(account.id, account.email, err))
      }
    })
  )

  events.sort((a, b) => a.start.localeCompare(b.start))
  return { events, errors, fetchedAt: new Date().toISOString() }
}

function projectEvent(
  e: GEvent,
  account: { id: string; email: string; workspaceId: string },
  cal: CalListEntry
): CalendarEvent | null {
  if (e.status === 'cancelled') return null
  const startRaw = e.start?.dateTime ?? e.start?.date
  if (!startRaw) return null
  const endRaw = e.end?.dateTime ?? e.end?.date ?? startRaw
  const allDay = !e.start?.dateTime

  return {
    id: e.id,
    accountId: account.id,
    accountEmail: account.email,
    workspaceId: account.workspaceId,
    calendarId: cal.id,
    calendarName: cal.summary ?? cal.id,
    title: e.summary || '(no title)',
    start: allDay ? new Date(`${startRaw}T00:00`).toISOString() : startRaw,
    end: allDay ? new Date(`${endRaw}T00:00`).toISOString() : endRaw,
    allDay,
    location: e.location ?? '',
    htmlLink: e.htmlLink ?? ''
  }
}

interface HttpishError {
  response?: { status?: number; data?: { error?: { message?: string } } }
  message?: string
}
function toFetchError(accountId: string, accountEmail: string, err: unknown): InboxError {
  const e = (err ?? {}) as HttpishError
  const status = e.response?.status
  let message = e.response?.data?.error?.message ?? e.message ?? String(err)
  let needsReconnect = false
  if (
    status === 401 ||
    /invalid_grant|insufficient|scope|not connected|PERMISSION_DENIED/i.test(message)
  ) {
    needsReconnect = true
    message = 'Sign-in expired or calendar permission is missing. Reconnect this account in Settings.'
  }
  return { accountId, accountEmail, message, needsReconnect }
}
