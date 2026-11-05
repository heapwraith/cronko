import { findAllMonitors } from "@cronko/database/queries/monitors"
import { findLatestHeartbeatTimes, deleteHeartbeatsOlderThan } from "@cronko/database/queries/heartbeats"
import { evaluateMonitor, markOverdue } from "./monitor-state"
import { currentSettings } from "../routes/settings"
import { logger } from "../lib/logger"

let intervalId: ReturnType<typeof setInterval> | null = null
let isRunning = false
let lastCleanupDay = -1

export const schedulerMetrics = {
  lastTickAt: 0,
  lastTickDurationMs: 0,
  tickErrors: 0,
  monitorsChecked: 0,
}

async function cleanupOldHeartbeats() {
  const today = new Date().getDate()
  if (today === lastCleanupDay) return
  lastCleanupDay = today

  try {
    const retentionDays = currentSettings.heartbeatHistoryDays
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)
    await deleteHeartbeatsOlderThan(cutoff)
    logger.info({ retentionDays }, "heartbeat cleanup completed")
  } catch (err) {
    logger.error({ err }, "heartbeat cleanup failed")
  }
}

/** (Re)arm the tick timer using the current tick interval setting. */
function arm() {
  if (intervalId) clearInterval(intervalId)
  intervalId = setInterval(runTick, currentSettings.schedulerTickMs)
}

export function startScheduler() {
  arm()
  void runTick()
}

export function restartScheduler() {
  arm()
}

export function stopScheduler() {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}

/** One scheduler pass. Exported for tests; production uses the timer. */
export async function runTick(now = Date.now()) {
  if (isRunning) return
  isRunning = true

  const start = Date.now()

  try {
    await cleanupOldHeartbeats()

    const [allMonitors, lastPings] = await Promise.all([
      findAllMonitors(),
      findLatestHeartbeatTimes(),
    ])
    const activeMonitors = allMonitors.filter((m) => !m.paused)

    schedulerMetrics.monitorsChecked = activeMonitors.length

    for (const monitor of activeMonitors) {
      try {
        const target = evaluateMonitor(monitor, lastPings.get(monitor.id), now)
        if (target) await markOverdue(monitor, target, new Date(now))
      } catch (err) {
        schedulerMetrics.tickErrors++
        logger.error({ err, monitorId: monitor.id, monitorName: monitor.name }, "scheduler check failed")
      }
    }
  } finally {
    schedulerMetrics.lastTickDurationMs = Date.now() - start
    schedulerMetrics.lastTickAt = Date.now()
    isRunning = false
  }
}
