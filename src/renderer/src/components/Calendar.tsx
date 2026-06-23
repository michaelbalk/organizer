import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Account, CalendarEvent, CalendarResult, Task, Workspace } from '@shared/types'

interface Props {
  accounts: Account[]
  workspaceById: Map<string, Workspace>
  tasks: Task[]
  onEditTask: (task: Task) => void
  onChanged: () => Promise<void>
  onGoToSettings: () => void
}

const DAYS_AHEAD = 7

type Entry =
  | { kind: 'event'; sortM: number; ev: CalendarEvent }
  | { kind: 'task'; sortM: number; task: Task }

/**
 * Combined calendar: Google events (read-only) overlaid with scheduled tasks
 * (due date/time + expected duration), color-coded by workspace. Defaults to a
 * focused "today + next 7 days" agenda rather than a wall-of-month grid.
 */
export function Calendar({
  accounts,
  workspaceById,
  tasks,
  onEditTask,
  onChanged,
  onGoToSettings
}: Props): JSX.Element {
  const [result, setResult] = useState<CalendarResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)

  const connected = accounts.filter((a) => a.provider === 'google' && a.connected)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setResult(await window.api.listCalendar(DAYS_AHEAD))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(t)
  }, [toast])

  const colorOf = useCallback(
    (workspaceId: string) => workspaceById.get(workspaceId)?.color ?? '#64748b',
    [workspaceById]
  )

  // Group events + scheduled tasks into the next 8 days.
  const days = useMemo(() => {
    const events = result?.events ?? []
    const byDay = new Map<string, Entry[]>()
    const push = (key: string, entry: Entry): void => {
      const list = byDay.get(key) ?? []
      list.push(entry)
      byDay.set(key, list)
    }

    for (const ev of events) {
      const d = new Date(ev.start)
      push(dateKey(d), {
        kind: 'event',
        ev,
        sortM: ev.allDay ? -1 : d.getHours() * 60 + d.getMinutes()
      })
    }
    for (const task of tasks) {
      if (!task.dueDate || task.status === 'done') continue
      const sortM = task.dueTime ? toMinutes(task.dueTime) : -1
      push(task.dueDate, { kind: 'task', task, sortM })
    }

    const today = new Date()
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const out: { key: string; offset: number; entries: Entry[] }[] = []
    for (let offset = 0; offset <= DAYS_AHEAD; offset++) {
      const d = new Date(start)
      d.setDate(d.getDate() + offset)
      const key = dateKey(d)
      const entries = (byDay.get(key) ?? []).sort((a, b) => a.sortM - b.sortM)
      if (offset === 0 || entries.length > 0) out.push({ key, offset, entries })
    }
    return out
  }, [result, tasks])

  const eventToTask = useCallback(
    async (ev: CalendarEvent) => {
      const start = new Date(ev.start)
      const end = new Date(ev.end)
      const estimate = ev.allDay
        ? null
        : Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000)) || null
      await window.api.createTask({
        title: ev.title,
        notes: ev.location ? `Location: ${ev.location}` : '',
        workspaceId: ev.workspaceId,
        status: 'todo',
        priority: 'medium',
        dueDate: dateKey(start),
        dueTime: ev.allDay ? null : hhmm(start),
        estimateMinutes: estimate,
        source: { kind: 'event', accountId: ev.accountId, externalId: ev.id, label: ev.title }
      })
      await onChanged()
      setToast('Added to your tasks ✓')
    },
    [onChanged]
  )

  if (loading && !result) {
    return (
      <div className="app-loading" style={{ height: 'auto', paddingTop: 60 }}>
        <div className="spinner" />
        <span>Gathering your schedule…</span>
      </div>
    )
  }

  return (
    <div className="calendar">
      {result?.errors.map((err) => (
        <div key={err.accountId} className="banner banner-warn">
          <strong>{err.accountEmail}:</strong> {err.message}
          {err.needsReconnect && (
            <button className="link-btn" onClick={onGoToSettings}>
              Reconnect
            </button>
          )}
        </div>
      ))}

      <div className="cal-head">
        <div>
          <div className="cal-title">Next 7 days</div>
          <div className="muted">
            {connected.length === 0
              ? 'Showing scheduled tasks · connect a Google account to overlay your calendar'
              : `Google events + scheduled tasks · across ${connected.length} account${connected.length === 1 ? '' : 's'}`}
          </div>
        </div>
        <button className="btn btn-ghost" onClick={load} disabled={loading}>
          {loading ? 'Refreshing…' : '↻ Refresh'}
        </button>
      </div>

      <div className="cal-days">
        {days.map(({ key, offset, entries }) => (
          <div key={key} className="cal-day">
            <div className="cal-day-head">
              <span className="cal-day-label">{dayLabel(key, offset)}</span>
              <span className="muted">{entries.length || ''}</span>
            </div>

            {entries.length === 0 ? (
              <div className="cal-empty">Nothing scheduled</div>
            ) : (
              <ul className="cal-list">
                {entries.map((entry) =>
                  entry.kind === 'event' ? (
                    <li
                      key={`e-${entry.ev.accountId}-${entry.ev.id}`}
                      className="cal-item"
                      style={{ borderLeftColor: colorOf(entry.ev.workspaceId) }}
                    >
                      <div className="cal-time">
                        {entry.ev.allDay ? 'All day' : `${fmtTime(entry.ev.start)}`}
                      </div>
                      <div className="cal-main">
                        <div className="cal-item-title">{entry.ev.title}</div>
                        <div className="cal-item-sub muted">
                          {entry.ev.calendarName}
                          {entry.ev.location ? ` · ${entry.ev.location}` : ''}
                        </div>
                      </div>
                      <div className="cal-actions">
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => entry.kind === 'event' && eventToTask(entry.ev)}
                          title="Create a task from this event"
                        >
                          + Task
                        </button>
                        {entry.ev.htmlLink && (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => window.open(entry.ev.htmlLink, '_blank')}
                            title="Open in Google Calendar"
                          >
                            Open
                          </button>
                        )}
                      </div>
                    </li>
                  ) : (
                    <li
                      key={`t-${entry.task.id}`}
                      className="cal-item cal-item-task"
                      style={{ borderLeftColor: colorOf(entry.task.workspaceId) }}
                      onClick={() => onEditTask(entry.task)}
                    >
                      <div className="cal-time">
                        {entry.task.dueTime ? fmtTime(`${entry.task.dueDate}T${entry.task.dueTime}`) : 'Due'}
                      </div>
                      <div className="cal-main">
                        <div className="cal-item-title">
                          <span className="cal-task-badge">TASK</span> {entry.task.title}
                        </div>
                        {entry.task.estimateMinutes != null && (
                          <div className="cal-item-sub muted">⏱ {fmtDuration(entry.task.estimateMinutes)} planned</div>
                        )}
                      </div>
                    </li>
                  )
                )}
              </ul>
            )}
          </div>
        ))}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function dateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}
function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}
function fmtDuration(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h && m) return `${h}h ${m}m`
  if (h) return `${h}h`
  return `${m}m`
}
function dayLabel(key: string, offset: number): string {
  if (offset === 0) return 'Today'
  if (offset === 1) return 'Tomorrow'
  return new Date(`${key}T00:00`).toLocaleDateString([], {
    weekday: 'long',
    month: 'short',
    day: 'numeric'
  })
}
