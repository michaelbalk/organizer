import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  Account,
  AppData,
  InboxResult,
  NewTaskInput,
  NewWorkspaceInput,
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
  openEmail: (accountEmail: string, messageId: string): Promise<void> =>
    ipcRenderer.invoke(IPC.openEmail, accountEmail, messageId),
  dismissEmail: (emailId: string): Promise<void> =>
    ipcRenderer.invoke(IPC.dismissEmail, emailId),
  undismissEmail: (emailId: string): Promise<void> =>
    ipcRenderer.invoke(IPC.undismissEmail, emailId)
}

export type OrganizerApi = typeof api

contextBridge.exposeInMainWorld('api', api)
