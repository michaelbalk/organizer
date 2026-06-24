import { useCallback, useEffect, useMemo, useState } from 'react'
import { WORKSPACE_KINDS, type AppData, type Task, type WorkspaceKind, type Workspace } from '@shared/types'
import { Sidebar } from './components/Sidebar'
import { Board } from './components/Board'
import { TaskModal } from './components/TaskModal'
import { WorkspaceModal } from './components/WorkspaceModal'
import { Accounts } from './components/Accounts'
import { Inbox } from './components/Inbox'
import { Calendar } from './components/Calendar'
import { Today } from './components/Today'
import { Folders } from './components/Folders'

export type View = 'today' | 'board' | 'email' | 'folders' | 'calendar' | 'settings'

/** Sidebar selection: all tasks, a kind group, or a single workspace. */
export type Selection =
  | { type: 'all' }
  | { type: 'kind'; kind: WorkspaceKind }
  | { type: 'workspace'; workspaceId: string }

const EMPTY: AppData = {
  version: 1,
  workspaces: [],
  accounts: [],
  tasks: [],
  dismissedEmails: [],
  folders: []
}

export default function App(): JSX.Element {
  const [data, setData] = useState<AppData>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('today')
  const [selection, setSelection] = useState<Selection>({ type: 'all' })
  const [search, setSearch] = useState('')

  const [taskModal, setTaskModal] = useState<{ open: boolean; task: Task | null }>({
    open: false,
    task: null
  })
  const [wsModalOpen, setWsModalOpen] = useState(false)
  // A pending request to open a specific folder's emails in the Inbox.
  const [inboxFolder, setInboxFolder] = useState<string | null>(null)

  const openFolderEmails = useCallback((name: string) => {
    setInboxFolder(name)
    setView('email')
  }, [])
  const clearInboxFolder = useCallback(() => setInboxFolder(null), [])

  const refresh = useCallback(async () => {
    const next = await window.api.getData()
    setData(next)
  }, [])

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [refresh])

  const workspaceById = useMemo(() => {
    const map = new Map<string, Workspace>()
    data.workspaces.forEach((w) => map.set(w.id, w))
    return map
  }, [data.workspaces])

  /** Tasks visible under the current sidebar selection + search query. */
  const visibleTasks = useMemo(() => {
    const q = search.trim().toLowerCase()
    return data.tasks.filter((t) => {
      const ws = workspaceById.get(t.workspaceId)
      if (selection.type === 'workspace' && t.workspaceId !== selection.workspaceId) return false
      if (selection.type === 'kind' && ws?.kind !== selection.kind) return false
      if (q) {
        const hay = `${t.title} ${t.notes} ${t.tags.join(' ')}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [data.tasks, selection, search, workspaceById])

  const headingTitle = useMemo(() => {
    if (view === 'today') return 'Today'
    if (view === 'email') return 'Inbox'
    if (view === 'folders') return 'Folders'
    if (view === 'calendar') return 'Calendar'
    if (view === 'settings') return 'Settings'
    if (selection.type === 'all') return 'All Tasks'
    if (selection.type === 'kind')
      return WORKSPACE_KINDS.find((k) => k.id === selection.kind)?.label ?? 'Tasks'
    return workspaceById.get(selection.workspaceId)?.name ?? 'Tasks'
  }, [view, selection, workspaceById])

  const openNewTask = useCallback(() => {
    setTaskModal({ open: true, task: null })
  }, [])

  if (loading) {
    return (
      <div className="app-loading">
        <div className="spinner" />
        <span>Loading your workspace…</span>
      </div>
    )
  }

  return (
    <div className="app">
      <Sidebar
        workspaces={data.workspaces}
        tasks={data.tasks}
        selection={selection}
        onSelect={setSelection}
        view={view}
        onViewChange={setView}
        onAddWorkspace={() => setWsModalOpen(true)}
      />

      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            <h1>{headingTitle}</h1>
            <span className="topbar-sub">
              {view === 'today'
                ? 'Your focus for the day'
                : view === 'board'
                  ? `${visibleTasks.length} task${visibleTasks.length === 1 ? '' : 's'}`
                  : view === 'email'
                    ? 'Unified inbox'
                    : view === 'folders'
                      ? 'Create, organize & annotate your folders'
                      : view === 'calendar'
                        ? 'Combined calendar'
                        : 'Accounts & settings'}
            </span>
          </div>

          <div className="topbar-actions">
            {view === 'board' && (
              <input
                className="search"
                placeholder="Search tasks…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            )}
            {view === 'board' && (
              <button className="btn btn-primary" onClick={openNewTask}>
                + New Task
              </button>
            )}
          </div>
        </header>

        <section className="content">
          {view === 'today' && (
            <Today
              tasks={data.tasks}
              workspaceById={workspaceById}
              onEditTask={(task) => setTaskModal({ open: true, task })}
              onChanged={refresh}
              onGoToCalendar={() => setView('calendar')}
            />
          )}
          {view === 'board' && (
            <Board
              tasks={visibleTasks}
              workspaceById={workspaceById}
              showWorkspaceChip={selection.type !== 'workspace'}
              onEdit={(task) => setTaskModal({ open: true, task })}
              onChanged={refresh}
            />
          )}
          {view === 'email' && (
            <Inbox
              accounts={data.accounts}
              workspaces={data.workspaces}
              workspaceById={workspaceById}
              tasks={data.tasks}
              dismissedEmails={data.dismissedEmails}
              folderMeta={data.folders}
              requestedFolder={inboxFolder}
              onFolderOpened={clearInboxFolder}
              onManageFolders={() => setView('folders')}
              onChanged={refresh}
              onGoToSettings={() => setView('settings')}
            />
          )}
          {view === 'folders' && (
            <Folders
              folderMeta={data.folders}
              accounts={data.accounts}
              onChanged={refresh}
              onOpenFolder={openFolderEmails}
            />
          )}
          {view === 'calendar' && (
            <Calendar
              accounts={data.accounts}
              workspaceById={workspaceById}
              tasks={data.tasks}
              onEditTask={(task) => setTaskModal({ open: true, task })}
              onChanged={refresh}
              onGoToSettings={() => setView('settings')}
            />
          )}
          {view === 'settings' && (
            <Accounts
              accounts={data.accounts}
              workspaces={data.workspaces}
              onChanged={refresh}
            />
          )}
        </section>
      </main>

      {taskModal.open && (
        <TaskModal
          task={taskModal.task}
          workspaces={data.workspaces}
          defaultWorkspaceId={
            selection.type === 'workspace' ? selection.workspaceId : data.workspaces[0]?.id
          }
          onClose={() => setTaskModal({ open: false, task: null })}
          onSaved={async () => {
            setTaskModal({ open: false, task: null })
            await refresh()
          }}
        />
      )}

      {wsModalOpen && (
        <WorkspaceModal
          onClose={() => setWsModalOpen(false)}
          onSaved={async () => {
            setWsModalOpen(false)
            await refresh()
          }}
        />
      )}
    </div>
  )
}
