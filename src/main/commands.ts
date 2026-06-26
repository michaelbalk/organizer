import { IPC } from '@shared/ipc'
import { getStore } from './store'
import { isGoogleConfigured, isAnthropicConfigured } from './config'
import { draftReply, draftMeetingBrief, draftContactBrief } from './anthropic'
import { disconnectGoogleAccount, removeGoogleAccount } from './google/accounts'
import {
  listInbox,
  getMessage,
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
import { buildNewsBriefing } from './briefing'
import { scanFollowUps } from './followups'

/** A command takes the positional args from the caller and returns a result. */
export type CommandHandler = (args: any[]) => unknown | Promise<unknown>

/**
 * The single source of truth for every app operation, keyed by its IPC channel.
 * Both the Electron IPC bridge and the cloud HTTP server dispatch through this
 * map, so the desktop and web builds can never drift apart.
 *
 * Two handlers are intentionally absent because they need host-specific plumbing:
 *  - `connectAccount` — desktop uses a loopback OAuth flow; the server uses a
 *    browser redirect. Each host registers its own.
 *  - `openEmail` — desktop opens the system browser; the server returns the URL
 *    for the web client to open. Each host registers its own.
 */
export function buildCommands(): Record<string, CommandHandler> {
  const store = getStore()

  return {
    [IPC.getData]: () => store.getData(),

    // Workspaces
    [IPC.createWorkspace]: ([input]) => store.createWorkspace(input),
    [IPC.updateWorkspace]: ([id, patch]) => store.updateWorkspace(id, patch),
    [IPC.deleteWorkspace]: ([id]) => store.deleteWorkspace(id),

    // Tasks
    [IPC.createTask]: ([input]) => store.createTask(input),
    [IPC.updateTask]: ([id, patch]) => store.updateTask(id, patch),
    [IPC.deleteTask]: ([id]) => store.deleteTask(id),
    [IPC.startTaskTimer]: ([id]) => store.startTimer(id),
    [IPC.stopTaskTimer]: ([id]) => store.stopTimer(id),
    [IPC.reorderTask]: ([id, status, toIndex]) => store.reorderTask(id, status, toIndex),

    // Accounts (connect is host-specific — see note above)
    [IPC.googleConfigured]: () => isGoogleConfigured(),
    [IPC.disconnectAccount]: ([id]) => disconnectGoogleAccount(id),
    [IPC.removeAccount]: ([id]) => removeGoogleAccount(id),
    [IPC.updateAccount]: ([id, patch]) => store.updateAccount(id, patch),

    // Inbox (open is host-specific — see note above)
    [IPC.listInbox]: ([maxPerAccount]) => listInbox(maxPerAccount),
    [IPC.getMessage]: ([accountId, messageId]) => getMessage(accountId, messageId),
    [IPC.dismissEmail]: ([emailId]) => store.dismissEmail(emailId),
    [IPC.undismissEmail]: ([emailId]) => store.undismissEmail(emailId),

    // Mail write actions
    [IPC.mailAction]: ([accountId, messageId, action]) =>
      applyMailAction(accountId, messageId, action),
    [IPC.fileMessage]: ([accountId, messageId, labelId]) =>
      fileMessage(accountId, messageId, labelId),
    [IPC.listLabels]: ([accountId]) => listLabels(accountId),
    [IPC.sendEmail]: ([input]) => sendEmail(input),

    // Folders (Gmail labels + local color/note metadata)
    [IPC.listFolders]: () => listFolders(),
    [IPC.createFolder]: async ([name, color, note]) => {
      await createFolder(name)
      store.upsertFolderMeta(String(name).trim(), { color, note })
    },
    [IPC.renameFolder]: async ([oldName, newName]) => {
      await renameFolder(oldName, newName)
      store.renameFolderMeta(oldName, String(newName).trim())
    },
    [IPC.deleteFolder]: async ([name]) => {
      await deleteFolder(name)
      store.deleteFolderMeta(name)
    },
    [IPC.updateFolderMeta]: ([name, patch]) => store.upsertFolderMeta(name, patch),
    [IPC.listFolderMessages]: ([name, max]) => listFolderMessages(name, max),

    // Claude assistant
    [IPC.anthropicConfigured]: () => isAnthropicConfigured(),
    [IPC.draftReply]: ([input]) => draftReply(input),
    [IPC.draftMeetingBrief]: ([input]) => draftMeetingBrief(input),

    // Calendar
    [IPC.listCalendar]: ([daysAhead]) => listCalendarEvents(daysAhead),
    [IPC.createEvent]: ([input]) => createEvent(input),
    [IPC.attachEventBrief]: ([accountId, calendarId, eventId, brief]) =>
      attachEventBrief(accountId, calendarId, eventId, brief),

    // News briefing
    [IPC.generateBriefing]: ([hours]) => buildNewsBriefing(hours),
    [IPC.updateBriefingSettings]: ([patch]) => store.updateBriefingSettings(patch),

    // Automation (email→task follow-up scan)
    [IPC.updateAutomation]: ([patch]) => store.updateAutomation(patch),
    [IPC.scanFollowUpsNow]: () => scanFollowUps(),

    // Contacts / CRM
    [IPC.createContact]: ([input]) => store.createContact(input),
    [IPC.updateContact]: ([id, patch]) => store.updateContact(id, patch),
    [IPC.deleteContact]: ([id]) => store.deleteContact(id),
    [IPC.addInteraction]: ([contactId, input]) => store.addInteraction(contactId, input),
    [IPC.captureContact]: ([input]) => store.captureContactFromEmail(input),
    [IPC.draftContactBrief]: ([input]) => draftContactBrief(input),
    [IPC.setContactBriefing]: ([id, text]) => store.setContactBriefing(id, text),
    [IPC.setContactFollowUp]: ([contactId, date]) => store.setFollowUp(contactId, date)
  }
}
