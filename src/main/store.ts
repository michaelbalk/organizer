import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type {
  Account,
  AppData,
  FolderMeta,
  NewAccountInput,
  NewTaskInput,
  NewWorkspaceInput,
  Task,
  TaskPatch,
  Workspace
} from '@shared/types'

const DATA_VERSION = 1

/**
 * Tiny file-backed store. Synchronous reads/writes are fine for a single-user
 * desktop app with modest data volumes; we can swap in SQLite later behind the
 * same method surface without touching the IPC layer or renderer.
 */
class Store {
  private filePath: string
  private data: AppData

  constructor() {
    const dir = join(app.getPath('userData'), 'data')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.filePath = join(dir, 'organizer.json')
    this.data = this.load()
  }

  private load(): AppData {
    if (existsSync(this.filePath)) {
      try {
        const parsed = JSON.parse(readFileSync(this.filePath, 'utf-8')) as AppData
        return this.migrate(parsed)
      } catch (err) {
        // Corrupt file: back it up and start fresh rather than crashing.
        try {
          renameSync(this.filePath, `${this.filePath}.corrupt-${Date.now()}`)
        } catch {
          /* ignore */
        }
        console.error('Failed to parse data file, starting fresh:', err)
      }
    }
    return this.seed()
  }

  private migrate(data: AppData): AppData {
    // Placeholder for future schema migrations.
    if (!data.version) data.version = DATA_VERSION
    data.workspaces ??= []
    data.accounts ??= []
    data.tasks ??= []
    // Backfill scheduling fields added after first release.
    data.tasks = data.tasks.map((t) => ({
      ...t,
      dueTime: t.dueTime ?? null,
      estimateMinutes: t.estimateMinutes ?? null,
      actualMinutes: t.actualMinutes ?? null
    }))
    data.dismissedEmails ??= []
    data.folders ??= []
    return data
  }

  /** First-run defaults: one Personal workspace and one example business. */
  private seed(): AppData {
    const now = new Date().toISOString()
    const personal: Workspace = {
      id: randomUUID(),
      name: 'Personal',
      kind: 'personal',
      color: '#2563eb',
      createdAt: now
    }
    const seeded: AppData = {
      version: DATA_VERSION,
      workspaces: [personal],
      accounts: [],
      tasks: [],
      dismissedEmails: [],
      folders: []
    }
    this.data = seeded
    this.persist()
    return seeded
  }

  private persist(): void {
    // Write to a temp file then rename for atomicity.
    const tmp = `${this.filePath}.tmp`
    writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf-8')
    renameSync(tmp, this.filePath)
  }

  getData(): AppData {
    return this.data
  }

  // --- Workspaces ---------------------------------------------------------

  createWorkspace(input: NewWorkspaceInput): Workspace {
    const ws: Workspace = {
      id: randomUUID(),
      name: input.name.trim() || 'Untitled',
      kind: input.kind,
      color: input.color ?? pickColor(this.data.workspaces.length),
      createdAt: new Date().toISOString()
    }
    this.data.workspaces.push(ws)
    this.persist()
    return ws
  }

  updateWorkspace(id: string, patch: Partial<Workspace>): Workspace | null {
    const ws = this.data.workspaces.find((w) => w.id === id)
    if (!ws) return null
    Object.assign(ws, patch, { id: ws.id, createdAt: ws.createdAt })
    this.persist()
    return ws
  }

  deleteWorkspace(id: string): boolean {
    const before = this.data.workspaces.length
    this.data.workspaces = this.data.workspaces.filter((w) => w.id !== id)
    // Tasks in a deleted workspace are removed too.
    this.data.tasks = this.data.tasks.filter((t) => t.workspaceId !== id)
    const changed = this.data.workspaces.length !== before
    if (changed) this.persist()
    return changed
  }

  // --- Accounts -----------------------------------------------------------

  addAccount(input: NewAccountInput): Account {
    const account: Account = {
      id: randomUUID(),
      provider: input.provider,
      email: input.email,
      displayName: input.displayName,
      workspaceId: input.workspaceId,
      connected: input.connected ?? false,
      createdAt: new Date().toISOString()
    }
    this.data.accounts.push(account)
    this.persist()
    return account
  }

  updateAccount(id: string, patch: Partial<Account>): Account | null {
    const account = this.data.accounts.find((a) => a.id === id)
    if (!account) return null
    Object.assign(account, patch, { id: account.id, createdAt: account.createdAt })
    this.persist()
    return account
  }

  removeAccount(id: string): boolean {
    const before = this.data.accounts.length
    this.data.accounts = this.data.accounts.filter((a) => a.id !== id)
    const changed = this.data.accounts.length !== before
    if (changed) this.persist()
    return changed
  }

  // --- Inbox triage (local dismissed state) -------------------------------

  dismissEmail(emailId: string): void {
    if (!this.data.dismissedEmails.includes(emailId)) {
      this.data.dismissedEmails.push(emailId)
      this.persist()
    }
  }

  undismissEmail(emailId: string): void {
    const before = this.data.dismissedEmails.length
    this.data.dismissedEmails = this.data.dismissedEmails.filter((id) => id !== emailId)
    if (this.data.dismissedEmails.length !== before) this.persist()
  }

  /** Drop dismissed ids that are no longer in the live inbox, keeping the set small. */
  pruneDismissedEmails(liveIds: string[]): void {
    const live = new Set(liveIds)
    const kept = this.data.dismissedEmails.filter((id) => live.has(id))
    if (kept.length !== this.data.dismissedEmails.length) {
      this.data.dismissedEmails = kept
      this.persist()
    }
  }

  // --- Folder metadata (color/note for Gmail labels, keyed by name) -------

  upsertFolderMeta(name: string, patch: Partial<Pick<FolderMeta, 'color' | 'note'>>): FolderMeta {
    let meta = this.data.folders.find((f) => f.name === name)
    if (!meta) {
      meta = {
        name,
        color: patch.color ?? pickColor(this.data.folders.length),
        note: patch.note ?? ''
      }
      this.data.folders.push(meta)
    } else {
      if (patch.color !== undefined) meta.color = patch.color
      if (patch.note !== undefined) meta.note = patch.note
    }
    this.persist()
    return meta
  }

  renameFolderMeta(oldName: string, newName: string): void {
    const meta = this.data.folders.find((f) => f.name === oldName)
    if (meta) {
      meta.name = newName
      this.persist()
    }
  }

  deleteFolderMeta(name: string): void {
    const before = this.data.folders.length
    this.data.folders = this.data.folders.filter((f) => f.name !== name)
    if (this.data.folders.length !== before) this.persist()
  }

  // --- Tasks --------------------------------------------------------------

  createTask(input: NewTaskInput): Task {
    const now = new Date().toISOString()
    const status = input.status ?? 'todo'
    const task: Task = {
      id: randomUUID(),
      title: input.title.trim() || 'Untitled task',
      notes: input.notes ?? '',
      status,
      priority: input.priority ?? 'medium',
      workspaceId: input.workspaceId ?? this.data.workspaces[0]?.id ?? '',
      dueDate: input.dueDate ?? null,
      dueTime: input.dueTime ?? null,
      estimateMinutes: input.estimateMinutes ?? null,
      actualMinutes: input.actualMinutes ?? null,
      tags: input.tags ?? [],
      source: input.source ?? null,
      order: this.nextOrder(status),
      createdAt: now,
      updatedAt: now,
      completedAt: status === 'done' ? now : null
    }
    this.data.tasks.push(task)
    this.persist()
    return task
  }

  updateTask(id: string, patch: TaskPatch): Task | null {
    const task = this.data.tasks.find((t) => t.id === id)
    if (!task) return null
    const wasDone = task.status === 'done'
    Object.assign(task, patch)
    task.updatedAt = new Date().toISOString()
    if (patch.status) {
      const isDone = patch.status === 'done'
      if (isDone && !wasDone) task.completedAt = new Date().toISOString()
      if (!isDone && wasDone) task.completedAt = null
    }
    this.persist()
    return task
  }

  deleteTask(id: string): boolean {
    const before = this.data.tasks.length
    this.data.tasks = this.data.tasks.filter((t) => t.id !== id)
    const changed = this.data.tasks.length !== before
    if (changed) this.persist()
    return changed
  }

  /** Move a task to a status at a given index, renumbering the column. */
  reorderTask(id: string, status: Task['status'], toIndex: number): Task | null {
    const task = this.data.tasks.find((t) => t.id === id)
    if (!task) return null

    const wasDone = task.status === 'done'
    task.status = status
    if (status === 'done' && !wasDone) task.completedAt = new Date().toISOString()
    if (status !== 'done' && wasDone) task.completedAt = null
    task.updatedAt = new Date().toISOString()

    const column = this.data.tasks
      .filter((t) => t.status === status && t.id !== id)
      .sort((a, b) => a.order - b.order)
    column.splice(Math.max(0, Math.min(toIndex, column.length)), 0, task)
    column.forEach((t, i) => (t.order = i))

    this.persist()
    return task
  }

  private nextOrder(status: Task['status']): number {
    const inColumn = this.data.tasks.filter((t) => t.status === status)
    return inColumn.length ? Math.max(...inColumn.map((t) => t.order)) + 1 : 0
  }
}

const PALETTE = [
  '#2563eb',
  '#16a34a',
  '#d97706',
  '#9333ea',
  '#dc2626',
  '#0891b2',
  '#db2777',
  '#65a30d'
]
function pickColor(index: number): string {
  return PALETTE[index % PALETTE.length]
}

let instance: Store | null = null
export function getStore(): Store {
  if (!instance) instance = new Store()
  return instance
}
