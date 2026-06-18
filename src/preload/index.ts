import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  AppData,
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
    ipcRenderer.invoke(IPC.reorderTask, id, status, toIndex)
}

export type OrganizerApi = typeof api

contextBridge.exposeInMainWorld('api', api)
