import { useState } from 'react'
import type { Account, CreatedEvent, MeetingPlatform } from '@shared/types'

interface Props {
  accounts: Account[]
  onClose: () => void
  onCreated: () => Promise<void>
  onToast: (msg: string) => void
}

const DURATIONS = [15, 30, 45, 60, 90, 120]

/** Schedule a meeting — creates a Google Calendar event, optionally with a Meet link. */
export function NewMeeting({ accounts, onClose, onCreated, onToast }: Props): JSX.Element {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(todayKey())
  const [time, setTime] = useState(nextHour())
  const [duration, setDuration] = useState(30)
  const [platform, setPlatform] = useState<MeetingPlatform>('meet')
  const [attendees, setAttendees] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<CreatedEvent | null>(null)

  const account = accounts.find((a) => a.id === accountId) ?? accounts[0]

  const create = async (): Promise<void> => {
    if (!account) return
    if (!title.trim()) {
      setError('Give the meeting a title.')
      return
    }
    if (!date || !time) {
      setError('Pick a date and start time.')
      return
    }
    setError(null)
    setSaving(true)
    try {
      const start = `${date}T${time}:00`
      const end = formatLocal(new Date(new Date(start).getTime() + duration * 60000))
      const result = await window.api.createCalendarEvent({
        accountId: account.id,
        title: title.trim(),
        start,
        end,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        attendees: attendees
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        description: description.trim() || undefined,
        platform
      })
      onToast('Meeting scheduled ✓')
      await onCreated()
      setCreated(result)
    } catch (e) {
      setError(classify(e))
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>New meeting</h2>
          <button className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        {created ? (
          <div className="modal-body">
            <p className="muted">✓ Meeting scheduled and invites sent.</p>
            {created.meetLink ? (
              <div className="field">
                <span>Join link</span>
                <div className="task-source">
                  <span className="task-source-label">{created.meetLink}</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => navigator.clipboard.writeText(created.meetLink ?? '')}
                    >
                      Copy
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => window.open(created.meetLink ?? '', '_blank')}
                    >
                      Open ↗
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="muted">No video link was attached.</p>
            )}
          </div>
        ) : (
          <div className="modal-body">
            {error && <div className="banner banner-warn">{error}</div>}

            {accounts.length > 1 && (
              <label className="field">
                <span>Organizer account</span>
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
              <span>Title</span>
              <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Meeting title" />
            </label>

            <div className="field-row">
              <label className="field">
                <span>Date</span>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              <label className="field">
                <span>Start</span>
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </label>
            </div>

            <div className="field-row">
              <label className="field">
                <span>Duration</span>
                <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                  {DURATIONS.map((d) => (
                    <option key={d} value={d}>
                      {d} min
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Conferencing</span>
                <select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value as MeetingPlatform)}
                >
                  <option value="meet">Google Meet</option>
                  <option value="zoom">Zoom</option>
                  <option value="none">No video link</option>
                  <option value="teams" disabled>
                    Microsoft Teams (soon)
                  </option>
                </select>
              </label>
            </div>

            <label className="field">
              <span>Attendees (comma-separated emails)</span>
              <input
                value={attendees}
                onChange={(e) => setAttendees(e.target.value)}
                placeholder="jane@example.com, sam@example.com"
              />
            </label>

            <label className="field">
              <span>Description</span>
              <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
          </div>
        )}

        <div className="modal-foot">
          <span className="muted">{account ? `From ${account.email}` : 'No connected account'}</span>
          <div className="modal-foot-right">
            <button className="btn" onClick={onClose}>
              {created ? 'Close' : 'Cancel'}
            </button>
            {!created && (
              <button className="btn btn-primary" disabled={saving || !account} onClick={create}>
                {saving ? 'Scheduling…' : 'Schedule'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function todayKey(): string {
  return formatLocal(new Date()).slice(0, 10)
}
function nextHour(): string {
  const d = new Date()
  d.setHours(d.getHours() + 1, 0, 0, 0)
  return `${String(d.getHours()).padStart(2, '0')}:00`
}
function formatLocal(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`
}
function classify(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  return /scope|insufficient|invalid_grant|not connected|PERMISSION_DENIED/i.test(m)
    ? 'This account needs reconnecting in Settings to grant calendar write access.'
    : m
}
