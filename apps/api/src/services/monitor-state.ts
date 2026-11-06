import {
  createIncident,
  findOpenIncident,
  resolveIncident,
} from "@cronko/database/queries/incidents"
import { transitionMonitorStatus } from "@cronko/database/queries/monitors"
import { nextRun } from "@cronko/shared/schedule"
import { sendNotification } from "./notifier"

export type MonitorStatus = "healthy" | "missed" | "down" | "failed" | "paused" | "pending"

export interface MonitorSnapshot {
  id: string
  name: string
  status: MonitorStatus
  expectedIntervalSeconds: number
  gracePeriodSeconds: number
  createdAt: Date
  /** Optional cron schedule; when set it replaces "last ping + interval". */
  scheduleCron?: string | null
  timezone?: string | null
}

export type ScheduleFields = Pick<
  MonitorSnapshot,
  "expectedIntervalSeconds" | "gracePeriodSeconds" | "createdAt" | "scheduleCron" | "timezone"
>

export interface ExpectedWindow {
  /** When the next ping is due (the scheduled run, or last ping + interval). */
  nextExpected: Date
  /** After this instant the monitor is "missed" (due + grace). */
  missedAt: number
  /** After this instant the monitor is "down" (missed + one period). */
  downAt: number
}

/**
 * Deadlines for a monitor. Interval monitors count from the last ping; cron
 * monitors count from the next scheduled run after it. A ping that lands up to
 * one grace period (at most half a period) before a slot counts as that slot's
 * ping, so a job that reports a few seconds early is not flagged as late.
 */
export function expectedWindow(m: ScheduleFields, lastPingAt: Date | undefined): ExpectedWindow {
  const base = (lastPingAt ?? m.createdAt).getTime()
  const grace = m.gracePeriodSeconds * 1000

  if (m.scheduleCron) {
    let slot = nextRun(m.scheduleCron, m.timezone, new Date(base))
    let following = slot ? nextRun(m.scheduleCron, m.timezone, slot) : null
    if (slot && following) {
      let period = following.getTime() - slot.getTime()
      if (lastPingAt && slot.getTime() - base <= Math.min(grace, period / 2)) {
        slot = following
        following = nextRun(m.scheduleCron, m.timezone, slot)
        period = following ? following.getTime() - slot.getTime() : period
      }
      const missedAt = slot.getTime() + grace
      return { nextExpected: slot, missedAt, downAt: missedAt + period }
    }
  }

  const interval = m.expectedIntervalSeconds * 1000
  const missedAt = base + interval + grace
  return { nextExpected: new Date(base + interval), missedAt, downAt: missedAt + interval }
}

/**
 * Decide what the scheduler should do for a monitor. Pure: no I/O.
 *
 *   due ──grace──▶ missed ──one period──▶ down
 *
 * Recovery is not decided here: it happens when a ping arrives (see
 * recoverOnPing), never by the clock.
 */
export function evaluateMonitor(
  monitor: MonitorSnapshot,
  lastPingAt: Date | undefined,
  now: number,
): "missed" | "down" | null {
  // A failed run was already reported; it stays failed until a good ping arrives.
  if (monitor.status === "paused" || monitor.status === "failed") return null

  const { missedAt, downAt } = expectedWindow(monitor, lastPingAt)

  if (now <= missedAt) return null
  if (now > downAt) return monitor.status === "down" ? null : "down"
  // Only a monitor that was healthy is "missed"; a never-pinged (pending)
  // monitor stays pending until it is overdue enough to be down.
  return monitor.status === "healthy" ? "missed" : null
}

async function openIncidentOnce(monitorId: string, startedAt: Date) {
  const open = await findOpenIncident(monitorId)
  if (open) return
  await createIncident({ id: crypto.randomUUID(), monitorId, startedAt })
}

/**
 * Move a monitor to missed/down. The status change is a compare-and-set on the
 * status we observed, so when the scheduler and a ping (or two replicas) race,
 * exactly one caller wins and sends the incident and alert.
 */
export async function markOverdue(
  monitor: MonitorSnapshot,
  target: "missed" | "down",
  now = new Date(),
): Promise<boolean> {
  const won = await transitionMonitorStatus(monitor.id, monitor.status, target)
  if (!won) return false

  await openIncidentOnce(monitor.id, now)
  await sendNotification({ name: monitor.name }, target)
  return true
}

/**
 * The job ran and reported failure (explicit /fail, or a non-zero exit code).
 * Alerts immediately instead of waiting for the deadline; repeated failures
 * while already failed do not re-alert.
 */
export async function markFailed(
  monitor: Pick<MonitorSnapshot, "id" | "name" | "status">,
  exitCode?: number,
  now = new Date(),
): Promise<boolean> {
  if (monitor.status === "failed" || monitor.status === "paused") return false

  const won = await transitionMonitorStatus(monitor.id, monitor.status, "failed")
  if (!won) return false

  await openIncidentOnce(monitor.id, now)
  await sendNotification(
    { name: monitor.name },
    "failed",
    exitCode !== undefined ? `exit code ${exitCode}` : undefined,
  )
  return true
}

/** A job ran longer than its configured max duration. */
export async function markSlow(
  monitor: Pick<MonitorSnapshot, "id" | "name" | "status">,
  now = new Date(),
): Promise<boolean> {
  if (monitor.status !== "healthy") return false

  const won = await transitionMonitorStatus(monitor.id, "healthy", "missed")
  if (!won) return false

  await openIncidentOnce(monitor.id, now)
  await sendNotification({ name: monitor.name }, "slow")
  return true
}

/**
 * A good ping arrived. Bring the monitor back to healthy, close its incident,
 * and tell the user — but only when it had actually been reported as a problem
 * (a first ping on a pending monitor is not a "recovery").
 */
export async function recoverOnPing(
  monitor: Pick<MonitorSnapshot, "id" | "name" | "status">,
  now = new Date(),
): Promise<boolean> {
  const recoverable = ["missed", "down", "failed", "pending"]
  if (!recoverable.includes(monitor.status)) return false

  const won = await transitionMonitorStatus(monitor.id, monitor.status, "healthy")
  if (!won) return false

  const open = await findOpenIncident(monitor.id)
  if (open) await resolveIncident(open.id, now)

  if (monitor.status !== "pending") {
    await sendNotification({ name: monitor.name }, "recovered")
  }
  return true
}
