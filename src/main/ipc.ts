import { ipcMain, shell } from 'electron'
import { IPC } from '@shared/ipc'
import { getStore } from './store'
import { isGoogleConfigured, isAnthropicConfigured } from './config'
import { draftReply, draftMeetingBrief } from './anthropic'
import {
  connectGoogleAccount,
  disconnectGoogleAccount,
  removeGoogleAccount
} from './google/accounts'
import {
  listInbox,
  getMessage,
  gmailThreadUrl,
  applyMailAction,
  fileMessage,
  listLabels,
  sendEmail,
  listFolders,
  createFolder,
  renameFolder,
  deleteFolder,
  listFolderMessages
} from './google/gmail'
import { listCalendarEvents, attachEventBrief, createEvent } from './google/calendar'
import type {
  Account,
  CaptureContactInput,
  ContactPatch,
  CreateEventInput,
  DraftReplyInput,
  MailActionKind,
  MeetingBriefInput,
  NewContactInput,
  NewInteractionInput,
  NewTaskInput,
  NewWorkspaceInput,
  SendEmailInput,
  TaskPatch,
  Workspace
} from '@shared/types'

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
  ipcMain.handle(IPC.startTaskTimer, (_e, id: string) => store.startTimer(id))
  ipcMain.handle(IPC.stopTaskTimer, (_e, id: string) => store.stopTimer(id))
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

  // Mail write actions
  ipcMain.handle(IPC.mailAction, (_e, accountId: string, messageId: string, action: MailActionKind) =>
    applyMailAction(accountId, messageId, action)
  )
  ipcMain.handle(IPC.fileMessage, (_e, accountId: string, messageId: string, labelId: string) =>
    fileMessage(accountId, messageId, labelId)
  )
  ipcMain.handle(IPC.listLabels, (_e, accountId: string) => listLabels(accountId))
  ipcMain.handle(IPC.sendEmail, (_e, input: SendEmailInput) => sendEmail(input))

  // Folders (Gmail labels + local color/note metadata)
  ipcMain.handle(IPC.listFolders, () => listFolders())
  ipcMain.handle(IPC.createFolder, async (_e, name: string, color?: string, note?: string) => {
    await createFolder(name)
    store.upsertFolderMeta(name.trim(), { color, note })
  })
  ipcMain.handle(IPC.renameFolder, async (_e, oldName: string, newName: string) => {
    await renameFolder(oldName, newName)
    store.renameFolderMeta(oldName, newName.trim())
  })
  ipcMain.handle(IPC.deleteFolder, async (_e, name: string) => {
    await deleteFolder(name)
    store.deleteFolderMeta(name)
  })
  ipcMain.handle(
    IPC.updateFolderMeta,
    (_e, name: string, patch: { color?: string; note?: string }) =>
      store.upsertFolderMeta(name, patch)
  )
  ipcMain.handle(IPC.listFolderMessages, (_e, name: string, max?: number) =>
    listFolderMessages(name, max)
  )

  // Claude assistant
  ipcMain.handle(IPC.anthropicConfigured, () => isAnthropicConfigured())
  ipcMain.handle(IPC.draftReply, (_e, input: DraftReplyInput) => draftReply(input))
  ipcMain.handle(IPC.draftMeetingBrief, (_e, input: MeetingBriefInput) => draftMeetingBrief(input))

  // Calendar
  ipcMain.handle(IPC.listCalendar, (_e, daysAhead?: number) => listCalendarEvents(daysAhead))
  ipcMain.handle(IPC.createEvent, (_e, input: CreateEventInput) => createEvent(input))
  ipcMain.handle(
    IPC.attachEventBrief,
    (_e, accountId: string, calendarId: string, eventId: string, brief: string) =>
      attachEventBrief(accountId, calendarId, eventId, brief)
  )

  // Contacts / CRM
  ipcMain.handle(IPC.createContact, (_e, input: NewContactInput) => store.createContact(input))
  ipcMain.handle(IPC.updateContact, (_e, id: string, patch: ContactPatch) =>
    store.updateContact(id, patch)
  )
  ipcMain.handle(IPC.deleteContact, (_e, id: string) => store.deleteContact(id))
  ipcMain.handle(IPC.addInteraction, (_e, contactId: string, input: NewInteractionInput) =>
    store.addInteraction(contactId, input)
  )
  ipcMain.handle(IPC.captureContact, (_e, input: CaptureContactInput) =>
    store.captureContactFromEmail(input)
  )
}
