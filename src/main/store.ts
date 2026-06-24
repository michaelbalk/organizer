import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type {
  Account,
  AppData,
  CaptureContactInput,
  CaptureContactResult,
  Contact,
  ContactPatch,
  FolderMeta,
  NewAccountInput,
  NewContactInput,
  NewInteractionInput,
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
      actualMinutes: t.actualMinutes ?? null,
      recurrence: t.recurrence ?? 'none',
      subtasks: t.subtasks ?? [],
      timerStartedAt: t.timerStartedAt ?? null
    }))
    data.dismissedEmails ??= []
    data.folders ??= []
    data.contacts ??= []
    data.contacts = data.contacts.map((c) => ({
      ...c,
      followUpAt: c.followUpAt ?? null,
      briefing: c.briefing ?? null
    }))
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
      folders: [],
      contacts: []
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
      recurrence: input.recurrence ?? 'none',
      subtasks: input.subtasks ?? [],
      timerStartedAt: input.timerStartedAt ?? null,
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
      if (isDone && !wasDone) {
        task.completedAt = new Date().toISOString()
        this.onCompleted(task)
      }
      if (!isDone && wasDone) task.completedAt = null
    }
    this.persist()
    return task
  }

  // --- Time tracking ------------------------------------------------------

  /** Starts a task's timer, banking any other running timer first (one at a time). */
  startTimer(id: string): Task | null {
    const task = this.data.tasks.find((t) => t.id === id)
    if (!task) return null
    this.data.tasks.forEach((t) => {
      if (t.id !== id && t.timerStartedAt) this.stopTaskTimer(t)
    })
    task.timerStartedAt = new Date().toISOString()
    if (task.status === 'backlog' || task.status === 'todo') task.status = 'in_progress'
    task.updatedAt = new Date().toISOString()
    this.persist()
    return task
  }

  /** Stops a task's timer and banks the elapsed minutes into actualMinutes. */
  stopTimer(id: string): Task | null {
    const task = this.data.tasks.find((t) => t.id === id)
    if (!task) return null
    this.stopTaskTimer(task)
    task.updatedAt = new Date().toISOString()
    this.persist()
    return task
  }

  private stopTaskTimer(task: Task): void {
    if (!task.timerStartedAt) return
    const mins = Math.max(0, Math.round((Date.now() - new Date(task.timerStartedAt).getTime()) / 60000))
    task.actualMinutes = (task.actualMinutes ?? 0) + mins
    task.timerStartedAt = null
  }

  /** On completion: stop any running timer and spawn the next recurring occurrence. */
  private onCompleted(task: Task): void {
    this.stopTaskTimer(task)
    if (task.recurrence === 'none') return
    const base = task.dueDate ? new Date(`${task.dueDate}T00:00`) : new Date()
    if (task.recurrence === 'daily') base.setDate(base.getDate() + 1)
    else if (task.recurrence === 'weekly') base.setDate(base.getDate() + 7)
    else if (task.recurrence === 'monthly') base.setMonth(base.getMonth() + 1)
    const now = new Date().toISOString()
    this.data.tasks.push({
      ...task,
      id: randomUUID(),
      status: 'todo',
      dueDate: dateKeyLocal(base),
      actualMinutes: null,
      timerStartedAt: null,
      completedAt: null,
      subtasks: task.subtasks.map((s) => ({ ...s, id: randomUUID(), done: false })),
      order: this.nextOrder('todo'),
      createdAt: now,
      updatedAt: now
    })
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
    if (status === 'done' && !wasDone) {
      task.completedAt = new Date().toISOString()
      this.onCompleted(task)
    }
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

  // --- Contacts / CRM -----------------------------------------------------

  createContact(input: NewContactInput): Contact {
    const now = new Date().toISOString()
    const contact: Contact = {
      id: randomUUID(),
      name: input.name.trim() || 'Unnamed contact',
      email: input.email ?? '',
      phone: input.phone ?? '',
      company: input.company ?? '',
      title: input.title ?? '',
      workspaceId: input.workspaceId ?? this.data.workspaces[0]?.id ?? '',
      stage: input.stage ?? 'lead',
      tags: input.tags ?? [],
      notes: input.notes ?? '',
      interactions: [],
      lastContactedAt: null,
      followUpAt: null,
      briefing: null,
      createdAt: now,
      updatedAt: now
    }
    this.data.contacts.push(contact)
    this.persist()
    return contact
  }

  updateContact(id: string, patch: ContactPatch): Contact | null {
    const contact = this.data.contacts.find((c) => c.id === id)
    if (!contact) return null
    Object.assign(contact, patch, {
      id: contact.id,
      createdAt: contact.createdAt,
      interactions: contact.interactions
    })
    contact.updatedAt = new Date().toISOString()
    this.persist()
    return contact
  }

  deleteContact(id: string): boolean {
    const before = this.data.contacts.length
    this.data.contacts = this.data.contacts.filter((c) => c.id !== id)
    const changed = this.data.contacts.length !== before
    if (changed) this.persist()
    return changed
  }

  /** Appends an interaction and bumps the contact's last-contacted timestamp. */
  addInteraction(contactId: string, input: NewInteractionInput): Contact | null {
    const contact = this.data.contacts.find((c) => c.id === contactId)
    if (!contact) return null
    const at = new Date().toISOString()
    contact.interactions.push({ id: randomUUID(), at, kind: input.kind, note: input.note.trim() })
    contact.lastContactedAt = at
    contact.updatedAt = at
    this.persist()
    return contact
  }

  /** Find-or-create a contact from an email sender, logging the email. */
  captureContactFromEmail(input: CaptureContactInput): CaptureContactResult {
    const emailLc = input.email.trim().toLowerCase()
    let contact = emailLc
      ? this.data.contacts.find((c) => c.email.trim().toLowerCase() === emailLc)
      : undefined

    let created = false
    if (!contact) {
      contact = this.createContact({
        name: input.name || input.email || 'Unknown',
        email: input.email,
        workspaceId: input.workspaceId,
        stage: 'lead'
      })
      created = true
    }
    this.addInteraction(contact.id, { kind: 'email', note: `Email: ${input.subject}` })
    return { created, contactId: contact.id }
  }

  /** Attaches a Claude-generated briefing to a contact. */
  setContactBriefing(id: string, text: string): Contact | null {
    const contact = this.data.contacts.find((c) => c.id === id)
    if (!contact) return null
    contact.briefing = { text: text.trim(), generatedAt: new Date().toISOString() }
    contact.updatedAt = new Date().toISOString()
    this.persist()
    return contact
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

/** Local-time YYYY-MM-DD (matches how dueDate is stored). */
function dateKeyLocal(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

let instance: Store | null = null
export function getStore(): Store {
  if (!instance) instance = new Store()
  return instance
}
