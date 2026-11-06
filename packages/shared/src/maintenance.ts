/**
 * Recurring maintenance windows: "every Sunday 02:00-04:00 (America/Sao_Paulo)".
 *
 * A window is a cron start (evaluated in its timezone, so DST is handled by the
 * schedule library) plus a duration. While one is active for a monitor, its alerts
 * are held back; state and incidents are still recorded.
 */
import { nextRun } from "./schedule"

export const MAX_WINDOW_MINUTES = 7 * 24 * 60

export type WindowTarget = "all" | "tag" | "monitor"

export interface MaintenanceWindowLike {
  schedule: string
  timezone: string
  durationMinutes: number
  target: WindowTarget
  /** The tag or the monitor id; null for "all". */
  targetValue: string | null
  enabled: boolean
}

export function appliesTo(
  w: Pick<MaintenanceWindowLike, "target" | "targetValue" | "enabled">,
  monitor: { id: string; tags?: readonly string[] | null },
): boolean {
  if (!w.enabled) return false
  if (w.target === "all") return true
  if (w.target === "tag") return !!w.targetValue && (monitor.tags ?? []).includes(w.targetValue)
  return w.targetValue === monitor.id
}

/**
 * When the window is running at `now`, the moment it ends (taking the latest start
 * that still covers `now`); otherwise null. Also returns the next start after `now`.
 */
export function windowBounds(
  w: Pick<MaintenanceWindowLike, "schedule" | "timezone" | "durationMinutes">,
  now: Date,
): { activeUntil: Date | null; nextStart: Date | null } {
  const durationMs = w.durationMinutes * 60_000
  let activeUntil: Date | null = null
  // Starts in (now - duration, now] are still running. Bounded walk: windows longer
  // than their period would otherwise loop for a long time.
  let cursor = new Date(now.getTime() - durationMs)
  for (let i = 0; i < 1000; i++) {
    const start = nextRun(w.schedule, w.timezone, cursor)
    if (!start || start.getTime() > now.getTime()) break
    activeUntil = new Date(start.getTime() + durationMs)
    cursor = start
  }
  return { activeUntil, nextStart: nextRun(w.schedule, w.timezone, now) }
}

/** The end of the maintenance covering this monitor right now, or null. */
export function activeMaintenanceUntil(
  windows: readonly MaintenanceWindowLike[],
  monitor: { id: string; tags?: readonly string[] | null },
  now: Date,
): Date | null {
  let until: Date | null = null
  for (const w of windows) {
    if (!appliesTo(w, monitor)) continue
    const { activeUntil } = windowBounds(w, now)
    if (activeUntil && (!until || activeUntil > until)) until = activeUntil
  }
  return until
}

/** Days are 0 (Sunday) to 6 (Saturday), as in cron. */
export function weeklySchedule(days: readonly number[], hour: number, minute: number): string {
  const unique = [...new Set(days)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b)
  const dow = unique.length === 7 || unique.length === 0 ? "*" : unique.join(",")
  return `${minute} ${hour} * * ${dow}`
}

/** Reads back what weeklySchedule wrote; null for any other cron form. */
export function parseWeeklySchedule(
  schedule: string,
): { days: number[]; hour: number; minute: number } | null {
  const m = schedule.trim().match(/^(\d{1,2}) (\d{1,2}) \* \* (\*|[0-6](?:,[0-6])*)$/)
  if (!m) return null
  const minute = Number(m[1])
  const hour = Number(m[2])
  if (minute > 59 || hour > 23) return null
  const days = m[3] === "*" ? [0, 1, 2, 3, 4, 5, 6] : (m[3] ?? "").split(",").map(Number)
  return { days, hour, minute }
}
