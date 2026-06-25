// Centralized IPC channel names shared between main and preload so they never drift.
export const IPC = {
  getData: 'data:get',
  // Workspaces
  createWorkspace: 'workspace:create',
  updateWorkspace: 'workspace:update',
  deleteWorkspace: 'workspace:delete',
  // Tasks
  createTask: 'task:create',
  updateTask: 'task:update',
  deleteTask: 'task:delete',
  reorderTask: 'task:reorder',
  startTaskTimer: 'task:timer:start',
  stopTaskTimer: 'task:timer:stop',
  // Accounts / Google OAuth
  googleConfigured: 'google:configured',
  connectAccount: 'account:connect',
  disconnectAccount: 'account:disconnect',
  removeAccount: 'account:remove',
  updateAccount: 'account:update',
  // Inbox
  listInbox: 'inbox:list',
  getMessage: 'inbox:message',
  openEmail: 'inbox:open',
  dismissEmail: 'inbox:dismiss',
  undismissEmail: 'inbox:undismiss',
  // Mail write actions (gmail.modify / gmail.send)
  mailAction: 'mail:action',
  fileMessage: 'mail:file',
  listLabels: 'mail:labels',
  sendEmail: 'mail:send',
  // Folders (Gmail labels + local color/note metadata)
  listFolders: 'folder:list',
  createFolder: 'folder:create',
  renameFolder: 'folder:rename',
  deleteFolder: 'folder:delete',
  updateFolderMeta: 'folder:meta',
  listFolderMessages: 'folder:messages',
  // Claude assistant
  anthropicConfigured: 'claude:configured',
  draftReply: 'claude:draft',
  draftMeetingBrief: 'claude:brief',
  // Calendar
  listCalendar: 'calendar:list',
  createEvent: 'calendar:createEvent',
  // News briefing
  generateBriefing: 'briefing:generate',
  updateBriefingSettings: 'briefing:settings',
  // Contacts / CRM
  createContact: 'contact:create',
  updateContact: 'contact:update',
  deleteContact: 'contact:delete',
  addInteraction: 'contact:interaction',
  captureContact: 'contact:capture',
  setContactFollowUp: 'contact:followup',
  draftContactBrief: 'contact:brief',
  setContactBriefing: 'contact:setBrief',
  attachEventBrief: 'calendar:attachBrief'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
