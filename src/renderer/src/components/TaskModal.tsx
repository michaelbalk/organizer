import { useState } from 'react'
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type Task,
  type TaskPriority,
  type TaskStatus,
  type Workspace
} from '@shared/types'

interface Props {
  task: Task | null
  workspaces: Workspace[]
  defaultWorkspaceId?: string
  onClose: () => void
  onSaved: () => void
}

export function TaskModal({
  task,
  workspaces,
  defaultWorkspaceId,
  onClose,
  onSaved
}: Props): JSX.Element {
  const editing = !!task
  const [title, setTitle] = useState(task?.title ?? '')
  const [notes, setNotes] = useState(task?.notes ?? '')
  const [workspaceId, setWorkspaceId] = useState(
    task?.workspaceId ?? defaultWorkspaceId ?? workspaces[0]?.id ?? ''
  )
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? 'todo')
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'medium')
  const [dueDate, setDueDate] = useState(task?.dueDate ?? '')
  const [dueTime, setDueTime] = useState(task?.dueTime ?? '')
  const [estimate, setEstimate] = useState(minutesToText(task?.estimateMinutes ?? null))
  const [actual, setActual] = useState(minutesToText(task?.actualMinutes ?? null))
  const [tagsText, setTagsText] = useState((task?.tags ?? []).join(', '))
  const [saving, setSaving] = useState(false)

  async function save(): Promise<void> {
    if (!title.trim()) return
    setSaving(true)
    const tags = tagsText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    const payload = {
      title: title.trim(),
      notes,
      workspaceId,
      status,
      priority,
      dueDate: dueDate || null,
      // A time without a date is meaningless — drop it.
      dueTime: dueDate ? dueTime || null : null,
      estimateMinutes: textToMinutes(estimate),
      actualMinutes: textToMinutes(actual),
      tags
    }
    if (editing && task) {
      await window.api.updateTask(task.id, payload)
    } else {
      await window.api.createTask(payload)
    }
    setSaving(false)
    onSaved()
  }

  async function remove(): Promise<void> {
    if (!task) return
    await window.api.deleteTask(task.id)
    onSaved()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{editing ? 'Edit Task' : 'New Task'}</h2>
          <button className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <label className="field">
            <span>Title</span>
            <input
              autoFocus
              value={title}
              placeholder="What needs doing?"
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save()
              }}
            />
          </label>

          <label className="field">
            <span>Notes</span>
            <textarea
              value={notes}
              rows={3}
              placeholder="Details, links, context…"
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>

          <div className="field-row">
            <label className="field">
              <span>Workspace</span>
              <select value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)}>
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.kind === 'business' ? '🏢' : '👤'} {w.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Priority</span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
              >
                {TASK_PRIORITIES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="field-row">
            <label className="field">
              <span>Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
                {TASK_STATUSES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Due date</span>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>
          </div>

          <div className="field-row">
            <label className="field">
              <span>Due time</span>
              <input
                type="time"
                value={dueTime}
                disabled={!dueDate}
                title={dueDate ? '' : 'Set a due date first'}
                onChange={(e) => setDueTime(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Expected duration</span>
              <input
                value={estimate}
                placeholder="30m, 1h 30m…"
                onChange={(e) => setEstimate(e.target.value)}
              />
            </label>
          </div>

          <div className="field-row">
            <label className="field">
              <span>Actual duration</span>
              <input
                value={actual}
                placeholder="logged after the fact"
                onChange={(e) => setActual(e.target.value)}
              />
            </label>
            <span />
          </div>

          <label className="field">
            <span>Tags (comma-separated)</span>
            <input
              value={tagsText}
              placeholder="invoicing, follow-up"
              onChange={(e) => setTagsText(e.target.value)}
            />
          </label>
        </div>

        <div className="modal-foot">
          {editing ? (
            <button className="btn btn-danger" onClick={remove}>
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="modal-foot-right">
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={!title.trim() || saving} onClick={save}>
              {saving ? 'Saving…' : editing ? 'Save' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Parses "30", "30m", "1h", "1h 30m", "1.5h" into minutes (or null). */
function textToMinutes(s: string): number | null {
  const str = s.trim().toLowerCase()
  if (!str) return null
  if (/^\d+$/.test(str)) return parseInt(str, 10)
  let total = 0
  let matched = false
  const h = str.match(/(\d+(?:\.\d+)?)\s*h/)
  if (h) {
    total += Math.round(parseFloat(h[1]) * 60)
    matched = true
  }
  const m = str.match(/(\d+)\s*m/)
  if (m) {
    total += parseInt(m[1], 10)
    matched = true
  }
  return matched ? total : null
}

/** Formats minutes back into "1h 30m" / "2h" / "45m". */
function minutesToText(min: number | null): string {
  if (min == null) return ''
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h && m) return `${h}h ${m}m`
  if (h) return `${h}h`
  return `${m}m`
}
