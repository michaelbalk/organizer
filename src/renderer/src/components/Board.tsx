import { useState } from 'react'
import {
  TASK_STATUSES,
  TASK_PRIORITIES,
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
  const overdue =
    task.dueDate && task.status !== 'done' && task.dueDate < new Date().toISOString().slice(0, 10)

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
            {workspace.kind === 'business' ? '🏢' : '👤'} {workspace.name}
          </span>
        )}
        {task.dueDate && (
          <span className={`chip due ${overdue ? 'overdue' : ''}`}>📆 {task.dueDate}</span>
        )}
        {task.tags.map((tag) => (
          <span key={tag} className="chip tag">
            #{tag}
          </span>
        ))}
        {task.source && <span className="chip src">{task.source.kind === 'email' ? '✉️' : '📅'}</span>}
      </div>
    </div>
  )
}
