import { useEffect, useState } from 'react'
import type { EmailFull, EmailItem } from '@shared/types'

interface Props {
  email: EmailItem
  color: string
  workspaceName: string
  onClose: () => void
  onCapture: () => void
  onClear: () => void
}

/**
 * In-app message reader. The email body is rendered inside a sandboxed iframe
 * with a strict Content-Security-Policy so hostile markup can't run scripts,
 * navigate the app, or leak data. Remote images are blocked by default (they're
 * the usual tracking-pixel vector) and loadable on demand.
 */
export function MessageReader({
  email,
  color,
  workspaceName,
  onClose,
  onCapture,
  onClear
}: Props): JSX.Element {
  const [full, setFull] = useState<EmailFull | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showImages, setShowImages] = useState(false)

  useEffect(() => {
    let alive = true
    setFull(null)
    setError(null)
    setShowImages(false)
    window.api
      .getMessage(email.accountId, email.id)
      .then((m) => alive && setFull(m))
      .catch((e: unknown) => alive && setError(errMessage(e)))
    return () => {
      alive = false
    }
  }, [email.accountId, email.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="reader" onClick={(e) => e.stopPropagation()}>
        <div className="reader-head">
          <div className="reader-head-main">
            <span className="ws-chip" style={{ background: color }}>
              {workspaceName}
            </span>
            <span className="muted">{email.accountEmail}</span>
          </div>
          <button className="icon-btn" onClick={onClose} title="Close (Esc)">
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

        {full && full.attachments.length > 0 && (
          <div className="reader-attachments">
            {full.attachments.map((a, i) => (
              <span key={i} className="chip" title={`${a.mimeType} · ${formatSize(a.sizeBytes)}`}>
                📎 {a.filename}
              </span>
            ))}
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
                sandbox=""
                srcDoc={buildSrcDoc(full.bodyHtml, showImages)}
                title="Email body"
              />
            </>
          )}
        </div>

        <div className="reader-foot">
          <span className="reader-foot-note muted">Reply &amp; archive arrive in the next update.</span>
          <div className="reader-foot-right">
            <button className="btn btn-ghost" onClick={onClear} title="Clear from inbox">
              ✓ Clear
            </button>
            <button className="btn btn-primary" onClick={onCapture} title="Capture as a task">
              + Task
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Wraps the email body in a minimal HTML document with a strict CSP. With the
 * iframe's empty `sandbox`, scripts/forms/navigation are already disabled; the
 * CSP additionally gates image/media loading to neutralize tracking pixels.
 */
function buildSrcDoc(bodyHtml: string, showImages: boolean): string {
  const media = showImages ? 'data: https: http:' : 'data:'
  return `<!doctype html><html><head><meta charset="utf-8">
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

function formatFull(iso: string): string {
  return new Date(iso).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

function formatSize(bytes: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function errMessage(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  return /scope|insufficient|invalid_grant|not connected/i.test(m)
    ? 'Could not load this message — the account may need to be reconnected in Settings.'
    : `Could not load this message. ${m}`
}
