import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import { getStore } from './store'
import type { NewTaskInput, NewWorkspaceInput, TaskPatch, Workspace } from '@shared/types'

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
}
