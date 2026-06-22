import type { EmailItem, InboxError, InboxResult } from '@shared/types'
import { getStore } from '../store'
import { getAuthorizedClient } from './accounts'

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'

interface GmailMessageRef {
  id: string
  threadId: string
}
interface GmailMessage {
  id: string
  threadId: string
  labelIds?: string[]
  snippet?: string
  internalDate?: string
  payload?: { headers?: { name: string; value: string }[] }
}

/**
 * Fetches the inbox across every connected Google account and merges the
 * results into a single time-sorted list. Per-account failures are collected
 * (not thrown) so one expired token doesn't blank the whole inbox.
 */
export async function listInbox(maxPerAccount = 20): Promise<InboxResult> {
  const store = getStore()
  const connected = store
    .getData()
    .accounts.filter((a) => a.provider === 'google' && a.connected)

  const emails: EmailItem[] = []
  const errors: InboxError[] = []

  await Promise.all(
    connected.map(async (account) => {
      try {
        const items = await fetchAccountInbox(
          account.id,
          account.email,
          account.workspaceId,
          maxPerAccount
        )
        emails.push(...items)
      } catch (err) {
        errors.push(toInboxError(account.id, account.email, err))
      }
    })
  )

  emails.sort((a, b) => b.date.localeCompare(a.date))

  // Keep the local "dismissed" set bounded to messages still in the inbox.
  store.pruneDismissedEmails(emails.map((e) => e.id))

  return { emails, errors, fetchedAt: new Date().toISOString() }
}

async function fetchAccountInbox(
  accountId: string,
  accountEmail: string,
  workspaceId: string,
  max: number
): Promise<EmailItem[]> {
  const client = getAuthorizedClient(accountId)

  const list = await client.request<{ messages?: GmailMessageRef[] }>({
    url: `${GMAIL_BASE}/messages?q=${encodeURIComponent('in:inbox')}&maxResults=${max}`
  })
  const refs = list.data.messages ?? []

  const messages = await Promise.all(
    refs.map((ref) =>
      client
        .request<GmailMessage>({
          url:
            `${GMAIL_BASE}/messages/${ref.id}` +
            `?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`
        })
        .then((r) => r.data)
    )
  )

  return messages.map((m) => normalize(m, accountId, accountEmail, workspaceId))
}

function normalize(
  m: GmailMessage,
  accountId: string,
  accountEmail: string,
  workspaceId: string
): EmailItem {
  const fromRaw = header(m, 'From')
  const { name, email } = parseAddress(fromRaw)
  const ms = m.internalDate ? Number(m.internalDate) : Date.now()

  return {
    id: m.id,
    threadId: m.threadId,
    accountId,
    accountEmail,
    workspaceId,
    from: name || email || '(unknown sender)',
    fromEmail: email,
    subject: header(m, 'Subject') || '(no subject)',
    snippet: decodeEntities(m.snippet ?? ''),
    date: new Date(ms).toISOString(),
    unread: m.labelIds?.includes('UNREAD') ?? false
  }
}

function header(m: GmailMessage, name: string): string {
  const lower = name.toLowerCase()
  return m.payload?.headers?.find((h) => h.name.toLowerCase() === lower)?.value ?? ''
}

/** Splits a "Display Name <addr@x>" header into its parts. */
function parseAddress(raw: string): { name: string; email: string } {
  const match = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/)
  if (match) return { name: match[1].trim(), email: match[2].trim() }
  return { name: '', email: raw.trim() }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

/** Shape of a gaxios HTTP error (duck-typed to avoid a hard dependency). */
interface HttpishError {
  response?: {
    status?: number
    data?: { error?: { message?: string; status?: string; details?: { reason?: string }[] } }
  }
  message?: string
}

function toInboxError(accountId: string, accountEmail: string, err: unknown): InboxError {
  const e = (err ?? {}) as HttpishError
  const status = e.response?.status
  const apiErr = e.response?.data?.error
  const apiMsg = apiErr?.message
  let message = apiMsg ?? e.message ?? String(err)

  // Surface the raw Google error to the dev console for diagnosis.
  console.error(`[inbox] fetch failed for ${accountEmail} (status ${status ?? '?'}):`, apiMsg ?? e.message)

  const reasonBlob = `${apiErr?.status ?? ''} ${apiErr?.details?.map((d) => d.reason).join(' ') ?? ''} ${message}`
  const isAuth =
    status === 401 || /invalid_grant|invalid credentials|not connected|sign in again/i.test(message)
  const isScope = status === 403 && /insufficient|scope|ACCESS_TOKEN_SCOPE/i.test(reasonBlob)
  const isApiDisabled =
    status === 403 && /SERVICE_DISABLED|has not been used in project|is disabled/i.test(reasonBlob)

  let needsReconnect = false
  if (isAuth || isScope) {
    needsReconnect = true
    message = 'Sign-in expired or permissions changed. Reconnect this account in Settings.'
  } else if (isApiDisabled) {
    message =
      "The Gmail API isn't enabled for your Google Cloud project yet. Enable it in the Cloud Console, wait ~1 minute, then hit Refresh."
  }

  return { accountId, accountEmail, message, needsReconnect }
}

/**
 * Deep link that opens a conversation in Gmail for the right account. Gmail web
 * URLs address conversations by THREAD id under the `all` view, which resolves
 * regardless of the message's current label (avoids the "Temporary Error 404").
 */
export function gmailThreadUrl(accountEmail: string, threadId: string): string {
  return `https://mail.google.com/mail/u/${encodeURIComponent(accountEmail)}/#all/${threadId}`
}
