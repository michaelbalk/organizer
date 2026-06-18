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
