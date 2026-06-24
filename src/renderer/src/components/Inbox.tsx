import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Account, EmailItem, FolderMeta, InboxResult, Task, Workspace } from '@shared/types'
import { MessageReader } from './MessageReader'
import { Compose } from './Compose'

interface RailFolder {
  type: 'folder'
  name: string
}
interface RailGroup {
  type: 'group'
  name: string
  children: { name: string; leaf: string }[]
}
type RailEntry = RailFolder | RailGroup

interface Props {
  accounts: Account[]
  workspaces: Workspace[]
  workspaceById: Map<string, Workspace>
  tasks: Task[]
  dismissedEmails: string[]
  /** Folder color/note metadata, used to tint the folder chips. */
  folderMeta: FolderMeta[]
  /** When set, open this folder's emails (e.g. clicked from the Folders view). */
  requestedFolder: string | null
  /** Called once the requested folder has been opened, to clear the request. */
  onFolderOpened: () => void
  /** Jump to the Folders view to add/rename/recolor folders. */
  onManageFolders: () => void
  onChanged: () => Promise<void>
  onGoToSettings: () => void
}

/**
 * Unified inbox built for "getting stuff done" with an ADHD-friendly model:
 *  - frictionless one-click capture (email -> task) so nothing is held in the head
 *  - a single-tasking "Focus triage" mode that shows ONE email at a time
 *  - the 2-minute rule surfaced as a first-class action
 *  - visible, shrinking progress + a clear finish line to reward completion
 *  - workspace color-coding to separate personal vs. business at a glance
 */
export function Inbox({
  accounts,
  workspaceById,
  tasks,
  dismissedEmails,
  folderMeta,
  requestedFolder,
  onFolderOpened,
  onManageFolders,
  onChanged,
  onGoToSettings
}: Props): JSX.Element {
  const [result, setResult] = useState<InboxResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const [showHandled, setShowHandled] = useState(false)

  // The email currently open in the in-app reader, if any.
  const [reading, setReading] = useState<EmailItem | null>(null)
  // Whether the "new email" composer is open.
  const [composing, setComposing] = useState(false)

  // Folder view: 'inbox' or a Gmail label name. Plus the available folders.
  const [folder, setFolder] = useState<string>('inbox')
  const [folders, setFolders] = useState<string[]>([])

  // Focus-triage snapshot: a frozen queue we step through one item at a time.
  const [triage, setTriage] = useState<{ queue: EmailItem[]; index: number } | null>(null)

  const connected = accounts.filter((a) => a.provider === 'google' && a.connected)
  const inInbox = folder === 'inbox'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setResult(folder === 'inbox' ? await window.api.listInbox() : await window.api.listFolderMessages(folder))
    } finally {
      setLoading(false)
    }
  }, [folder])

  const loadFolders = useCallback(async () => {
    try {
      setFolders(await window.api.listFolders())
    } catch {
      /* leave folders as-is */
    }
  }, [])

  useEffect(() => {
    if (connected.length > 0) {
      load()
      loadFolders()
    } else setLoading(false)
  }, [connected.length, load, loadFolders])

  const selectFolder = useCallback((f: string) => {
    setFolder(f)
    setReading(null)
  }, [])

  // Honor a folder open requested from elsewhere (e.g. the Folders view).
  useEffect(() => {
    if (requestedFolder) {
      selectFolder(requestedFolder)
      onFolderOpened()
    }
  }, [requestedFolder, selectFolder, onFolderOpened])

  // Folder name -> color, for tinting the browse chips.
  const folderColor = useMemo(() => {
    const map = new Map<string, string>()
    folderMeta.forEach((f) => map.set(f.name, f.color))
    return map
  }, [folderMeta])

  // Group nested labels ("Inbox/ACT", "Inbox/AFP", …) under a collapsible parent
  // so the rail stays readable with dozens of folders.
  const railEntries = useMemo<RailEntry[]>(() => {
    const standalone: RailEntry[] = []
    const groups = new Map<string, RailGroup>()
    for (const name of folders) {
      const slash = name.indexOf('/')
      if (slash === -1) {
        standalone.push({ type: 'folder', name })
      } else {
        const top = name.slice(0, slash)
        let g = groups.get(top)
        if (!g) {
          g = { type: 'group', name: top, children: [] }
          groups.set(top, g)
        }
        g.children.push({ name, leaf: name.slice(slash + 1) })
      }
    }
    groups.forEach((g) => g.children.sort((a, b) => a.leaf.localeCompare(b.leaf)))
    return [...standalone, ...groups.values()].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    )
  }, [folders])

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  // The parent group of the active folder is always shown expanded.
  const activeGroup = !inInbox && folder.includes('/') ? folder.slice(0, folder.indexOf('/')) : null
  const isGroupOpen = (g: string): boolean => expandedGroups.has(g) || g === activeGroup
  const toggleGroup = (g: string): void =>
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      next.has(g) ? next.delete(g) : next.add(g)
      return next
    })

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(t)
  }, [toast])

  // Which emails are already "handled": converted to a task or locally dismissed.
  const taskedEmailIds = useMemo(() => {
    const set = new Set<string>()
    tasks.forEach((t) => {
      if (t.source?.kind === 'email') set.add(t.source.externalId)
    })
    return set
  }, [tasks])
  const dismissedSet = useMemo(() => new Set(dismissedEmails), [dismissedEmails])

  const isHandled = useCallback(
    (e: EmailItem) => taskedEmailIds.has(e.id) || dismissedSet.has(e.id),
    [taskedEmailIds, dismissedSet]
  )

  const emails = result?.emails ?? []
  const pile = useMemo(() => emails.filter((e) => !isHandled(e)), [emails, isHandled])
  const handledCount = emails.length - pile.length
  // In the Inbox we show the un-handled pile; in a folder we show everything.
  const items = inInbox ? pile : emails

  // --- Actions ------------------------------------------------------------

  const capture = useCallback(
    async (e: EmailItem): Promise<void> => {
      await window.api.createTask({
        title: e.subject,
        notes: `From ${e.from} <${e.fromEmail}>\n\n${e.snippet}`,
        workspaceId: e.workspaceId,
        status: 'todo',
        priority: 'medium',
        source: {
          kind: 'email',
          accountId: e.accountId,
          externalId: e.id,
          label: e.subject,
          url: `https://mail.google.com/mail/u/${encodeURIComponent(e.accountEmail)}/#all/${e.threadId}`
        }
      })
      await onChanged()
      setToast('Captured as task ✓')
    },
    [onChanged]
  )

  const clear = useCallback(
    async (e: EmailItem): Promise<void> => {
      await window.api.dismissEmail(e.id)
      await onChanged()
    },
    [onChanged]
  )

  const restore = useCallback(
    async (e: EmailItem): Promise<void> => {
      await window.api.undismissEmail(e.id)
      await onChanged()
    },
    [onChanged]
  )

  // Open the message inside the app (replaces the old browser hand-off).
  const open = useCallback((e: EmailItem): void => {
    setReading(e)
  }, [])

  // --- Focus triage -------------------------------------------------------

  const startTriage = useCallback(() => {
    if (pile.length === 0) return
    setTriage({ queue: pile, index: 0 })
  }, [pile])

  const advance = useCallback(() => {
    setTriage((prev) => (prev ? { ...prev, index: prev.index + 1 } : prev))
  }, [])

  const current = triage && triage.index < triage.queue.length ? triage.queue[triage.index] : null

  // "Do it now": leave rapid triage and open the full message to act on it.
  const triageDoNow = useCallback(() => {
    if (!current) return
    const e = current
    setTriage(null)
    open(e)
  }, [current, open])

  const triageTask = useCallback(async () => {
    if (!current) return
    await capture(current)
    advance()
  }, [current, capture, advance])

  const triageClear = useCallback(async () => {
    if (!current) return
    await window.api.dismissEmail(current.id)
    await onChanged()
    advance()
  }, [current, onChanged, advance])

  // Keyboard shortcuts make triage low-friction to fly through.
  useEffect(() => {
    if (!triage) return
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') return setTriage(null)
      if (!current) return
      if (ev.key === '1') void triageDoNow()
      else if (ev.key === '2') void triageTask()
      else if (ev.key === '3') void triageClear()
      else if (ev.key === '4' || ev.key === 'ArrowRight') advance()
      else return
      ev.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [triage, current, triageDoNow, triageTask, triageClear, advance])

  // --- Render -------------------------------------------------------------

  if (connected.length === 0) {
    return (
      <div className="inbox-empty-state">
        <div className="placeholder-icon">✉️</div>
        <h2>No Gmail accounts connected</h2>
        <p>Connect an account to pull all your mail into one focused place.</p>
        <button className="btn btn-primary" onClick={onGoToSettings}>
          Go to Settings
        </button>
      </div>
    )
  }

  if (loading && !result) {
    return (
      <div className="app-loading" style={{ height: 'auto', paddingTop: 60 }}>
        <div className="spinner" />
        <span>Gathering your inbox…</span>
      </div>
    )
  }

  return (
    <div className="inbox-triple">
      <aside className="folder-rail">
        <div className="folder-rail-head">
          <span>Folders</span>
          <button className="link-btn" onClick={onManageFolders}>
            Manage
          </button>
        </div>
        <div className="folder-rail-list">
          <button
            className={`folder-row ${inInbox ? 'active' : ''}`}
            onClick={() => selectFolder('inbox')}
          >
            <span className="folder-row-icon">📥</span>
            <span className="folder-row-name">Inbox</span>
          </button>
          {railEntries.map((e) =>
            e.type === 'folder' ? (
              <button
                key={e.name}
                className={`folder-row ${folder === e.name ? 'active' : ''}`}
                onClick={() => selectFolder(e.name)}
                title={e.name}
              >
                <span
                  className="folder-dot"
                  style={{ background: folderColor.get(e.name) ?? '#64748b' }}
                />
                <span className="folder-row-name">{e.name}</span>
              </button>
            ) : (
              <div key={e.name} className="folder-group">
                <button className="folder-row folder-group-head" onClick={() => toggleGroup(e.name)}>
                  <span className="folder-caret">{isGroupOpen(e.name) ? '▾' : '▸'}</span>
                  <span className="folder-row-name">{e.name}</span>
                  <span className="folder-group-count">{e.children.length}</span>
                </button>
                {isGroupOpen(e.name) &&
                  e.children.map((c) => (
                    <button
                      key={c.name}
                      className={`folder-row folder-child ${folder === c.name ? 'active' : ''}`}
                      onClick={() => selectFolder(c.name)}
                      title={c.name}
                    >
                      <span
                        className="folder-dot"
                        style={{ background: folderColor.get(c.name) ?? '#64748b' }}
                      />
                      <span className="folder-row-name">{c.leaf}</span>
                    </button>
                  ))}
              </div>
            )
          )}
        </div>
      </aside>

      <div className="inbox-list-col">
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

        <div className="inbox-head">
          <div>
            <div className="inbox-count">
              {inInbox
                ? pile.length === 0
                  ? 'All clear'
                  : `${pile.length} to triage`
                : `${emails.length} in ${folder}`}
            </div>
            <div className="muted inbox-sub">
              {inInbox && handledCount > 0 && `${handledCount} handled · `}
              across {connected.length} account{connected.length === 1 ? '' : 's'}
            </div>
          </div>
          <div className="inbox-actions">
            <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
              {loading ? '…' : '↻'}
            </button>
            {inInbox && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={startTriage}
                disabled={pile.length === 0}
              >
                ⚡ Triage
              </button>
            )}
            <button className="btn btn-primary btn-sm" onClick={() => setComposing(true)}>
              ✏️ Compose
            </button>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="celebrate">
            <div className="celebrate-emoji">{inInbox ? '🎉' : '📂'}</div>
            <h3>{inInbox ? 'Inbox triaged' : 'Empty folder'}</h3>
            <p>{inInbox ? 'Nothing left to process.' : `Nothing filed under ${folder} yet.`}</p>
          </div>
        ) : (
          <ul className="email-list">
            {items.map((e) => (
              <EmailRow
                key={e.id}
                email={e}
                selected={reading?.id === e.id}
                color={workspaceById.get(e.workspaceId)?.color ?? '#64748b'}
                workspaceName={workspaceById.get(e.workspaceId)?.name ?? ''}
                onOpen={() => open(e)}
                onCapture={() => capture(e)}
                onClear={() => clear(e)}
              />
            ))}
          </ul>
        )}

        {inInbox && handledCount > 0 && (
          <div className="handled-section">
            <button className="link-btn" onClick={() => setShowHandled((v) => !v)}>
              {showHandled ? 'Hide' : 'Show'} {handledCount} handled
            </button>
            {showHandled && (
              <ul className="email-list handled">
                {emails
                  .filter((e) => isHandled(e))
                  .map((e) => (
                    <li key={e.id} className="email-row handled-row">
                      <span
                        className="ws-stripe"
                        style={{ background: workspaceById.get(e.workspaceId)?.color ?? '#64748b' }}
                      />
                      <div className="email-main">
                        <div className="email-subject">{e.subject}</div>
                        <div className="email-from muted">{e.from}</div>
                      </div>
                      <span className="pill pill-off">
                        {taskedEmailIds.has(e.id) ? 'Task created' : 'Cleared'}
                      </span>
                      {dismissedSet.has(e.id) && !taskedEmailIds.has(e.id) && (
                        <button className="link-btn" onClick={() => restore(e)}>
                          Undo
                        </button>
                      )}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="inbox-reader-col">
        {reading ? (
          <MessageReader
            key={reading.id}
            email={reading}
            color={workspaceById.get(reading.workspaceId)?.color ?? '#64748b'}
            workspaceName={workspaceById.get(reading.workspaceId)?.name ?? ''}
            onToast={setToast}
            onCapture={capture}
            onServerChanged={load}
            onDeselect={() => setReading(null)}
            onGoToSettings={onGoToSettings}
          />
        ) : (
          <div className="reader-empty">
            <div className="placeholder-icon">📬</div>
            <p>Select an email to read, reply, and organize — all in here.</p>
          </div>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}

      {triage && (
        <TriageOverlay
          email={current}
          index={triage.index}
          total={triage.queue.length}
          color={current ? workspaceById.get(current.workspaceId)?.color ?? '#64748b' : '#64748b'}
          workspaceName={current ? workspaceById.get(current.workspaceId)?.name ?? '' : ''}
          onDoNow={triageDoNow}
          onTask={triageTask}
          onClear={triageClear}
          onSkip={advance}
          onExit={() => setTriage(null)}
        />
      )}

      {composing && (
        <Compose accounts={connected} onClose={() => setComposing(false)} onToast={setToast} />
      )}
    </div>
  )
}

function EmailRow({
  email,
  selected,
  color,
  workspaceName,
  onOpen,
  onCapture,
  onClear
}: {
  email: EmailItem
  selected: boolean
  color: string
  workspaceName: string
  onOpen: () => void
  onCapture: () => void
  onClear: () => void
}): JSX.Element {
  return (
    <li
      className={`email-row compact ${email.unread ? 'unread' : ''} ${selected ? 'selected' : ''}`}
      onClick={onOpen}
    >
      <span className="ws-stripe" style={{ background: color }} title={workspaceName} />
      <div className="email-main">
        <div className="email-line">
          {email.unread && <span className="unread-dot" />}
          <span className="email-from">{email.from}</span>
          <span className="email-time">{formatTime(email.date)}</span>
        </div>
        <div className="email-subject">{email.subject}</div>
        <div className="email-snippet muted">{email.snippet}</div>
      </div>
      <div className="email-row-actions" onClick={(ev) => ev.stopPropagation()}>
        <button className="icon-btn-sm" onClick={onCapture} title="Capture as a task">
          ＋
        </button>
        <button className="icon-btn-sm" onClick={onClear} title="Clear from inbox">
          ✓
        </button>
      </div>
    </li>
  )
}

function TriageOverlay({
  email,
  index,
  total,
  color,
  workspaceName,
  onDoNow,
  onTask,
  onClear,
  onSkip,
  onExit
}: {
  email: EmailItem | null
  index: number
  total: number
  color: string
  workspaceName: string
  onDoNow: () => void
  onTask: () => void
  onClear: () => void
  onSkip: () => void
  onExit: () => void
}): JSX.Element {
  const done = !email
  const pct = total === 0 ? 100 : Math.round((Math.min(index, total) / total) * 100)

  return (
    <div className="modal-backdrop" onClick={onExit}>
      <div className="triage" onClick={(e) => e.stopPropagation()}>
        <div className="triage-top">
          <span className="muted">
            {done ? 'Done' : `${index + 1} of ${total}`}
          </span>
          <button className="icon-btn" onClick={onExit}>
            ✕
          </button>
        </div>
        <div className="triage-progress">
          <div className="triage-progress-fill" style={{ width: `${pct}%` }} />
        </div>

        {done ? (
          <div className="celebrate triage-done">
            <div className="celebrate-emoji">🎉</div>
            <h3>That's the whole pile</h3>
            <p>You processed every email. Nicely done.</p>
            <button className="btn btn-primary" onClick={onExit}>
              Finish
            </button>
          </div>
        ) : (
          <>
            <div className="triage-card">
              <div className="triage-meta">
                <span className="ws-chip" style={{ background: color }}>
                  {workspaceName}
                </span>
                <span className="muted">{email.accountEmail}</span>
              </div>
              <div className="triage-from">{email.from}</div>
              <h2 className="triage-subject">{email.subject}</h2>
              <p className="triage-snippet">{email.snippet}</p>
            </div>

            <p className="triage-hint muted">
              What's the next action? (shortcuts 1–4)
            </p>
            <div className="triage-choices">
              <button className="triage-choice do-now" onClick={onDoNow}>
                <span className="tc-key">1</span>
                <span className="tc-label">⚡ Do it now</span>
                <span className="tc-sub">Open &amp; handle it here</span>
              </button>
              <button className="triage-choice make-task" onClick={onTask}>
                <span className="tc-key">2</span>
                <span className="tc-label">📋 Make a task</span>
                <span className="tc-sub">Defer with a clear next step</span>
              </button>
              <button className="triage-choice clear" onClick={onClear}>
                <span className="tc-key">3</span>
                <span className="tc-label">✓ Clear it</span>
                <span className="tc-sub">No action needed</span>
              </button>
              <button className="triage-choice skip" onClick={onSkip}>
                <span className="tc-key">4</span>
                <span className="tc-label">⏭ Skip</span>
                <span className="tc-sub">Decide later</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const days = (now.getTime() - d.getTime()) / 86_400_000
  if (days < 7) return d.toLocaleDateString([], { weekday: 'short' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}
