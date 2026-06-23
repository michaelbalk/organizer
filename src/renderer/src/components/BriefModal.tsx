import { useCallback, useEffect, useState } from 'react'
import type { CalendarEvent } from '@shared/types'

interface Props {
  event: CalendarEvent
  onClose: () => void
  onAttached: () => Promise<void> | void
  onToast: (msg: string) => void
  onGoToSettings: () => void
}

/**
 * Generates a meeting brief with Claude, lets the user review/edit it, then
 * writes it into the event's description in Google Calendar. Kept review-first
 * because attaching mutates the user's real calendar.
 */
export function BriefModal({ event, onClose, onAttached, onToast, onGoToSettings }: Props): JSX.Element {
  const [guidance, setGuidance] = useState('')
  const [brief, setBrief] = useState('')
  const [generating, setGenerating] = useState(false)
  const [attaching, setAttaching] = useState(false)
  const [error, setError] = useState<{ message: string; reconnect: boolean } | null>(null)

  const generate = useCallback(async () => {
    setGenerating(true)
    setError(null)
    try {
      const text = await window.api.draftMeetingBrief({
        accountEmail: event.accountEmail,
        title: event.title,
        when: whenLabel(event),
        attendees: (event.attendees ?? []).join(', ') || undefined,
        location: event.location || undefined,
        description: event.description || undefined,
        guidance: guidance.trim() || undefined
      })
      setBrief(text)
    } catch (e) {
      setError(classify(e))
    } finally {
      setGenerating(false)
    }
  }, [event, guidance])

  // Auto-generate a first draft when the modal opens.
  useEffect(() => {
    void generate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const attach = async (): Promise<void> => {
    if (!brief.trim()) return
    setAttaching(true)
    setError(null)
    try {
      await window.api.attachEventBrief(event.accountId, event.calendarId, event.id, brief)
      onToast('Brief attached to the event ✓')
      await onAttached()
      onClose()
    } catch (e) {
      setError(classify(e))
      setAttaching(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal brief-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Meeting brief</h2>
            <div className="muted">
              {event.title} · {whenLabel(event)}
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} title="Close (Esc)">
            ✕
          </button>
        </div>

        <div className="modal-body">
          {error && (
            <div className="banner banner-warn">
              <span>{error.message}</span>
              {error.reconnect && (
                <button className="link-btn" onClick={onGoToSettings}>
                  Reconnect in Settings
                </button>
              )}
            </div>
          )}

          <div className="composer-ai">
            <input
              className="composer-input composer-ai-input"
              placeholder="Optional: focus the brief (e.g. push the Q3 numbers)…"
              value={guidance}
              disabled={generating}
              onChange={(e) => setGuidance(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void generate()
              }}
            />
            <button className="btn btn-sm composer-ai-btn" onClick={generate} disabled={generating}>
              {generating ? 'Drafting…' : brief ? '↻ Regenerate' : '✨ Generate'}
            </button>
          </div>

          <label className="field">
            <span>Brief (editable)</span>
            <textarea
              className="brief-body"
              value={brief}
              placeholder={generating ? 'Claude is drafting your brief…' : ''}
              onChange={(e) => setBrief(e.target.value)}
            />
          </label>
        </div>

        <div className="modal-foot">
          <span className="muted">Saves into this event's description in Google Calendar</span>
          <div className="modal-foot-right">
            <button className="btn btn-ghost" onClick={onClose} disabled={attaching}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={attach}
              disabled={attaching || generating || !brief.trim()}
            >
              {attaching ? 'Attaching…' : 'Attach to event'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function whenLabel(ev: CalendarEvent): string {
  const d = new Date(ev.start)
  const date = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
  if (ev.allDay) return `${date} · all day`
  return `${date} · ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
}

function classify(e: unknown): { message: string; reconnect: boolean } {
  const m = e instanceof Error ? e.message : String(e)
  if (/scope|insufficient|invalid_grant|not connected|PERMISSION_DENIED|403/i.test(m)) {
    return {
      message:
        'Attaching needs calendar write access. Reconnect this account in Settings to grant it.',
      reconnect: true
    }
  }
  return { message: m, reconnect: false }
}
