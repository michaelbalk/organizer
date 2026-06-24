import { randomUUID } from 'crypto'
import type {
  CalendarEvent,
  CalendarResult,
  CreatedEvent,
  CreateEventInput,
  InboxError
} from '@shared/types'
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
  description?: string
  htmlLink?: string
  status?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  attendees?: { email?: string; displayName?: string }[]
}

const BRIEF_HEADER = '— Meeting brief (added by Organizer) —'

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
    attendees: (e.attendees ?? []).map((a) => a.displayName || a.email || '').filter(Boolean),
    description: e.description ?? '',
    htmlLink: e.htmlLink ?? ''
  }
}

/**
 * Writes a meeting brief into a calendar event's description, under a marker so
 * re-running replaces the prior brief while preserving any pre-existing notes.
 * Requires the calendar write scope (re-consent after the scope widening).
 */
export async function attachEventBrief(
  accountId: string,
  calendarId: string,
  eventId: string,
  briefText: string
): Promise<void> {
  const client = getAuthorizedClient(accountId)
  const url = `${CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`

  const { data } = await client.request<{ description?: string }>({ url })
  const existing = data.description ?? ''
  const base = existing.split(BRIEF_HEADER)[0].trimEnd()
  const description = `${base ? base + '\n\n' : ''}${BRIEF_HEADER}\n${briefText.trim()}`

  await client.request({ url, method: 'PATCH', data: { description } })
}

interface EntryPoint {
  entryPointType?: string
  uri?: string
}
interface CreatedEventResponse {
  id: string
  htmlLink?: string
  hangoutLink?: string
  conferenceData?: { entryPoints?: EntryPoint[] }
}

/** Creates a calendar event on the account's primary calendar, optionally with
 *  a Google Meet link. Sends invites to attendees. Requires the calendar scope. */
export async function createEvent(input: CreateEventInput): Promise<CreatedEvent> {
  const client = getAuthorizedClient(input.accountId)

  const body: Record<string, unknown> = {
    summary: input.title,
    description: input.description || undefined,
    start: { dateTime: input.start, timeZone: input.timeZone },
    end: { dateTime: input.end, timeZone: input.timeZone },
    attendees: (input.attendees ?? []).map((email) => ({ email }))
  }

  let qs = 'sendUpdates=all'
  if (input.platform === 'meet') {
    body.conferenceData = {
      createRequest: {
        requestId: randomUUID(),
        conferenceSolutionKey: { type: 'hangoutsMeet' }
      }
    }
    qs += '&conferenceDataVersion=1'
  }

  const res = await client.request<CreatedEventResponse>({
    url: `${CAL_BASE}/calendars/primary/events?${qs}`,
    method: 'POST',
    data: body
  })
  const ev = res.data
  const meetLink =
    ev.hangoutLink ??
    ev.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri ??
    null
  return { id: ev.id, htmlLink: ev.htmlLink ?? '', meetLink }
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
