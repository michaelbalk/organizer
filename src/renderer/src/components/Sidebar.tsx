import { WORKSPACE_KINDS, type Task, type WorkspaceKind, type Workspace } from '@shared/types'
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
  const openCount = (predicate: (t: Task) => boolean): number =>
    tasks.filter((t) => t.status !== 'done' && predicate(t)).length

  const isWs = (id: string): boolean =>
    selection.type === 'workspace' && selection.workspaceId === id
  const isKind = (kind: WorkspaceKind): boolean =>
    selection.type === 'kind' && selection.kind === kind

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">◧</span>
        <span className="brand-name">Organizer</span>
      </div>

      <nav className="nav-views">
        <button
          className={`nav-view ${view === 'today' ? 'active' : ''}`}
          onClick={() => onViewChange('today')}
        >
          <span>🎯</span> Today
        </button>
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
          className={`nav-view ${view === 'folders' ? 'active' : ''}`}
          onClick={() => onViewChange('folders')}
        >
          <span>🗂️</span> Folders
        </button>
        <button
          className={`nav-view ${view === 'calendar' ? 'active' : ''}`}
          onClick={() => onViewChange('calendar')}
        >
          <span>📅</span> Calendar
        </button>
        <button
          className={`nav-view ${view === 'contacts' ? 'active' : ''}`}
          onClick={() => onViewChange('contacts')}
        >
          <span>👥</span> Contacts
        </button>
        <button
          className={`nav-view ${view === 'briefing' ? 'active' : ''}`}
          onClick={() => onViewChange('briefing')}
        >
          <span>📰</span> Briefing
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

          {WORKSPACE_KINDS.map((k) => {
            const list = workspaces.filter((w) => w.kind === k.id)
            return (
              <div className="nav-group" key={k.id}>
                <button
                  className={`nav-group-head ${isKind(k.id) ? 'active' : ''}`}
                  onClick={() => onSelect({ type: 'kind', kind: k.id })}
                >
                  {k.label}
                </button>
                {list.map((w) => (
                  <WsRow
                    key={w.id}
                    w={w}
                    active={isWs(w.id)}
                    count={openCount((t) => t.workspaceId === w.id)}
                    onClick={() => onSelect({ type: 'workspace', workspaceId: w.id })}
                  />
                ))}
                {list.length === 0 && <p className="nav-empty">None yet.</p>}
              </div>
            )
          })}

          <button className="nav-add" onClick={onAddWorkspace}>
            + Add workspace
          </button>
        </div>
      )}

      <div className="sidebar-footer">
        <span className="muted">Organizer · Local data</span>
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
