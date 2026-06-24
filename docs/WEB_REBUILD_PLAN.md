# Web + Cloud Rebuild Plan (multi-device: Mac, iPad, web)

Goal: run the Organizer on the MacBook Air, iPad Pro, and any browser, with data
that syncs across devices. The iPad is the forcing function — **Electron can't run
on iPadOS**, so the only realistic cross-device path is a **web app backed by a
server + cloud database**.

## Why a rebuild is required
Today the app is split as:
- **Renderer** (React) — the UI. ✅ Portable to web almost as-is.
- **Main process** (Electron/Node) — OAuth flows, Gmail/Calendar/Anthropic API
  calls, the local JSON data store, `safeStorage` token encryption, native
  notifications, `window.api` IPC bridge. ❌ None of this exists in a browser.
- **Data** — a local JSON file on one machine. ❌ No sync.

A browser can't do OAuth token storage, Node API calls, or local file I/O, and
local data can't sync. So the main process must become a **hosted backend** and
the store must become a **cloud database**.

## Target architecture
```
            ┌─────────── Browser / PWA (Mac, iPad, phone) ───────────┐
            │  React app (today's renderer, ported)                  │
            │  typed API client  ──HTTPS──▶                          │
            └────────────────────────────────┬───────────────────────┘
                                              │
                              ┌───────────────▼────────────────┐
                              │  Backend (Node: Fastify/Express) │
                              │  • user auth (app login)         │
                              │  • Google/Zoom/MS OAuth + tokens │
                              │  • Gmail/Calendar/Anthropic calls│
                              │  • business logic (tasks/CRM)    │
                              └───────────────┬──────────────────┘
                                              │
                                   ┌──────────▼──────────┐
                                   │  Postgres (per-user) │
                                   └──────────────────────┘
```

- **Frontend**: reuse the existing React components. Add a PWA manifest so it
  "installs" to the iPad/Mac home screen and runs full-screen.
- **Backend**: port `src/main/google/*`, `anthropic.ts`, `oauth.ts`, `store.ts`
  into server modules. Replace IPC handlers with HTTP/JSON (or tRPC) endpoints.
- **Database**: Postgres (Supabase/Neon free tier) replacing the JSON store —
  one row-set per user. Tokens encrypted at rest with a server key.
- **Auth**: users log into the *app* (email-link or Google sign-in), then connect
  their Google/Zoom/MS accounts; tokens live server-side per user.
- **Notifications**: Web Push (service worker) instead of Electron `Notification`.

## What carries over vs. changes
| Carries over (low rework) | Must change |
|---|---|
| React components / UI / styles | `window.api` IPC → typed HTTP client |
| `src/shared/types.ts` (the data model) | Electron main modules → server endpoints |
| Business logic shape (tasks, folders, CRM) | JSON file store → Postgres |
| Gmail/Calendar/Anthropic request logic | `safeStorage` → server-side encryption |
| OAuth loopback flow → **web redirect** flow (registered redirect URIs) |
| Electron `Notification` → Web Push |

## OAuth implications
- Redirect URIs move from `http://127.0.0.1:<port>` (desktop) to
  `https://<your-domain>/auth/google/callback` (web) — re-register in each
  provider console.
- Personal single-user use can stay in **Testing** with a web redirect. Going
  multi-user/public triggers Google verification for the Gmail/Calendar scopes.

## Phased migration (each phase shippable)
1. **Extract core** — move `google/*`, `anthropic`, `oauth`, `store` behind a
   plain interface (they're already fairly modular). No behavior change.
2. **Stand up the backend** — wrap that core in an HTTP API; switch OAuth to the
   web redirect; move the store to Postgres (encrypted tokens).
3. **Point a web frontend at it** — reuse the renderer; replace `window.api`
   with a typed fetch client. Deploy. Now it works in Safari on Mac + iPad.
4. **PWA polish** — manifest, icons, offline shell, Web Push notifications.
5. **(Optional) keep Electron** as a thin desktop shell that loads the same web
   app/backend — or retire it.

## Cost & prerequisites
- **Hosting**: ~$5–20/mo (Fly.io / Render / Railway), or Vercel + serverless.
- **Database**: Postgres free tier (Supabase/Neon) to start.
- **Domain**: ~$12/yr (needed for web OAuth redirect + PWA).
- **Apple Developer ($99/yr)**: only if you *also* want a signed Mac app or App
  Store distribution. **Not needed** for the web/PWA route to Mac + iPad.
- **Google verification**: only if you make it public/multi-user.

## Recommendation
- If iPad access is the priority, **do the backend extraction (phases 1–3) before
  piling on more desktop-only features** — otherwise new features get built twice.
- New features (CRM, meetings) should be written with clean module boundaries so
  their logic ports to the backend with minimal change.
- A signed **Mac desktop build** is a much smaller, independent task if you want
  the Air covered sooner while the web rebuild proceeds.
