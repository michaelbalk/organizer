// Shared domain types used by both the Electron main process and the React renderer.

/** A "context" separates spheres of life. Personal vs. one of several businesses. */
export type WorkspaceKind = 'personal' | 'business'

export interface Workspace {
  id: string
  /** e.g. "Personal", "Acme LLC", "Globex Inc" */
  name: string
  kind: WorkspaceKind
  /** Hex color used for chips/labels across the UI. */
  color: string
  createdAt: string
}

/** A connected provider account (Gmail/Google for now). */
export interface Account {
  id: string
  provider: 'google'
  /** The signed-in email address. */
  email: string
  displayName: string
  /** Which workspace this account belongs to by default. */
  workspaceId: string
  /** Whether OAuth tokens are currently present/valid. Phase 2. */
  connected: boolean
  createdAt: string
}

export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface Task {
  id: string
  title: string
  notes: string
  status: TaskStatus
  priority: TaskPriority
  /** Owning workspace (personal or a specific business). */
  workspaceId: string
  /** ISO date (YYYY-MM-DD) or null. */
  dueDate: string | null
  /** Free-form labels. */
  tags: string[]
  /** Optional link back to the email/event this task came from. Phase 2. */
  source: TaskSource | null
  /** Manual ordering within a status column. */
  order: number
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export interface TaskSource {
  kind: 'email' | 'event'
  accountId: string
  /** Gmail message/thread id or Calendar event id. */
  externalId: string
  /** Cached human-readable reference (subject / event title). */
  label: string
}

export const TASK_STATUSES: { id: TaskStatus; label: string }[] = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'todo', label: 'To Do' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'done', label: 'Done' }
]

export const TASK_PRIORITIES: { id: TaskPriority; label: string; color: string }[] = [
  { id: 'low', label: 'Low', color: '#6b7280' },
  { id: 'medium', label: 'Medium', color: '#2563eb' },
  { id: 'high', label: 'High', color: '#d97706' },
  { id: 'urgent', label: 'Urgent', color: '#dc2626' }
]

/** Full persisted application state. */
export interface AppData {
  version: number
  workspaces: Workspace[]
  accounts: Account[]
  tasks: Task[]
}

/** Payload shapes for creating/updating tasks from the renderer. */
export type NewTaskInput = Pick<Task, 'title'> &
  Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'completedAt'>>

export type TaskPatch = Partial<Omit<Task, 'id' | 'createdAt'>>

export type NewWorkspaceInput = Pick<Workspace, 'name' | 'kind'> & Partial<Pick<Workspace, 'color'>>
