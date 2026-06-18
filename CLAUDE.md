# CLAUDE.md — Organizer project guide

Unified email/calendar/task **Electron desktop app** (Windows). Owner: Michael Balk.

## Stack
Electron + Vite + React + TypeScript (`electron-vite`). No native deps in Phase 1 —
storage is a JSON file via `src/main/store.ts`. Pure-JS on purpose to avoid Windows
native-compilation pain; the store interface is designed to swap to SQLite later.

## Run
- Node was installed via winget (`OpenJS.NodeJS.LTS`); it's at `C:\Program Files\nodejs`
  and may not be on Git-Bash PATH. In PowerShell, refresh PATH from Machine+User if
  `node` isn't found.
- `npm run dev` (hot reload), `npm run build`, `npm run typecheck`.
- Known gotcha: Electron's binary postinstall doesn't always run here. If dev fails
  with `Error: Electron uninstall`, extract the cached zip from
  `%LOCALAPPDATA%\electron\Cache\<hash>\electron-*.zip` into
  `node_modules\electron\dist\` and write `node_modules\electron\path.txt` = `electron.exe`.

## Conventions
- Shared contract lives in `src/shared/` (`types.ts`, `ipc.ts`) — import via `@shared/*`.
- Renderer talks to main ONLY through `window.api` (preload contextBridge). Never add
  `nodeIntegration`; keep `contextIsolation` on and the CSP strict.
- Domain model: **Workspace** (kind: personal|business) → **Task** (status/priority/
  dueDate/tags/workspaceId/source). A Task's company/personal split = its workspace.
- All store mutations persist atomically (temp file + rename) and return the new entity.

## Roadmap
Phase 1 ✅ task board. Phase 2 = Google OAuth (multi-account) + unified inbox +
combined calendar. See README.md for the Google Cloud setup steps.
