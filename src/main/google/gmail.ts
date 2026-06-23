import type {
  EmailAttachmentMeta,
  EmailFull,
  EmailItem,
  GmailLabel,
  InboxError,
  InboxResult,
  MailActionKind,
  SendEmailInput
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
    messageIdHeader: findHeader(headers, 'Message-ID') || findHeader(headers, 'Message-Id'),
    bodyHtml: body.html,
    bodyText: body.text,
    isPlainText: body.isPlainText,
    attachments: collectAttachments(m.payload),
    unread: m.labelIds?.includes('UNREAD') ?? false
  }
}

/** Prefers a text/html part; falls back to escaped text/plain; then to nothing. */
function extractBody(payload?: GmailPart): { html: string; text: string; isPlainText: boolean } {
  if (!payload) return { html: '', text: '', isPlainText: true }

  const textPart = findPart(payload, 'text/plain')
  const text = textPart?.body?.data ? decodeB64(textPart.body.data) : ''

  const htmlPart = findPart(payload, 'text/html')
  if (htmlPart?.body?.data) {
    const html = decodeB64(htmlPart.body.data)
    return { html, text: text || htmlToText(html), isPlainText: false }
  }

  if (text) return { html: textToHtml(text), text, isPlainText: true }

  // Single-part message: the body hangs directly off the payload.
  if (payload.body?.data && payload.mimeType?.startsWith('text/')) {
    const raw = decodeB64(payload.body.data)
    const isHtml = payload.mimeType === 'text/html'
    return {
      html: isHtml ? raw : textToHtml(raw),
      text: isHtml ? htmlToText(raw) : raw,
      isPlainText: !isHtml
    }
  }

  return {
    html: '<p style="color:#64748b">(This message has no readable text content.)</p>',
    text: '',
    isPlainText: true
  }
}

/** Crude HTML→text reduction, good enough for quoting an original in a reply. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
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

// --- Write actions (need gmail.modify / gmail.send) -----------------------

/** Applies/removes labels on a message via the modify endpoint. */
async function modify(
  accountId: string,
  messageId: string,
  body: { addLabelIds?: string[]; removeLabelIds?: string[] }
): Promise<void> {
  const client = getAuthorizedClient(accountId)
  await client.request({
    url: `${GMAIL_BASE}/messages/${messageId}/modify`,
    method: 'POST',
    data: body
  })
}

/** Archive / trash / mark read / mark unread. */
export async function applyMailAction(
  accountId: string,
  messageId: string,
  action: MailActionKind
): Promise<void> {
  if (action === 'trash') {
    const client = getAuthorizedClient(accountId)
    await client.request({ url: `${GMAIL_BASE}/messages/${messageId}/trash`, method: 'POST' })
    return
  }
  if (action === 'archive') return modify(accountId, messageId, { removeLabelIds: ['INBOX'] })
  if (action === 'markRead') return modify(accountId, messageId, { removeLabelIds: ['UNREAD'] })
  return modify(accountId, messageId, { addLabelIds: ['UNREAD'] })
}

/** "File" a message: apply a label and remove it from the inbox. */
export async function fileMessage(
  accountId: string,
  messageId: string,
  labelId: string
): Promise<void> {
  return modify(accountId, messageId, { addLabelIds: [labelId], removeLabelIds: ['INBOX'] })
}

/** Lists the account's user-created labels (for the "File to…" menu). */
export async function listLabels(accountId: string): Promise<GmailLabel[]> {
  const client = getAuthorizedClient(accountId)
  const { data } = await client.request<{
    labels?: { id: string; name: string; type?: string }[]
  }>({ url: `${GMAIL_BASE}/labels` })
  return (data.labels ?? [])
    .filter((l) => l.type !== 'system')
    .map((l) => ({ id: l.id, name: l.name }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// --- Folders (Gmail labels) -----------------------------------------------

function connectedGoogleAccounts(): { id: string; email: string; workspaceId: string }[] {
  return getStore()
    .getData()
    .accounts.filter((a) => a.provider === 'google' && a.connected)
}

/** Distinct user-label ("folder") names across every connected account. */
export async function listFolders(): Promise<string[]> {
  const names = new Set<string>()
  await Promise.all(
    connectedGoogleAccounts().map(async (acc) => {
      try {
        for (const l of await listLabels(acc.id)) names.add(l.name)
      } catch {
        /* skip an account we can't reach right now */
      }
    })
  )
  return [...names].sort((a, b) => a.localeCompare(b))
}

/** Creates a folder (label) of this name in every account that lacks it. */
export async function createFolder(name: string): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Folder name cannot be empty.')

  const accounts = connectedGoogleAccounts()
  if (accounts.length === 0) throw new Error('Connect a Google account first.')

  await Promise.all(
    accounts.map(async (acc) => {
      const existing = await listLabels(acc.id)
      if (existing.some((l) => l.name.toLowerCase() === trimmed.toLowerCase())) return
      const client = getAuthorizedClient(acc.id)
      await client.request({
        url: `${GMAIL_BASE}/labels`,
        method: 'POST',
        data: { name: trimmed, labelListVisibility: 'labelShow', messageListVisibility: 'show' }
      })
    })
  )
}

/** Deletes the folder (label) of this name from every account that has it. */
export async function deleteFolder(name: string): Promise<void> {
  await Promise.all(
    connectedGoogleAccounts().map(async (acc) => {
      const match = (await listLabels(acc.id)).find((l) => l.name === name)
      if (!match) return
      const client = getAuthorizedClient(acc.id)
      await client.request({ url: `${GMAIL_BASE}/labels/${match.id}`, method: 'DELETE' })
    })
  )
}

/** Lists messages filed under a folder (label) across all connected accounts. */
export async function listFolderMessages(name: string, maxPerAccount = 30): Promise<InboxResult> {
  const emails: EmailItem[] = []
  const errors: InboxError[] = []

  await Promise.all(
    connectedGoogleAccounts().map(async (acc) => {
      try {
        const match = (await listLabels(acc.id)).find((l) => l.name === name)
        if (!match) return
        const client = getAuthorizedClient(acc.id)
        const list = await client.request<{ messages?: GmailMessageRef[] }>({
          url: `${GMAIL_BASE}/messages?labelIds=${encodeURIComponent(match.id)}&maxResults=${maxPerAccount}`
        })
        const messages = await Promise.all(
          (list.data.messages ?? []).map((ref) =>
            client
              .request<GmailMessage>({
                url:
                  `${GMAIL_BASE}/messages/${ref.id}` +
                  `?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`
              })
              .then((r) => r.data)
          )
        )
        emails.push(...messages.map((m) => normalize(m, acc.id, acc.email, acc.workspaceId)))
      } catch (err) {
        errors.push(toInboxError(acc.id, acc.email, err))
      }
    })
  )

  emails.sort((a, b) => b.date.localeCompare(a.date))
  return { emails, errors, fetchedAt: new Date().toISOString() }
}

/** Sends a reply/forward/new message via Gmail, threading replies correctly. */
export async function sendEmail(input: SendEmailInput): Promise<void> {
  const account = getStore()
    .getData()
    .accounts.find((a) => a.id === input.accountId)
  if (!account) throw new Error('Account not found.')

  const client = getAuthorizedClient(input.accountId)
  const raw = buildRawMessage(account.email, input)
  await client.request({
    url: `${GMAIL_BASE}/messages/send`,
    method: 'POST',
    data: input.threadId ? { raw, threadId: input.threadId } : { raw }
  })
}

/** Builds a base64url-encoded RFC822 message (UTF-8, plain text). */
function buildRawMessage(fromEmail: string, input: SendEmailInput): string {
  const headers: string[] = [
    `From: ${fromEmail}`,
    `To: ${input.to}`,
    ...(input.cc ? [`Cc: ${input.cc}`] : []),
    `Subject: ${encodeHeader(input.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit'
  ]
  if (input.inReplyTo) {
    headers.push(`In-Reply-To: ${input.inReplyTo}`, `References: ${input.inReplyTo}`)
  }
  const message = `${headers.join('\r\n')}\r\n\r\n${input.body}`
  return Buffer.from(message, 'utf-8').toString('base64url')
}

/** RFC2047-encodes a header value when it contains non-ASCII characters. */
function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value
  return `=?UTF-8?B?${Buffer.from(value, 'utf-8').toString('base64')}?=`
}

/**
 * Deep link that opens a conversation in Gmail for the right account. Gmail web
 * URLs address conversations by THREAD id under the `all` view, which resolves
 * regardless of the message's current label (avoids the "Temporary Error 404").
 */
export function gmailThreadUrl(accountEmail: string, threadId: string): string {
  return `https://mail.google.com/mail/u/${encodeURIComponent(accountEmail)}/#all/${threadId}`
}
