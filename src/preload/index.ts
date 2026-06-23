import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  Account,
  AppData,
  CalendarResult,
  DraftReplyInput,
  EmailFull,
  GmailLabel,
  InboxResult,
  MailActionKind,
  NewTaskInput,
  NewWorkspaceInput,
  SendEmailInput,
  Task,
  TaskPatch,
  TaskStatus,
  Workspace
} from '@shared/types'

const api = {
  getData: (): Promise<AppData> => ipcRenderer.invoke(IPC.getData),

  createWorkspace: (input: NewWorkspaceInput): Promise<Workspace> =>
    ipcRenderer.invoke(IPC.createWorkspace, input),
  updateWorkspace: (id: string, patch: Partial<Workspace>): Promise<Workspace | null> =>
    ipcRenderer.invoke(IPC.updateWorkspace, id, patch),
  deleteWorkspace: (id: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.deleteWorkspace, id),

  createTask: (input: NewTaskInput): Promise<Task> =>
    ipcRenderer.invoke(IPC.createTask, input),
  updateTask: (id: string, patch: TaskPatch): Promise<Task | null> =>
    ipcRenderer.invoke(IPC.updateTask, id, patch),
  deleteTask: (id: string): Promise<boolean> => ipcRenderer.invoke(IPC.deleteTask, id),
  reorderTask: (id: string, status: TaskStatus, toIndex: number): Promise<Task | null> =>
    ipcRenderer.invoke(IPC.reorderTask, id, status, toIndex),

  // Accounts / Google OAuth
  isGoogleConfigured: (): Promise<boolean> => ipcRenderer.invoke(IPC.googleConfigured),
  connectAccount: (workspaceId: string): Promise<Account> =>
    ipcRenderer.invoke(IPC.connectAccount, workspaceId),
  disconnectAccount: (id: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.disconnectAccount, id),
  removeAccount: (id: string): Promise<boolean> => ipcRenderer.invoke(IPC.removeAccount, id),
  updateAccount: (id: string, patch: Partial<Account>): Promise<Account | null> =>
    ipcRenderer.invoke(IPC.updateAccount, id, patch),

  // Inbox
  listInbox: (maxPerAccount?: number): Promise<InboxResult> =>
    ipcRenderer.invoke(IPC.listInbox, maxPerAccount),
  getMessage: (accountId: string, messageId: string): Promise<EmailFull> =>
    ipcRenderer.invoke(IPC.getMessage, accountId, messageId),
  openEmail: (accountEmail: string, threadId: string): Promise<void> =>
    ipcRenderer.invoke(IPC.openEmail, accountEmail, threadId),
  dismissEmail: (emailId: string): Promise<void> =>
    ipcRenderer.invoke(IPC.dismissEmail, emailId),
  undismissEmail: (emailId: string): Promise<void> =>
    ipcRenderer.invoke(IPC.undismissEmail, emailId),

  // Mail write actions (gmail.modify / gmail.send)
  mailAction: (accountId: string, messageId: string, action: MailActionKind): Promise<void> =>
    ipcRenderer.invoke(IPC.mailAction, accountId, messageId, action),
  fileMessage: (accountId: string, messageId: string, labelId: string): Promise<void> =>
    ipcRenderer.invoke(IPC.fileMessage, accountId, messageId, labelId),
  listLabels: (accountId: string): Promise<GmailLabel[]> =>
    ipcRenderer.invoke(IPC.listLabels, accountId),
  sendEmail: (input: SendEmailInput): Promise<void> => ipcRenderer.invoke(IPC.sendEmail, input),

  // Folders (Gmail labels + local color/note metadata)
  listFolders: (): Promise<string[]> => ipcRenderer.invoke(IPC.listFolders),
  createFolder: (name: string, color?: string, note?: string): Promise<void> =>
    ipcRenderer.invoke(IPC.createFolder, name, color, note),
  renameFolder: (oldName: string, newName: string): Promise<void> =>
    ipcRenderer.invoke(IPC.renameFolder, oldName, newName),
  deleteFolder: (name: string): Promise<void> => ipcRenderer.invoke(IPC.deleteFolder, name),
  updateFolderMeta: (name: string, patch: { color?: string; note?: string }): Promise<void> =>
    ipcRenderer.invoke(IPC.updateFolderMeta, name, patch),
  listFolderMessages: (name: string, max?: number): Promise<InboxResult> =>
    ipcRenderer.invoke(IPC.listFolderMessages, name, max),

  // Claude assistant
  isAnthropicConfigured: (): Promise<boolean> => ipcRenderer.invoke(IPC.anthropicConfigured),
  draftReply: (input: DraftReplyInput): Promise<string> =>
    ipcRenderer.invoke(IPC.draftReply, input),

  // Calendar
  listCalendar: (daysAhead?: number): Promise<CalendarResult> =>
    ipcRenderer.invoke(IPC.listCalendar, daysAhead)
}

export type OrganizerApi = typeof api

contextBridge.exposeInMainWorld('api', api)
