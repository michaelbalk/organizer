import type { Task } from './types'

/**
 * Single source of truth for "overdue", shared by the board, calendar, today
 * view, and CRM so they never disagree. A date-only due is treated as
 * end-of-day (overdue only after the day passes); a timed due uses that time.
 */
export function isTaskOverdue(
  task: Pick<Task, 'dueDate' | 'dueTime' | 'status'>,
  now: Date = new Date()
): boolean {
  if (!task.dueDate || task.status === 'done') return false
  const due = new Date(`${task.dueDate}T${task.dueTime || '23:59'}`)
  return due.getTime() < now.getTime()
}
