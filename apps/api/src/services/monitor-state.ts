import {
  createIncident,
  findOpenIncident,
  resolveIncident,
} from "@cronko/database/queries/incidents"
import { transitionMonitorStatus } from "@cronko/database/queries/monitors"
import { sendNotification } from "./notifier"

export type MonitorStatus = "healthy" | "missed" | "down" | "failed" | "paused" | "pending"

export interface MonitorSnapshot {
  id: string
  name: string
  status: MonitorStatus
  expectedIntervalSeconds: number
  gracePeriodSeconds: number
  createdAt: Date
}

/**
 * Decide what the scheduler should do for a monitor. Pure: no I/O.
 *
 *   last ping (or creation) ──interval+grace──▶ missed ──interval──▶ down
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

  const base = (lastPingAt ?? monitor.createdAt).getTime()
  const missedAt = base + (monitor.expectedIntervalSeconds + monitor.gracePeriodSeconds) * 1000
  const downAt = missedAt + monitor.expectedIntervalSeconds * 1000

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
