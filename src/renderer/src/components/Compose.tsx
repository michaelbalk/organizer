import { useEffect, useState } from 'react'
import type { Account } from '@shared/types'

interface Props {
  /** Connected Google accounts to send from. */
  accounts: Account[]
  onClose: () => void
  onToast: (msg: string) => void
}

/** Standalone "new email" composer, with the same ✨ Claude drafting as replies. */
export function Compose({ accounts, onClose, onToast }: Props): JSX.Element {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [to, setTo] = useState('')
  const [cc, setCc] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [guidance, setGuidance] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aiEnabled, setAiEnabled] = useState(false)

  useEffect(() => {
    window.api
      .isAnthropicConfigured()
      .then(setAiEnabled)
      .catch(() => setAiEnabled(false))
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const account = accounts.find((a) => a.id === accountId) ?? accounts[0]

  const draftWithClaude = async (): Promise<void> => {
    if (!account) return
    if (!guidance.trim()) {
      setError('Add a quick note telling Claude what the email should say.')
      return
    }
    setError(null)
    setDrafting(true)
    try {
      const draft = await window.api.draftReply({
        accountEmail: account.email,
        mode: 'new',
        subject,
        guidance
      })
      setBody(draft)
      onToast('Draft ready ✨')
    } catch (e) {
      setError(classify(e))
    } finally {
      setDrafting(false)
    }
  }

  const send = async (): Promise<void> => {
    if (!account) return
    if (!to.trim()) {
      setError('Add at least one recipient.')
      return
    }
    setError(null)
    setSending(true)
    try {
      await window.api.sendEmail({
        accountId: account.id,
        to,
        cc: cc.trim() || undefined,
        subject: subject.trim() || '(no subject)',
        body
      })
      onToast('Sent ✓')
      onClose()
    } catch (e) {
      setError(classify(e))
      setSending(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal compose-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>New email</h2>
          <button className="icon-btn" onClick={onClose} title="Close (Esc)">
            ✕
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="banner banner-warn">{error}</div>}

          {accounts.length > 1 && (
            <label className="field">
              <span>From</span>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.email}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="field">
            <span>To</span>
            <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com" />
          </label>
          <label className="field">
            <span>Cc</span>
            <input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Optional" />
          </label>
          <label className="field">
            <span>Subject</span>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>

          {aiEnabled && (
            <div className="composer-ai">
              <input
                className="composer-input composer-ai-input"
                placeholder="Tell Claude what this email is about…"
                value={guidance}
                disabled={drafting}
                onChange={(e) => setGuidance(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void draftWithClaude()
                }}
              />
              <button className="btn btn-sm composer-ai-btn" onClick={draftWithClaude} disabled={drafting}>
                {drafting ? 'Drafting…' : '✨ Draft with Claude'}
              </button>
            </div>
          )}

          <label className="field">
            <span>Message</span>
            <textarea className="compose-body" value={body} onChange={(e) => setBody(e.target.value)} />
          </label>
        </div>

        <div className="modal-foot">
          <span className="muted">{account ? `Sends from ${account.email}` : 'No connected account'}</span>
          <div className="modal-foot-right">
            <button className="btn btn-ghost" onClick={onClose} disabled={sending}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={send} disabled={sending || !account}>
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function classify(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  return /scope|insufficient|invalid_grant|not connected|PERMISSION_DENIED/i.test(m)
    ? 'This account needs reconnecting in Settings to grant send permission.'
    : m
}
