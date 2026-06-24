// Shared domain types used by both the Electron main process and the React renderer.

/** A "context" separates spheres of life: personal, a business, or school. */
export type WorkspaceKind = 'personal' | 'business' | 'school'

/** The three categories, each with a designated label, icon, and color. */
export const WORKSPACE_KINDS: { id: WorkspaceKind; label: string; icon: string; color: string }[] = [
  { id: 'personal', label: 'Personal', icon: '👤', color: '#2563eb' },
  { id: 'business', label: 'Business', icon: '🏢', color: '#d97706' },
  { id: 'school', label: 'School', icon: '🎓', color: '#9333ea' }
]

/** Designated category color for a workspace kind (used to color the calendar). */
export function kindColor(kind: WorkspaceKind | undefined): string {
  return WORKSPACE_KINDS.find((k) => k.id === kind)?.color ?? '#64748b'
}

/** Category icon for a workspace kind. */
export function kindIcon(kind: WorkspaceKind | undefined): string {
  return WORKSPACE_KINDS.find((k) => k.id === kind)?.icon ?? '•'
}

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
export type TaskRecurrence = 'none' | 'daily' | 'weekly' | 'monthly'

/** A single step in a task's checklist. */
export interface Subtask {
  id: string
  title: string
  done: boolean
}

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
  /** Optional time-of-day (HH:mm) paired with dueDate for a precise deadline. */
  dueTime: string | null
  /** Expected duration in minutes (planning estimate), or null. */
  estimateMinutes: number | null
  /** Actual time spent in minutes (accumulated by the timer or entered by hand). */
  actualMinutes: number | null
  /** Repeat cadence; completing a recurring task spawns its next occurrence. */
  recurrence: TaskRecurrence
  /** Step-by-step checklist. */
  subtasks: Subtask[]
  /** ISO timestamp when a running timer started, or null if not running. */
  timerStartedAt: string | null
  /** Free-form labels. */
  tags: string[]
  /** Optional link back to the email/event this task came from. Phase 2. */
  source: TaskSource | null
  /** Optional link to a CRM contact this task is for. */
  contactId: string | null
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
  /** Direct link to open the source (Gmail thread / Calendar event). */
  url?: string
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

/** A read-only calendar event projected from Google Calendar. */
export interface CalendarEvent {
  id: string
  accountId: string
  accountEmail: string
  /** Workspace inherited from the owning account, for color-coding. */
  workspaceId: string
  calendarId: string
  calendarName: string
  title: string
  /** ISO start/end. For all-day events these are local midnight boundaries. */
  start: string
  end: string
  allDay: boolean
  location: string
  /** Attendee display names / addresses, for context in a brief. */
  attendees: string[]
  /** Existing event description/notes. */
  description: string
  /** Link to the event in Google Calendar (opens in the browser). */
  htmlLink: string
}

/** Context handed to Claude to write a meeting brief. */
export interface MeetingBriefInput {
  accountEmail: string
  title: string
  /** Human-readable date/time. */
  when: string
  attendees?: string
  location?: string
  /** Existing event notes, if any. */
  description?: string
  /** Optional focus from the user. */
  guidance?: string
}

export interface CalendarResult {
  events: CalendarEvent[]
  errors: InboxError[]
  fetchedAt: string
}

/** Which conferencing platform to attach to a new meeting. */
export type MeetingPlatform = 'meet' | 'zoom' | 'teams' | 'none'

/** Payload to create a calendar event (optionally with a Google Meet link). */
export interface CreateEventInput {
  accountId: string
  title: string
  /** Local datetime "YYYY-MM-DDTHH:mm:ss" interpreted in timeZone. */
  start: string
  end: string
  timeZone: string
  attendees?: string[]
  description?: string
  platform: MeetingPlatform
}

export interface CreatedEvent {
  id: string
  htmlLink: string
  /** Video join link, when a conference was attached. */
  meetLink: string | null
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

/**
 * Local metadata for a folder (Gmail label), keyed by name. Gmail owns the
 * label's existence; the app adds a color and a "why this folder exists" note.
 */
export interface FolderMeta {
  name: string
  color: string
  note: string
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

// --- Contacts / CRM -------------------------------------------------------

/** A contact's relationship type (the field was formerly a sales "stage"). */
export type ContactStage =
  | 'colleague'
  | 'client'
  | 'lead'
  | 'vendor'
  | 'advisor'
  | 'consultant'
  | 'partner'
  | 'investor'
  | 'friend'
  | 'other'

export const CONTACT_STAGES: { id: ContactStage; label: string; color: string }[] = [
  { id: 'colleague', label: 'Colleague', color: '#2563eb' },
  { id: 'client', label: 'Client', color: '#16a34a' },
  { id: 'lead', label: 'Lead', color: '#d97706' },
  { id: 'vendor', label: 'Vendor', color: '#9333ea' },
  { id: 'advisor', label: 'Advisor', color: '#0891b2' },
  { id: 'consultant', label: 'Consultant', color: '#0ea5e9' },
  { id: 'partner', label: 'Partner', color: '#db2777' },
  { id: 'investor', label: 'Investor', color: '#6366f1' },
  { id: 'friend', label: 'Friend', color: '#f43f5e' },
  { id: 'other', label: 'Other', color: '#6b7280' }
]

export type InteractionKind = 'note' | 'call' | 'email' | 'meeting' | 'task'

export interface ContactInteraction {
  id: string
  /** ISO datetime the interaction was logged. */
  at: string
  kind: InteractionKind
  note: string
}

/** A Claude-generated analysis attached to a contact record. */
export interface ContactBriefing {
  text: string
  generatedAt: string
}

export interface Contact {
  id: string
  name: string
  email: string
  phone: string
  company: string
  title: string
  /** Which workspace/sphere (Personal, a company, School…) this contact belongs to. */
  workspaceId: string
  stage: ContactStage
  tags: string[]
  notes: string
  interactions: ContactInteraction[]
  /** ISO of the most recent logged interaction (for follow-up sorting). */
  lastContactedAt: string | null
  /** Optional follow-up date (YYYY-MM-DD); surfaced when due/overdue. */
  followUpAt: string | null
  /** Id of the task created to track the follow-up (kept in sync with followUpAt). */
  followUpTaskId: string | null
  /** Latest Claude-generated briefing attached to this contact. */
  briefing: ContactBriefing | null
  createdAt: string
  updatedAt: string
}

/** Contact details handed to Claude to produce a relationship briefing. */
export interface ContactBriefInput {
  name: string
  company?: string
  title?: string
  email?: string
  stage?: string
  tags?: string[]
  notes?: string
  interactions?: { at: string; kind: string; note: string }[]
  guidance?: string
}

export interface NewContactInput {
  name: string
  email?: string
  phone?: string
  company?: string
  title?: string
  workspaceId?: string
  stage?: ContactStage
  tags?: string[]
  notes?: string
}

export type ContactPatch = Partial<
  Pick<
    Contact,
    | 'name'
    | 'email'
    | 'phone'
    | 'company'
    | 'title'
    | 'workspaceId'
    | 'stage'
    | 'tags'
    | 'notes'
    | 'followUpAt'
  >
>

export interface NewInteractionInput {
  kind: InteractionKind
  note: string
}

/** Find-or-create a contact from an email sender, logging the email as an interaction. */
export interface CaptureContactInput {
  name: string
  email: string
  workspaceId: string
  subject: string
}
export interface CaptureContactResult {
  created: boolean
  contactId: string
}

/** Full persisted application state. */
export interface AppData {
  version: number
  workspaces: Workspace[]
  accounts: Account[]
  tasks: Task[]
  /** Gmail message ids the user has triaged/dismissed locally (pruned to live inbox). */
  dismissedEmails: string[]
  /** Local color/note metadata for folders (Gmail labels), keyed by name. */
  folders: FolderMeta[]
  /** Address book / CRM contacts. */
  contacts: Contact[]
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
