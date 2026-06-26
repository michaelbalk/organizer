import { ipcMain, shell } from 'electron'
import { IPC } from '@shared/ipc'
import { buildCommands } from './commands'
import { connectGoogleAccount } from './google/accounts'
import { gmailThreadUrl } from './google/gmail'

/** Register all IPC handlers. Called once after the app is ready. */
export function registerIpc(): void {
  // Shared command map — identical surface to the cloud HTTP server.
  const commands = buildCommands()
  for (const [channel, handler] of Object.entries(commands)) {
    ipcMain.handle(channel, (_e, ...args) => handler(args))
  }

  // Host-specific handlers (desktop variants):
  // Connect uses the loopback OAuth flow; the cloud server uses a redirect.
  ipcMain.handle(IPC.connectAccount, (_e, workspaceId: string, loginHint?: string) =>
    connectGoogleAccount(workspaceId, loginHint)
  )
  // Open launches the system browser directly; the cloud server returns the URL.
  ipcMain.handle(IPC.openEmail, (_e, accountEmail: string, threadId: string) =>
    shell.openExternal(gmailThreadUrl(accountEmail, threadId))
  )
}
