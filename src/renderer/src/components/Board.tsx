import { useState } from 'react'
import {
  TASK_STATUSES,
  TASK_PRIORITIES,
  kindIcon,
  type Task,
  type TaskStatus,
  type Workspace
} from '@shared/types'

interface Props {
  tasks: Task[]
  workspaceById: Map<string, Workspace>
  showWorkspaceChip: boolean
  onEdit: (task: Task) => void
  onChanged: () => Promise<void> | void
}

export function Board({
  tasks,
  workspaceById,
  showWorkspaceChip,
  onEdit,
  onChanged
}: Props): JSX.Element {
  const [dragId, setDragId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<TaskStatus | null>(null)

  const columns: Record<TaskStatus, Task[]> = {
    backlog: [],
    todo: [],
    in_progress: [],
    done: []
  }
  for (const t of tasks) columns[t.status].push(t)
  for (const key of Object.keys(columns) as TaskStatus[]) {
    columns[key].sort((a, b) => a.order - b.order)
  }

  async function handleDrop(status: TaskStatus): Promise<void> {
    setOverCol(null)
    if (!dragId) return
    const id = dragId
    setDragId(null)
    await window.api.reorderTask(id, status, columns[status].length)
    await onChanged()
  }

  return (
    <div className="board">
      {TASK_STATUSES.map(({ id, label }) => (
        <div
          key={id}
          className={`column ${overCol === id ? 'drag-over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setOverCol(id)
          }}
          onDragLeave={() => setOverCol((c) => (c === id ? null : c))}
          onDrop={() => handleDrop(id)}
        >
          <div className="column-head">
            <span className="column-title">{label}</span>
            <span className="column-count">{columns[id].length}</span>
          </div>

          <div className="column-body">
            {columns[id].map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                workspace={workspaceById.get(task.workspaceId)}
                showWorkspaceChip={showWorkspaceChip}
                onDragStart={() => setDragId(task.id)}
                onEdit={() => onEdit(task)}
                onToggleDone={async () => {
                  await window.api.updateTask(task.id, {
                    status: task.status === 'done' ? 'todo' : 'done'
                  })
                  await onChanged()
                }}
              />
            ))}
            {columns[id].length === 0 && <div className="column-empty">Drop here</div>}
          </div>
        </div>
      ))}
    </div>
  )
}

function TaskCard({
  task,
  workspace,
  showWorkspaceChip,
  onDragStart,
  onEdit,
  onToggleDone
}: {
  task: Task
  workspace?: Workspace
  showWorkspaceChip: boolean
  onDragStart: () => void
  onEdit: () => void
  onToggleDone: () => void
}): JSX.Element {
  const priority = TASK_PRIORITIES.find((p) => p.id === task.priority)!
  const overdue = isOverdue(task)
  const duration = durationChip(task)

  return (
    <div
      className="card"
      draggable
      onDragStart={onDragStart}
      onClick={onEdit}
      style={{ borderLeftColor: workspace?.color ?? '#475569' }}
    >
      <div className="card-top">
        <span className="prio" style={{ background: priority.color }}>
          {priority.label}
        </span>
        <button
          className={`check ${task.status === 'done' ? 'checked' : ''}`}
          title="Toggle done"
          onClick={(e) => {
            e.stopPropagation()
            onToggleDone()
          }}
        >
          ✓
        </button>
      </div>

      <div className={`card-title ${task.status === 'done' ? 'done' : ''}`}>{task.title}</div>

      {task.notes && <div className="card-notes">{task.notes}</div>}

      <div className="card-meta">
        {showWorkspaceChip && workspace && (
          <span className="chip" style={{ background: `${workspace.color}22`, color: workspace.color }}>
            {kindIcon(workspace.kind)} {workspace.name}
          </span>
        )}
        {task.dueDate && (
          <span className={`chip due ${overdue ? 'overdue' : ''}`}>
            📆 {task.dueDate}
            {task.dueTime ? ` ${task.dueTime}` : ''}
          </span>
        )}
        {duration && <span className="chip">{duration}</span>}
        {task.tags.map((tag) => (
          <span key={tag} className="chip tag">
            #{tag}
          </span>
        ))}
        {task.source &&
          (task.source.url ? (
            <button
              className="chip src chip-btn"
              title={`Open source: ${task.source.label}`}
              onClick={(e) => {
                e.stopPropagation()
                window.open(task.source!.url, '_blank')
              }}
            >
              {task.source.kind === 'email' ? '✉️' : '📅'} open
            </button>
          ) : (
            <span className="chip src" title={task.source.label}>
              {task.source.kind === 'email' ? '✉️' : '📅'}
            </span>
          ))}
      </div>
    </div>
  )
}

/** A task is overdue once its due moment passes (end-of-day when no time set). */
function isOverdue(task: Task): boolean {
  if (!task.dueDate || task.status === 'done') return false
  const due = new Date(`${task.dueDate}T${task.dueTime || '23:59'}`)
  return due.getTime() < Date.now()
}

/** Compact estimate/actual chip, e.g. "⏱ 30m → 45m". */
function durationChip(task: Task): string | null {
  const e = task.estimateMinutes
  const a = task.actualMinutes
  if (e == null && a == null) return null
  if (e != null && a != null) return `⏱ ${fmtMinutes(e)} → ${fmtMinutes(a)}`
  if (e != null) return `⏱ ${fmtMinutes(e)} est`
  return `⏱ ${fmtMinutes(a as number)} actual`
}

function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h && m) return `${h}h ${m}m`
  if (h) return `${h}h`
  return `${m}m`
}
