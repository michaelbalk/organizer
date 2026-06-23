import type {
  EmailAttachmentMeta,
  EmailFull,
  EmailItem,
  InboxError,
  InboxResult
} from '@shared/types'
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
  return findHeader(m.payload?.headers, name)
}

function findHeader(headers: { name: string; value: string }[] | undefined, name: string): string {
  const lower = name.toLowerCase()
  return headers?.find((h) => h.name.toLowerCase() === lower)?.value ?? ''
}

// --- Full message (in-app reader) -----------------------------------------

interface GmailPart {
  mimeType?: string
  filename?: string
  headers?: { name: string; value: string }[]
  body?: { data?: string; size?: number; attachmentId?: string }
  parts?: GmailPart[]
}
interface GmailFullMessage {
  id: string
  threadId: string
  labelIds?: string[]
  internalDate?: string
  payload?: GmailPart
}

/** Fetches a single message in full and projects it for the in-app reader. */
export async function getMessage(accountId: string, messageId: string): Promise<EmailFull> {
  const account = getStore()
    .getData()
    .accounts.find((a) => a.id === accountId)
  if (!account) throw new Error('Account not found.')

  const client = getAuthorizedClient(accountId)
  const { data: m } = await client.request<GmailFullMessage>({
    url: `${GMAIL_BASE}/messages/${messageId}?format=full`
  })

  const headers = m.payload?.headers
  const { name, email } = parseAddress(findHeader(headers, 'From'))
  const body = extractBody(m.payload)
  const ms = m.internalDate ? Number(m.internalDate) : Date.now()

  return {
    id: m.id,
    threadId: m.threadId,
    accountId,
    accountEmail: account.email,
    workspaceId: account.workspaceId,
    from: name || email || '(unknown sender)',
    fromEmail: email,
    to: findHeader(headers, 'To'),
    cc: findHeader(headers, 'Cc'),
    subject: findHeader(headers, 'Subject') || '(no subject)',
    date: new Date(ms).toISOString(),
    bodyHtml: body.html,
    isPlainText: body.isPlainText,
    attachments: collectAttachments(m.payload),
    unread: m.labelIds?.includes('UNREAD') ?? false
  }
}

/** Prefers a text/html part; falls back to escaped text/plain; then to nothing. */
function extractBody(payload?: GmailPart): { html: string; isPlainText: boolean } {
  if (!payload) return { html: '', isPlainText: true }

  const htmlPart = findPart(payload, 'text/html')
  if (htmlPart?.body?.data) return { html: decodeB64(htmlPart.body.data), isPlainText: false }

  const textPart = findPart(payload, 'text/plain')
  if (textPart?.body?.data) return { html: textToHtml(decodeB64(textPart.body.data)), isPlainText: true }

  // Single-part message: the body hangs directly off the payload.
  if (payload.body?.data && payload.mimeType?.startsWith('text/')) {
    const raw = decodeB64(payload.body.data)
    const isHtml = payload.mimeType === 'text/html'
    return { html: isHtml ? raw : textToHtml(raw), isPlainText: !isHtml }
  }

  return { html: '<p style="color:#64748b">(This message has no readable text content.)</p>', isPlainText: true }
}

function findPart(part: GmailPart, mime: string): GmailPart | null {
  if (part.mimeType === mime && part.body?.data) return part
  for (const child of part.parts ?? []) {
    const found = findPart(child, mime)
    if (found) return found
  }
  return null
}

function collectAttachments(part?: GmailPart, acc: EmailAttachmentMeta[] = []): EmailAttachmentMeta[] {
  if (!part) return acc
  if (part.filename && part.body?.attachmentId) {
    acc.push({
      filename: part.filename,
      mimeType: part.mimeType ?? 'application/octet-stream',
      sizeBytes: part.body.size ?? 0
    })
  }
  for (const child of part.parts ?? []) collectAttachments(child, acc)
  return acc
}

function decodeB64(data: string): string {
  return Buffer.from(data, 'base64url').toString('utf-8')
}

/** Wraps plain text so it renders with preserved whitespace and is HTML-safe. */
function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return `<pre style="white-space:pre-wrap;word-wrap:break-word;font-family:inherit;margin:0">${escaped}</pre>`
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
