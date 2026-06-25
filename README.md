# Organizer

A unified **email + calendar + task** desktop app that brings multiple Google
accounts, a combined calendar, a task board, and a lightweight CRM into one
place — with Claude built in to draft replies, write meeting briefs, and analyze
contacts. Designed around getting-things-done / ADHD-friendly principles:
frictionless capture, single-tasking, visible progress, and clear finish lines.

> Personal project, actively developed. Windows desktop today; a web + cloud
> rebuild for cross-device (Mac, iPad) is planned — see
> [`docs/WEB_REBUILD_PLAN.md`](docs/WEB_REBUILD_PLAN.md).

## Features

### 📋 Tasks
- Kanban board (Backlog / To Do / In Progress / Done) with drag-and-drop
- **Workspaces** separate Personal vs. Business across multiple companies (and School)
- Due date **and time**, expected vs. **actual** duration, a built-in **timer**
- **Recurring** tasks and **subtask** checklists
- One-click capture from an email or calendar event

### ✉️ Inbox
- Unified Gmail across every connected account, color-coded by workspace
- Three-pane layout: vertical **folder rail** · message list · reading pane
- Safe, sandboxed message reader (scripts blocked, remote images off by default)
- **Reply / forward / compose**, archive, file-to-label, trash, mark-read
- **✨ Draft with Claude** on replies and brand-new emails
- **Focus triage**: one email at a time with 1–4 hotkeys
- Full folder management (create / rename / delete / color / note)

### 📅 Calendar
- Combined agenda overlaying **Google events + scheduled tasks**, color-coded by workspace
- Create meetings with **Google Meet** or **Zoom** links (+ invites)
- **✨ Meeting briefs**: Claude drafts a brief and writes it back onto the event
- Turn any event into a task

### 👥 Contacts / CRM
- Address book with relationship types (colleague, client, vendor, advisor, …)
- Multiple **linked tasks** per contact; completing one auto-logs it
- Interaction log, follow-up surfacing, tags, notes
- **✨ Claude briefing** per contact, attached to the record
- Capture contacts straight from email senders

### 🔔 Plus
- A **Today** focus dashboard and native **reminders** for due tasks / upcoming meetings
- Multiple Google accounts, each mapped to a workspace

## Tech stack
- **Electron + Vite + React + TypeScript** (`electron-vite`)
- Google OAuth 2.0 (loopback desktop flow) via `google-auth-library`; Gmail &
  Calendar accessed through their REST APIs on an auto-refreshing client
- **Anthropic Claude API** (via `fetch`) for drafting/briefings
- **Zoom** Server-to-Server OAuth for meeting creation
- Local file-backed JSON store in Electron `userData` (encrypted OAuth tokens via `safeStorage`)

## Project layout
```
src/
  main/        Electron main process — OAuth, Gmail/Calendar/Anthropic/Zoom, store, IPC
  preload/     contextBridge API (typed window.api)
  renderer/    React app (components, styles)
  shared/      types + helpers shared by main and renderer
docs/          design docs (web rebuild plan)
```

## Getting started

```bash
npm install
cp .env.example .env   # then fill in your credentials (see below)
npm run dev            # launch the app in development
```

Other scripts:
```bash
npm run build          # production build
npm run typecheck      # type-check main + renderer
```

### Configuration (`.env`)
`.env` is git-ignored and never committed. Provide:

| Variable | What it's for |
|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud **Desktop app** OAuth client (Gmail API + Calendar API enabled) |
| `GOOGLE_SCOPES` | requested scopes (gmail.modify, gmail.send, calendar) |
| `ANTHROPIC_API_KEY` | Claude API key for the assistant features (`ANTHROPIC_MODEL` optional) |
| `ZOOM_ACCOUNT_ID` / `ZOOM_CLIENT_ID` / `ZOOM_CLIENT_SECRET` | Zoom Server-to-Server OAuth app (optional, for Zoom meetings) |

See `.env.example` for the exact keys.

## Security
- Secrets live only in your local `.env` (git-ignored).
- OAuth tokens are stored encrypted in the OS keystore via Electron `safeStorage`.
- Email bodies render in a sandboxed iframe with a strict CSP; links open in your
  system browser, never in-app.
- The renderer never touches Node or the filesystem directly — only the
  whitelisted, typed `window.api` bridge.

## License
Personal project — all rights reserved.
