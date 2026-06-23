import { ipcMain, shell } from 'electron'
import { IPC } from '@shared/ipc'
import { getStore } from './store'
import { isGoogleConfigured } from './config'
import {
  connectGoogleAccount,
  disconnectGoogleAccount,
  removeGoogleAccount
} from './google/accounts'
import { listInbox, getMessage, gmailThreadUrl } from './google/gmail'
import type { Account, NewTaskInput, NewWorkspaceInput, TaskPatch, Workspace } from '@shared/types'

/** Register all IPC handlers. Called once after the app is ready. */
export function registerIpc(): void {
  const store = getStore()

  ipcMain.handle(IPC.getData, () => store.getData())

  // Workspaces
  ipcMain.handle(IPC.createWorkspace, (_e, input: NewWorkspaceInput) =>
    store.createWorkspace(input)
  )
  ipcMain.handle(IPC.updateWorkspace, (_e, id: string, patch: Partial<Workspace>) =>
    store.updateWorkspace(id, patch)
  )
  ipcMain.handle(IPC.deleteWorkspace, (_e, id: string) => store.deleteWorkspace(id))

  // Tasks
  ipcMain.handle(IPC.createTask, (_e, input: NewTaskInput) => store.createTask(input))
  ipcMain.handle(IPC.updateTask, (_e, id: string, patch: TaskPatch) =>
    store.updateTask(id, patch)
  )
  ipcMain.handle(IPC.deleteTask, (_e, id: string) => store.deleteTask(id))
  ipcMain.handle(
    IPC.reorderTask,
    (_e, id: string, status: TaskPatch['status'], toIndex: number) =>
      store.reorderTask(id, status!, toIndex)
  )

  // Accounts / Google OAuth
  ipcMain.handle(IPC.googleConfigured, () => isGoogleConfigured())
  ipcMain.handle(IPC.connectAccount, (_e, workspaceId: string) =>
    connectGoogleAccount(workspaceId)
  )
  ipcMain.handle(IPC.disconnectAccount, (_e, id: string) => disconnectGoogleAccount(id))
  ipcMain.handle(IPC.removeAccount, (_e, id: string) => removeGoogleAccount(id))
  ipcMain.handle(IPC.updateAccount, (_e, id: string, patch: Partial<Account>) =>
    store.updateAccount(id, patch)
  )

  // Inbox
  ipcMain.handle(IPC.listInbox, (_e, maxPerAccount?: number) => listInbox(maxPerAccount))
  ipcMain.handle(IPC.getMessage, (_e, accountId: string, messageId: string) =>
    getMessage(accountId, messageId)
  )
  ipcMain.handle(IPC.openEmail, (_e, accountEmail: string, threadId: string) =>
    shell.openExternal(gmailThreadUrl(accountEmail, threadId))
  )
  ipcMain.handle(IPC.dismissEmail, (_e, emailId: string) => store.dismissEmail(emailId))
  ipcMain.handle(IPC.undismissEmail, (_e, emailId: string) => store.undismissEmail(emailId))
}
