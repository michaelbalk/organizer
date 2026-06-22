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
  // Accounts / Google OAuth
  googleConfigured: 'google:configured',
  connectAccount: 'account:connect',
  disconnectAccount: 'account:disconnect',
  removeAccount: 'account:remove',
  updateAccount: 'account:update',
  // Inbox
  listInbox: 'inbox:list',
  openEmail: 'inbox:open',
  dismissEmail: 'inbox:dismiss',
  undismissEmail: 'inbox:undismiss'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
