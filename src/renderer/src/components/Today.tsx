import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CalendarEvent, CalendarResult, Task, Workspace } from '@shared/types'
import { isTaskOverdue } from '@shared/tasks'

interface Props {
  tasks: Task[]
  workspaceById: Map<string, Workspace>
  onEditTask: (task: Task) => void
  onChanged: () => Promise<void>
  onGoToCalendar: () => void
}

/**
 * Anti-overwhelm home screen: one focus suggestion, today's due/overdue tasks,
 * and today's meetings — so the day starts with "do this next", not a wall.
 */
export function Today({ tasks, workspaceById, onEditTask, onChanged, onGoToCalendar }: Props): JSX.Element {
  const [events, setEvents] = useState<CalendarEvent[]>([])

  useEffect(() => {
    let alive = true
    window.api
      .listCalendar(0)
      .then((r: CalendarResult) => alive && setEvents(r.events))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  const todayKey = useMemo(() => dateKey(new Date()), [])
  const colorOf = (wid: string): string => workspaceById.get(wid)?.color ?? '#64748b'

  // Not-done tasks due today or earlier (overdue), soonest first.
  const dueTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.status !== 'done' && t.dueDate && t.dueDate <= todayKey)
        .sort((a, b) => {
          if (a.dueDate !== b.dueDate) return (a.dueDate ?? '').localeCompare(b.dueDate ?? '')
          return (a.dueTime ?? '99:99').localeCompare(b.dueTime ?? '99:99')
        }),
    [tasks, todayKey]
  )

  const todayEvents = useMemo(
    () =>
      events
        .filter((e) => dateKey(new Date(e.start)) === todayKey)
        .sort((a, b) => a.start.localeCompare(b.start)),
    [events, todayKey]
  )

  const running = tasks.find((t) => t.timerStartedAt) ?? null

  const startTimer = useCallback(
    async (t: Task) => {
      await window.api.startTaskTimer(t.id)
      await onChanged()
    },
    [onChanged]
  )
  const stopTimer = useCallback(
    async (t: Task) => {
      await window.api.stopTaskTimer(t.id)
      await onChanged()
    },
    [onChanged]
  )
  const complete = useCallback(
    async (t: Task) => {
      await window.api.updateTask(t.id, { status: 'done' })
      await onChanged()
    },
    [onChanged]
  )

  const focus = running ?? dueTasks[0] ?? null
  const nextMeeting = todayEvents.find((e) => !e.allDay && new Date(e.end).getTime() > Date.now())

  return (
    <div className="today">
      <div className="today-head">
        <div className="today-greeting">{greeting()}</div>
        <div className="muted">{longDate()}</div>
      </div>

      {/* Focus now */}
      <div className="today-focus">
        <div className="today-focus-label">{running ? '⏱ In progress' : '🎯 Focus next'}</div>
        {focus ? (
          <div className="today-focus-body">
            <span className="ws-stripe" style={{ background: colorOf(focus.workspaceId) }} />
            <div className="today-focus-main" onClick={() => onEditTask(focus)}>
              <div className="today-focus-title">{focus.title}</div>
              <div className="muted">{taskMeta(focus)}</div>
            </div>
            <div className="today-focus-actions">
              {running ? (
                <button className="btn btn-ghost" onClick={() => stopTimer(focus)}>
                  ⏹ Stop
                </button>
              ) : (
                <button className="btn btn-primary" onClick={() => startTimer(focus)}>
                  ▶ Start
                </button>
              )}
              <button className="btn btn-ghost" onClick={() => complete(focus)}>
                ✓ Done
              </button>
            </div>
          </div>
        ) : nextMeeting ? (
          <div className="today-focus-body">
            <span className="ws-stripe" style={{ background: colorOf(nextMeeting.workspaceId) }} />
            <div className="today-focus-main">
              <div className="today-focus-title">{nextMeeting.title}</div>
              <div className="muted">Next meeting · {fmtTime(nextMeeting.start)}</div>
            </div>
          </div>
        ) : (
          <div className="today-clear">🎉 Nothing due and no meetings — you&apos;re clear.</div>
        )}
      </div>

      <div className="today-cols">
        {/* Due today / overdue */}
        <div className="today-col">
          <div className="today-col-head">
            Due today &amp; overdue <span className="muted">{dueTasks.length || ''}</span>
          </div>
          {dueTasks.length === 0 ? (
            <div className="today-empty">Nothing due. 👌</div>
          ) : (
            <ul className="today-list">
              {dueTasks.map((t) => {
                const overdue = isTaskOverdue(t)
                return (
                  <li key={t.id} className="today-item" style={{ borderLeftColor: colorOf(t.workspaceId) }}>
                    <button
                      className="check"
                      title="Complete"
                      onClick={() => complete(t)}
                    >
                      ✓
                    </button>
                    <div className="today-item-main" onClick={() => onEditTask(t)}>
                      <div className="today-item-title">{t.title}</div>
                      <div className="muted">
                        {overdue && <span className="overdue-tag">overdue · </span>}
                        {taskMeta(t)}
                      </div>
                    </div>
                    {!t.timerStartedAt && (
                      <button className="btn btn-ghost btn-sm" onClick={() => startTimer(t)}>
                        ▶
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Today's meetings */}
        <div className="today-col">
          <div className="today-col-head">
            Today&apos;s meetings <span className="muted">{todayEvents.length || ''}</span>
            <button className="link-btn" onClick={onGoToCalendar}>
              Calendar
            </button>
          </div>
          {todayEvents.length === 0 ? (
            <div className="today-empty">No meetings today.</div>
          ) : (
            <ul className="today-list">
              {todayEvents.map((e) => (
                <li
                  key={`${e.accountId}-${e.id}`}
                  className="today-item"
                  style={{ borderLeftColor: colorOf(e.workspaceId) }}
                >
                  <div className="today-item-time">{e.allDay ? 'All day' : fmtTime(e.start)}</div>
                  <div className="today-item-main">
                    <div className="today-item-title">{e.title}</div>
                    {e.location && <div className="muted">{e.location}</div>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function taskMeta(t: Task): string {
  const bits: string[] = []
  if (t.dueDate && t.dueTime) bits.push(fmtTime(`${t.dueDate}T${t.dueTime}`))
  if (t.estimateMinutes != null) bits.push(`~${fmtDur(t.estimateMinutes)}`)
  if (t.subtasks.length) bits.push(`${t.subtasks.filter((s) => s.done).length}/${t.subtasks.length} steps`)
  return bits.join(' · ') || 'No time set'
}
function fmtDur(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h && m) return `${h}h ${m}m`
  if (h) return `${h}h`
  return `${m}m`
}
function dateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}
function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}
function longDate(): string {
  return new Date().toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  })
}
