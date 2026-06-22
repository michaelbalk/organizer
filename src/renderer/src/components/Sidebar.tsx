import type { Task, Workspace } from '@shared/types'
import type { Selection, View } from '../App'

interface Props {
  workspaces: Workspace[]
  tasks: Task[]
  selection: Selection
  onSelect: (s: Selection) => void
  view: View
  onViewChange: (v: View) => void
  onAddWorkspace: () => void
}

export function Sidebar({
  workspaces,
  tasks,
  selection,
  onSelect,
  view,
  onViewChange,
  onAddWorkspace
}: Props): JSX.Element {
  const personal = workspaces.filter((w) => w.kind === 'personal')
  const business = workspaces.filter((w) => w.kind === 'business')

  const openCount = (predicate: (t: Task) => boolean): number =>
    tasks.filter((t) => t.status !== 'done' && predicate(t)).length

  const isWs = (id: string): boolean =>
    selection.type === 'workspace' && selection.workspaceId === id
  const isKind = (kind: 'personal' | 'business'): boolean =>
    selection.type === 'kind' && selection.kind === kind

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">◧</span>
        <span className="brand-name">Organizer</span>
      </div>

      <nav className="nav-views">
        <button
          className={`nav-view ${view === 'board' ? 'active' : ''}`}
          onClick={() => onViewChange('board')}
        >
          <span>🗂️</span> Tasks
        </button>
        <button
          className={`nav-view ${view === 'email' ? 'active' : ''}`}
          onClick={() => onViewChange('email')}
        >
          <span>✉️</span> Inbox
        </button>
        <button
          className={`nav-view ${view === 'calendar' ? 'active' : ''}`}
          onClick={() => onViewChange('calendar')}
        >
          <span>📅</span> Calendar
        </button>
        <button
          className={`nav-view ${view === 'settings' ? 'active' : ''}`}
          onClick={() => onViewChange('settings')}
        >
          <span>⚙️</span> Settings
        </button>
      </nav>

      {view === 'board' && (
        <div className="nav-filters">
          <button
            className={`nav-item ${selection.type === 'all' ? 'active' : ''}`}
            onClick={() => onSelect({ type: 'all' })}
          >
            <span className="dot" style={{ background: '#94a3b8' }} />
            All Tasks
            <span className="count">{openCount(() => true)}</span>
          </button>

          <div className="nav-group">
            <button
              className={`nav-group-head ${isKind('personal') ? 'active' : ''}`}
              onClick={() => onSelect({ type: 'kind', kind: 'personal' })}
            >
              Personal
            </button>
            {personal.map((w) => (
              <WsRow
                key={w.id}
                w={w}
                active={isWs(w.id)}
                count={openCount((t) => t.workspaceId === w.id)}
                onClick={() => onSelect({ type: 'workspace', workspaceId: w.id })}
              />
            ))}
          </div>

          <div className="nav-group">
            <button
              className={`nav-group-head ${isKind('business') ? 'active' : ''}`}
              onClick={() => onSelect({ type: 'kind', kind: 'business' })}
            >
              Business
            </button>
            {business.map((w) => (
              <WsRow
                key={w.id}
                w={w}
                active={isWs(w.id)}
                count={openCount((t) => t.workspaceId === w.id)}
                onClick={() => onSelect({ type: 'workspace', workspaceId: w.id })}
              />
            ))}
            {business.length === 0 && (
              <p className="nav-empty">No companies yet.</p>
            )}
          </div>

          <button className="nav-add" onClick={onAddWorkspace}>
            + Add workspace
          </button>
        </div>
      )}

      <div className="sidebar-footer">
        <span className="muted">Phase 1 · Local data</span>
      </div>
    </aside>
  )
}

function WsRow({
  w,
  active,
  count,
  onClick
}: {
  w: Workspace
  active: boolean
  count: number
  onClick: () => void
}): JSX.Element {
  return (
    <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}>
      <span className="dot" style={{ background: w.color }} />
      {w.name}
      <span className="count">{count}</span>
    </button>
  )
}
