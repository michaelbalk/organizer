import { useEffect, useState } from 'react'
import type { Contact } from '@shared/types'

interface Props {
  contact: Contact
  onClose: () => void
  onSaved: () => Promise<void>
  onToast: (msg: string) => void
}

/**
 * Asks Claude to analyze a contact (details + interaction history) and produce a
 * briefing, which can be edited and attached to the contact record.
 */
export function ContactBriefModal({ contact, onClose, onSaved, onToast }: Props): JSX.Element {
  const [guidance, setGuidance] = useState('')
  const [brief, setBrief] = useState(contact.briefing?.text ?? '')
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generate = async (): Promise<void> => {
    setError(null)
    setGenerating(true)
    try {
      const text = await window.api.draftContactBrief({
        name: contact.name,
        company: contact.company || undefined,
        title: contact.title || undefined,
        email: contact.email || undefined,
        stage: contact.stage,
        tags: contact.tags,
        notes: contact.notes || undefined,
        interactions: [...contact.interactions]
          .sort((a, b) => b.at.localeCompare(a.at))
          .map((it) => ({ at: it.at, kind: it.kind, note: it.note })),
        guidance: guidance.trim() || undefined
      })
      setBrief(text)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setGenerating(false)
    }
  }

  // Auto-generate on open only when no briefing exists yet.
  useEffect(() => {
    if (!contact.briefing) void generate()
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
    setSaving(true)
    try {
      await window.api.setContactBriefing(contact.id, brief)
      onToast('Briefing attached to contact ✓')
      await onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Contact briefing</h2>
          <button className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <p className="muted" style={{ marginTop: 0 }}>
            Claude analyzes {contact.name}&rsquo;s details and interaction history.
          </p>
          {error && <div className="banner banner-warn">{error}</div>}

          <div className="composer-ai">
            <input
              className="composer-input composer-ai-input"
              placeholder="Optional: focus the analysis (e.g. prep for renewal call)…"
              value={guidance}
              disabled={generating}
              onChange={(e) => setGuidance(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void generate()
              }}
            />
            <button className="btn btn-sm composer-ai-btn" onClick={generate} disabled={generating}>
              {generating ? 'Analyzing…' : brief ? '↻ Regenerate' : '✨ Generate'}
            </button>
          </div>

          <label className="field">
            <span>Briefing (editable)</span>
            <textarea
              rows={12}
              value={brief}
              placeholder={generating ? 'Analyzing…' : ''}
              onChange={(e) => setBrief(e.target.value)}
            />
          </label>
        </div>

        <div className="modal-foot">
          <span className="muted">Saves onto this contact record.</span>
          <div className="modal-foot-right">
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              disabled={saving || generating || !brief.trim()}
              onClick={attach}
            >
              {saving ? 'Attaching…' : 'Attach to contact'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
