# Organizer

A unified **email, calendar, and task** desktop app for Windows, built to handle
multiple Gmail/Google accounts and a combined task board that separates **personal**
from **business** work across **multiple companies**.

Built with **Electron + Vite + React + TypeScript**.

---

## Status

### ✅ Phase 1 — Task board (done)
- Kanban board (Backlog → To Do → In Progress → Done) with drag-and-drop.
- **Workspaces** model: one "Personal" space plus any number of business/company
  spaces, each color-coded.
- Sidebar filtering: All Tasks, by kind (Personal / Business), or by a single company.
- Create/edit/delete tasks with priority, due date (with overdue flag), tags, and notes.
- Local persistence — data lives in a JSON file under Electron's `userData` dir
  (`%APPDATA%/organizer/data/organizer.json`), written atomically.

### 🔜 Phase 2 — Gmail + Google Calendar
- Connect multiple Google accounts via OAuth 2.0 (desktop loopback flow).
- Unified inbox across accounts; "turn email into task" with a source backlink.
- Combined calendar overlaying every account's events, color-coded by workspace.

### 🔭 Later
- SQLite storage (swap behind the existing store interface) if data grows.
- Notifications/reminders, recurring tasks, calendar-driven task scheduling.
- Packaging/installer via `electron-builder`.

---

## Develop

```powershell
npm install      # first time
npm run dev      # launch with hot reload
npm run build    # production bundle into ./out
npm run typecheck
```

> **Note:** if `npm run dev` fails with `Error: Electron uninstall`, the Electron
> binary postinstall didn't run. The zip is cached under
> `%LOCALAPPDATA%\electron\Cache`; extract it into `node_modules\electron\dist`
> and create `node_modules\electron\path.txt` containing `electron.exe`.

---

## Architecture

```
src/
  shared/        # types.ts + ipc.ts — the contract shared by all processes
  main/          # Electron main process
    index.ts     # window + lifecycle
    store.ts     # file-backed data store (swappable for SQLite)
    ipc.ts       # IPC handlers calling the store
  preload/       # contextBridge — exposes a typed `window.api` to the renderer
  renderer/      # React UI
    src/
      App.tsx
      components/ # Sidebar, Board, TaskModal, WorkspaceModal, Placeholder
      styles.css
```

**Security:** `contextIsolation` on, `nodeIntegration` off, a strict CSP, and
external links forced to the system browser. The renderer never touches Node or
the filesystem directly — only the whitelisted `window.api` surface.

---

## Phase 2 setup — what you'll need (Google)

To connect Gmail/Calendar we'll register an OAuth app in **Google Cloud Console**:

1. Create a project at <https://console.cloud.google.com>.
2. Enable the **Gmail API** and **Google Calendar API**.
3. Configure the OAuth consent screen (External; add your accounts as test users).
4. Create an **OAuth client ID** of type **Desktop app**.
5. Drop the client ID/secret into a local `.env` (git-ignored) — the app uses a
   loopback redirect, and tokens are stored encrypted in `userData`, never in the repo.

No code change is needed from you for that — it's the next chunk of work.
