import { useEffect, useMemo, useState } from 'react'
import type { EmailFull, EmailItem, GmailLabel, MailActionKind } from '@shared/types'

interface Props {
  email: EmailItem
  color: string
  workspaceName: string
  onToast: (msg: string) => void
  /** Capture the email as a task (owned by the inbox). */
  onCapture: (e: EmailItem) => Promise<void>
  onAddContact: (e: EmailItem) => Promise<void>
  /** Reload the inbox after a server-side mutation (archive/trash/file/send). */
  onServerChanged: () => Promise<void>
  /** Close the reading pane (e.g. after the message leaves the inbox). */
  onDeselect: () => void
  /** Jump to Settings to reconnect the account (used on scope errors). */
  onGoToSettings: () => void
}

type ComposerMode = 'reply' | 'replyAll' | 'forward'
interface ComposerState {
  mode: ComposerMode
  to: string
  cc: string
  subject: string
  body: string
  /** The quoted original, kept separate so a Claude draft can be inserted above it. */
  quote: string
  /** Optional instruction passed to the Claude assistant. */
  guidance: string
  drafting: boolean
  sending: boolean
}

/**
 * Embedded reading pane. The message body renders inside a sandboxed iframe with
 * a strict CSP (no scripts/forms/navigation; remote images blocked by default).
 * The action bar and composer drive Gmail directly via gmail.modify / gmail.send.
 */
export function MessageReader({
  email,
  color,
  workspaceName,
  onToast,
  onCapture,
  onAddContact,
  onServerChanged,
  onDeselect,
  onGoToSettings
}: Props): JSX.Element {
  const [full, setFull] = useState<EmailFull | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<{ message: string; reconnect: boolean } | null>(null)
  const [showImages, setShowImages] = useState(false)
  const [busy, setBusy] = useState(false)
  const [composer, setComposer] = useState<ComposerState | null>(null)
  const [labels, setLabels] = useState<GmailLabel[] | null>(null)
  const [fileOpen, setFileOpen] = useState(false)
  const [aiEnabled, setAiEnabled] = useState(false)

  useEffect(() => {
    window.api
      .isAnthropicConfigured()
      .then(setAiEnabled)
      .catch(() => setAiEnabled(false))
  }, [])

  useEffect(() => {
    let alive = true
    setFull(null)
    setError(null)
    setActionError(null)
    setShowImages(false)
    setComposer(null)
    setFileOpen(false)
    window.api
      .getMessage(email.accountId, email.id)
      .then((m) => alive && setFull(m))
      .catch((e: unknown) => alive && setError(classifyError(e).message))
    return () => {
      alive = false
    }
  }, [email.accountId, email.id])

  /** Routes a failure to a persistent banner (scope) or a transient toast. */
  const reportError = (e: unknown): void => {
    const info = classifyError(e)
    if (info.reconnect) setActionError(info)
    else onToast(info.message)
  }

  const srcDoc = useMemo(
    () => (full ? buildSrcDoc(full.bodyHtml, showImages) : ''),
    [full, showImages]
  )

  // --- Server actions -----------------------------------------------------

  const runAction = async (action: MailActionKind): Promise<void> => {
    setBusy(true)
    setActionError(null)
    try {
      await window.api.mailAction(email.accountId, email.id, action)
      onToast(ACTION_TOAST[action])
      await onServerChanged()
      if (action === 'archive' || action === 'trash') onDeselect()
      else setFull((f) => (f ? { ...f, unread: action === 'markUnread' } : f))
    } catch (e) {
      reportError(e)
    } finally {
      setBusy(false)
    }
  }

  const openFileMenu = async (): Promise<void> => {
    setFileOpen((v) => !v)
    if (labels === null) {
      try {
        setLabels(await window.api.listLabels(email.accountId))
      } catch (e) {
        reportError(e)
        setLabels([])
      }
    }
  }

  const fileTo = async (label: GmailLabel): Promise<void> => {
    setBusy(true)
    setFileOpen(false)
    try {
      await window.api.fileMessage(email.accountId, email.id, label.id)
      onToast(`Filed to ${label.name}`)
      await onServerChanged()
      onDeselect()
    } catch (e) {
      reportError(e)
    } finally {
      setBusy(false)
    }
  }

  // --- Composer -----------------------------------------------------------

  const startCompose = (mode: ComposerMode): void => {
    if (!full) return
    const to = mode === 'forward' ? '' : full.fromEmail
    const cc =
      mode === 'replyAll'
        ? dedupeAddresses([full.to, full.cc], [email.accountEmail, full.fromEmail])
        : ''
    const subject = mode === 'forward' ? fwdSubject(full.subject) : reSubject(full.subject)
    const quote = mode === 'forward' ? forwardQuote(full) : replyQuote(full)
    setComposer({
      mode,
      to,
      cc,
      subject,
      body: `\n${quote}`,
      quote,
      guidance: '',
      drafting: false,
      sending: false
    })
  }

  const draftWithClaude = async (): Promise<void> => {
    if (!composer || !full) return
    setComposer({ ...composer, drafting: true })
    try {
      const draft = await window.api.draftReply({
        accountEmail: email.accountEmail,
        mode: composer.mode,
        fromName: full.from,
        subject: full.subject,
        originalBody: full.bodyText,
        guidance: composer.guidance
      })
      setComposer((c) => (c ? { ...c, body: `${draft}\n\n${c.quote}`, drafting: false } : c))
      onToast('Draft ready ✨')
    } catch (e) {
      reportError(e)
      setComposer((c) => (c ? { ...c, drafting: false } : c))
    }
  }

  const send = async (): Promise<void> => {
    if (!composer || !full) return
    if (!composer.to.trim()) {
      onToast('Add at least one recipient.')
      return
    }
    setComposer({ ...composer, sending: true })
    try {
      await window.api.sendEmail({
        accountId: email.accountId,
        to: composer.to,
        cc: composer.cc.trim() || undefined,
        subject: composer.subject,
        body: composer.body,
        threadId: email.threadId,
        inReplyTo: composer.mode === 'forward' ? undefined : full.messageIdHeader || undefined
      })
      onToast('Sent ✓')
      setComposer(null)
      await onServerChanged()
    } catch (e) {
      reportError(e)
      setComposer((c) => (c ? { ...c, sending: false } : c))
    }
  }

  // --- Render -------------------------------------------------------------

  return (
    <div className="reader-pane">
      <div className="reader-head">
        <div className="reader-head-main">
          <span className="ws-chip" style={{ background: color }}>
            {workspaceName}
          </span>
          <span className="muted">{email.accountEmail}</span>
          {full?.unread === false && <span className="pill pill-off">Read</span>}
        </div>
        <button className="icon-btn" onClick={onDeselect} title="Close">
          ✕
        </button>
      </div>

      <div className="reader-subject">{email.subject}</div>
      <div className="reader-meta">
        <div>
          <strong>{full?.from ?? email.from}</strong>{' '}
          {full?.fromEmail && <span className="muted">&lt;{full.fromEmail}&gt;</span>}
        </div>
        {full?.to && <div className="muted">to {full.to}</div>}
        <div className="muted reader-date">{formatFull(full?.date ?? email.date)}</div>
      </div>

      {/* Action bar */}
      <div className="reader-actions">
        <button className="btn btn-sm btn-primary" disabled={!full || busy} onClick={() => startCompose('reply')}>
          ↩ Reply
        </button>
        <button className="btn btn-sm btn-ghost" disabled={!full || busy} onClick={() => startCompose('replyAll')}>
          ↩ All
        </button>
        <button className="btn btn-sm btn-ghost" disabled={!full || busy} onClick={() => startCompose('forward')}>
          ↪ Forward
        </button>
        <span className="reader-actions-gap" />
        <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => runAction('archive')} title="Archive">
          🗄 Archive
        </button>
        <div className="file-wrap">
          <button className="btn btn-sm btn-ghost" disabled={busy} onClick={openFileMenu} title="File to a label">
            🏷 File
          </button>
          {fileOpen && (
            <div className="file-menu">
              {labels === null ? (
                <div className="file-menu-empty muted">Loading…</div>
              ) : labels.length === 0 ? (
                <div className="file-menu-empty muted">No custom labels</div>
              ) : (
                labels.map((l) => (
                  <button key={l.id} className="file-menu-item" onClick={() => fileTo(l)}>
                    {l.name}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => runAction('trash')} title="Move to Trash">
          🗑 Trash
        </button>
        <button
          className="btn btn-sm btn-ghost"
          disabled={!full || busy}
          onClick={() => runAction(full?.unread ? 'markRead' : 'markUnread')}
        >
          {full?.unread ? '✓ Mark read' : '• Mark unread'}
        </button>
        <span className="reader-actions-gap" />
        <button
          className="btn btn-sm btn-ghost"
          disabled={busy}
          onClick={() => onAddContact(email)}
          title="Add the sender to Contacts and log this email"
        >
          + Contact
        </button>
        <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => onCapture(email)} title="Capture as a task">
          + Task
        </button>
      </div>

      {actionError && (
        <div className="banner banner-warn reader-action-error">
          <span>{actionError.message}</span>
          {actionError.reconnect && (
            <button className="link-btn" onClick={onGoToSettings}>
              Reconnect in Settings
            </button>
          )}
        </div>
      )}

      <div className="reader-body">
        {error ? (
          <div className="banner banner-error">{error}</div>
        ) : !full ? (
          <div className="app-loading" style={{ height: 'auto', paddingTop: 30 }}>
            <div className="spinner" />
            <span>Loading message…</span>
          </div>
        ) : (
          <>
            {!showImages && !full.isPlainText && (
              <div className="reader-images-bar">
                <span>External images are blocked for your privacy.</span>
                <button className="link-btn" onClick={() => setShowImages(true)}>
                  Load images
                </button>
              </div>
            )}
            <iframe
              className="reader-frame"
              // allow-popups (without allow-scripts) lets links open as new windows,
              // which the main process routes to the system browser. Scripts stay blocked.
              sandbox="allow-popups allow-popups-to-escape-sandbox"
              srcDoc={srcDoc}
              title="Email body"
            />
          </>
        )}
      </div>

      {composer && (
        <div className="composer">
          <div className="composer-head">
            <strong>
              {composer.mode === 'forward' ? 'Forward' : composer.mode === 'replyAll' ? 'Reply all' : 'Reply'}
            </strong>
            <button className="icon-btn" onClick={() => setComposer(null)} title="Discard">
              ✕
            </button>
          </div>
          <input
            className="composer-input"
            placeholder="To"
            value={composer.to}
            onChange={(e) => setComposer({ ...composer, to: e.target.value })}
          />
          {(composer.cc || composer.mode === 'replyAll') && (
            <input
              className="composer-input"
              placeholder="Cc"
              value={composer.cc}
              onChange={(e) => setComposer({ ...composer, cc: e.target.value })}
            />
          )}
          <input
            className="composer-input"
            placeholder="Subject"
            value={composer.subject}
            onChange={(e) => setComposer({ ...composer, subject: e.target.value })}
          />
          {aiEnabled && (
            <div className="composer-ai">
              <input
                className="composer-input composer-ai-input"
                placeholder="Optional: tell Claude what to say…"
                value={composer.guidance}
                disabled={composer.drafting}
                onChange={(e) => setComposer({ ...composer, guidance: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void draftWithClaude()
                }}
              />
              <button
                className="btn btn-sm composer-ai-btn"
                onClick={draftWithClaude}
                disabled={composer.drafting}
              >
                {composer.drafting ? 'Drafting…' : '✨ Draft with Claude'}
              </button>
            </div>
          )}
          <textarea
            className="composer-body"
            value={composer.body}
            onChange={(e) => setComposer({ ...composer, body: e.target.value })}
          />
          <div className="composer-foot">
            <span className="muted composer-hint">Sends from {email.accountEmail}</span>
            <div className="composer-foot-right">
              <button className="btn btn-ghost" onClick={() => setComposer(null)} disabled={composer.sending}>
                Discard
              </button>
              <button className="btn btn-primary" onClick={send} disabled={composer.sending}>
                {composer.sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// --- Helpers --------------------------------------------------------------

const ACTION_TOAST: Record<MailActionKind, string> = {
  archive: 'Archived ✓',
  trash: 'Moved to Trash ✓',
  markRead: 'Marked read',
  markUnread: 'Marked unread'
}

function buildSrcDoc(bodyHtml: string, showImages: boolean): string {
  const media = showImages ? 'data: https: http:' : 'data:'
  return `<!doctype html><html><head><meta charset="utf-8">
<base target="_blank">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${media}; media-src ${media}; style-src 'unsafe-inline'; font-src data:;">
<style>
  html, body { margin: 0; }
  body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: #0f172a; background: #fff; padding: 16px; font-size: 14px; line-height: 1.5; word-wrap: break-word; }
  img { max-width: 100%; height: auto; }
  a { color: #2563eb; }
  table { max-width: 100%; }
  blockquote { border-left: 3px solid #e2e8f0; margin: 0; padding-left: 12px; color: #475569; }
</style></head><body>${bodyHtml}</body></html>`
}

function reSubject(subject: string): string {
  return /^re:/i.test(subject.trim()) ? subject : `Re: ${subject}`
}
function fwdSubject(subject: string): string {
  return /^fwd:/i.test(subject.trim()) ? subject : `Fwd: ${subject}`
}

function replyQuote(full: EmailFull): string {
  const quoted = full.bodyText
    .split('\n')
    .map((l) => `> ${l}`)
    .join('\n')
  return `On ${formatFull(full.date)}, ${full.from} wrote:\n${quoted}\n`
}

function forwardQuote(full: EmailFull): string {
  return (
    `---------- Forwarded message ----------\n` +
    `From: ${full.from} <${full.fromEmail}>\n` +
    `Date: ${formatFull(full.date)}\n` +
    `Subject: ${full.subject}\n` +
    `To: ${full.to}\n\n` +
    `${full.bodyText}\n`
  )
}

/** Splits comma-separated address headers, drops excluded emails, dedupes. */
function dedupeAddresses(sources: string[], exclude: string[]): string {
  const skip = new Set(exclude.map((e) => e.toLowerCase()).filter(Boolean))
  const seen = new Set<string>()
  const out: string[] = []
  for (const src of sources) {
    for (const part of src.split(',')) {
      const addr = part.trim()
      if (!addr) continue
      const email = (addr.match(/<([^>]+)>/)?.[1] ?? addr).toLowerCase()
      if (skip.has(email) || seen.has(email)) continue
      seen.add(email)
      out.push(addr)
    }
  }
  return out.join(', ')
}

function formatFull(iso: string): string {
  return new Date(iso).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

/** Classifies a failure; scope/auth problems become a "reconnect" banner. */
function classifyError(e: unknown): { message: string; reconnect: boolean } {
  const m = e instanceof Error ? e.message : String(e)
  if (/scope|insufficient|invalid_grant|not connected|PERMISSION_DENIED/i.test(m)) {
    return {
      message:
        'This account needs to be reconnected to grant send & organize permissions. Your sign-in predates them.',
      reconnect: true
    }
  }
  return { message: m, reconnect: false }
}
