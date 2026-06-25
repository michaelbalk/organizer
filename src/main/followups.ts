import type { EmailFull } from '@shared/types'
import { getStore } from './store'
import { getAuthorizedClient } from './google/accounts'
import { getMessage } from './google/gmail'
import { detectFollowUps } from './anthropic'

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'
const MAX_EMAILS = 40

/**
 * Scans recent inbox email, asks Claude which need follow-up, and creates a task
 * for each — titled "<sender>: <what's required>", with a link to the email and
 * its attachments listed. Skips messages already tasked or already analyzed.
 */
export async function scanFollowUps(): Promise<{ created: number; scanned: number }> {
  const store = getStore()
  const data = store.getData()
  const accounts = data.accounts.filter((a) => a.provider === 'google' && a.connected)

  const scanned = new Set(data.automation.scannedEmailIds)
  const tasked = new Set<string>()
  for (const t of data.tasks) if (t.source?.kind === 'email') tasked.add(t.source.externalId)

  // Collect recent inbox refs, skipping anything we've already handled.
  const refs: { accountId: string; id: string }[] = []
  for (const acc of accounts) {
    try {
      const client = getAuthorizedClient(acc.id)
      const list = await client.request<{ messages?: { id: string }[] }>({
        url: `${GMAIL_BASE}/messages?q=${encodeURIComponent('in:inbox newer_than:1d')}&maxResults=${MAX_EMAILS}`
      })
      for (const m of list.data.messages ?? []) {
        if (!scanned.has(m.id) && !tasked.has(m.id)) refs.push({ accountId: acc.id, id: m.id })
      }
    } catch {
      /* skip an account we can't reach */
    }
  }
  if (refs.length === 0) return { created: 0, scanned: 0 }

  const settled = await Promise.allSettled(
    refs.slice(0, MAX_EMAILS).map((r) => getMessage(r.accountId, r.id))
  )
  const emails: EmailFull[] = settled
    .filter((s): s is PromiseFulfilledResult<EmailFull> => s.status === 'fulfilled')
    .map((s) => s.value)
  if (emails.length === 0) return { created: 0, scanned: 0 }

  const detections = await detectFollowUps(
    emails.map((e, i) => ({ index: i, from: e.from, subject: e.subject, body: e.bodyText.slice(0, 800) }))
  )

  let created = 0
  for (const d of detections) {
    const e = emails[d.index]
    if (!e || !d.taskTitle?.trim()) continue
    const url = `https://mail.google.com/mail/u/${encodeURIComponent(e.accountEmail)}/#all/${e.threadId}`
    const attachments = e.attachments.map((a) => a.filename).filter(Boolean)
    const notes = [
      `From: ${e.from} <${e.fromEmail}>`,
      `Subject: ${e.subject}`,
      '',
      `🔗 Email: ${url}`,
      attachments.length ? `📎 Attachments (${attachments.length}): ${attachments.join(', ')}` : ''
    ]
      .filter(Boolean)
      .join('\n')

    store.createTask({
      title: d.taskTitle.trim().slice(0, 120),
      notes,
      workspaceId: e.workspaceId,
      status: 'todo',
      priority: 'medium',
      source: { kind: 'email', accountId: e.accountId, externalId: e.id, label: e.subject, url }
    })
    created++
  }

  // Mark everything we fetched as analyzed so it isn't re-processed next run.
  store.recordFollowUpScan(emails.map((e) => e.id))
  return { created, scanned: emails.length }
}

// --- Scheduler (6am & 6pm) ------------------------------------------------

let timer: ReturnType<typeof setInterval> | null = null

/** Runs the follow-up scan once each at ~6:00 and ~18:00 local time. */
export function startFollowUpScheduler(onCreated: (count: number) => void): void {
  if (timer) return
  timer = setInterval(() => void check(onCreated), 60_000)
}

async function check(onCreated: (count: number) => void): Promise<void> {
  const state = getStore().getData().automation
  if (!state.followUpScan) return

  const now = new Date()
  const dayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const h = now.getHours()
  const slot = h >= 18 ? `${dayKey}-PM` : h >= 6 ? `${dayKey}-AM` : null
  if (!slot || state.lastFollowUpSlot === slot) return

  getStore().setFollowUpSlot(slot) // mark first so a slow run can't double-fire
  try {
    const { created } = await scanFollowUps()
    if (created > 0) onCreated(created)
  } catch (err) {
    console.error('[followups] scheduled scan failed:', err)
  }
}
