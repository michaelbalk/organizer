import { Notification, BrowserWindow } from 'electron'
import { getStore } from './store'
import { listCalendarEvents } from './google/calendar'

/**
 * Lightweight reminder service: a 60s tick checks local tasks (cheap) and, every
 * ~5 minutes, refreshes today's calendar events, firing native notifications a
 * few minutes before tasks are due and meetings start. A fired-key set dedupes
 * so each reminder shows once per session.
 */
const LEAD_MIN = 10
const fired = new Set<string>()
let cachedMeetings: { id: string; title: string; startMs: number }[] = []
let lastCalFetch = 0
let timer: ReturnType<typeof setInterval> | null = null

export function startReminders(): void {
  if (timer) return
  timer = setInterval(() => void tick(), 60_000)
  // First pass shortly after launch, once the window is up.
  setTimeout(() => void tick(), 15_000)
}

export function stopReminders(): void {
  if (timer) clearInterval(timer)
  timer = null
}

async function tick(): Promise<void> {
  const now = Date.now()
  checkTasks(now)
  await checkMeetings(now)
}

function checkTasks(now: number): void {
  for (const t of getStore().getData().tasks) {
    if (t.status === 'done' || !t.dueDate) continue
    const dueMs = new Date(`${t.dueDate}T${t.dueTime ?? '09:00'}`).getTime()
    if (Number.isNaN(dueMs)) continue
    const mins = (dueMs - now) / 60000
    if (t.dueTime && mins > 0 && mins <= LEAD_MIN) {
      notify(`task-soon-${t.id}-${dueMs}`, 'Task due soon', `${t.title} — in ${Math.round(mins)} min`)
    }
    // Due now (fire once as it crosses, within a 2h trailing window).
    // Only for timed tasks — an all-day task shouldn't buzz at the 09:00 default.
    if (t.dueTime && mins <= 0 && mins > -120) {
      notify(`task-due-${t.id}-${dueMs}`, 'Task due', t.title)
    }
  }
}

async function checkMeetings(now: number): Promise<void> {
  if (now - lastCalFetch > 5 * 60_000) {
    try {
      const res = await listCalendarEvents(0)
      cachedMeetings = res.events
        .filter((e) => !e.allDay)
        .map((e) => ({ id: e.id, title: e.title, startMs: new Date(e.start).getTime() }))
      lastCalFetch = now
    } catch {
      /* try again next cycle */
    }
  }
  for (const m of cachedMeetings) {
    const mins = (m.startMs - now) / 60000
    if (mins > 0 && mins <= LEAD_MIN) {
      notify(`meeting-${m.id}-${m.startMs}`, 'Meeting soon', `${m.title} — in ${Math.round(mins)} min`)
    }
  }
}

function notify(key: string, title: string, body: string): void {
  if (fired.has(key)) return
  fired.add(key)
  if (!Notification.isSupported()) return
  const n = new Notification({ title, body })
  n.on('click', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
  })
  n.show()
}
