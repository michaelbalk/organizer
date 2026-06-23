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

/** A single email surfaced in the unified inbox (read-only projection of Gmail). */
export interface EmailItem {
  /** Gmail message id. */
  id: string
  threadId: string
  accountId: string
  accountEmail: string
  /** Workspace inherited from the owning account, for color-coding. */
  workspaceId: string
  /** Sender display name (falls back to the address). */
  from: string
  fromEmail: string
  subject: string
  snippet: string
  /** ISO timestamp (from Gmail internalDate). */
  date: string
  unread: boolean
}

/** Result of fetching the unified inbox: messages plus any per-account failures. */
export interface InboxResult {
  emails: EmailItem[]
  errors: InboxError[]
  fetchedAt: string
}

export interface InboxError {
  accountId: string
  accountEmail: string
  message: string
  /** True when the fix is to re-authenticate the account. */
  needsReconnect: boolean
}

/** A fully-loaded message for the in-app reader. */
export interface EmailFull {
  id: string
  threadId: string
  accountId: string
  accountEmail: string
  workspaceId: string
  from: string
  fromEmail: string
  to: string
  cc: string
  subject: string
  date: string
  /** RFC822 Message-ID header, used to thread replies (In-Reply-To/References). */
  messageIdHeader: string
  /** Body HTML, rendered inside a sandboxed iframe with a strict CSP. */
  bodyHtml: string
  /** Best-effort plain-text rendition of the body, for quoting in replies. */
  bodyText: string
  /** True when bodyHtml was derived (and escaped) from a plain-text part. */
  isPlainText: boolean
  attachments: EmailAttachmentMeta[]
  unread: boolean
}

export interface EmailAttachmentMeta {
  filename: string
  mimeType: string
  sizeBytes: number
}

/** A Gmail label the user can file a message into. */
export interface GmailLabel {
  id: string
  name: string
}

/** Payload for sending a reply/forward/new message from the app. */
export interface SendEmailInput {
  accountId: string
  to: string
  cc?: string
  subject: string
  /** Plain-text body. */
  body: string
  /** Set for replies/forwards so Gmail threads the message correctly. */
  threadId?: string
  /** Original Message-ID header, for In-Reply-To/References on replies. */
  inReplyTo?: string
}

export type MailActionKind = 'archive' | 'trash' | 'markRead' | 'markUnread'

/** Context handed to Claude to draft an email (reply, forward note, or new message). */
export interface DraftReplyInput {
  accountEmail: string
  mode: 'reply' | 'replyAll' | 'forward' | 'new'
  /** Original sender — omitted for a brand-new message. */
  fromName?: string
  subject?: string
  /** Plain-text body of the original message — omitted for a new message. */
  originalBody?: string
  /** Free-text instruction on what to write (required for a new message). */
  guidance?: string
}

/** Full persisted application state. */
export interface AppData {
  version: number
  workspaces: Workspace[]
  accounts: Account[]
  tasks: Task[]
  /** Gmail message ids the user has triaged/dismissed locally (pruned to live inbox). */
  dismissedEmails: string[]
}

/** Payload shapes for creating/updating tasks from the renderer. */
export type NewTaskInput = Pick<Task, 'title'> &
  Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'completedAt'>>

export type TaskPatch = Partial<Omit<Task, 'id' | 'createdAt'>>

export type NewWorkspaceInput = Pick<Workspace, 'name' | 'kind'> & Partial<Pick<Workspace, 'color'>>

export type NewAccountInput = Pick<
  Account,
  'provider' | 'email' | 'displayName' | 'workspaceId'
> &
  Partial<Pick<Account, 'connected'>>
