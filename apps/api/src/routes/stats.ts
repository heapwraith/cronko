import { findHeartbeatsSince } from "@cronko/database/queries/heartbeats"
import { findAllMonitors } from "@cronko/database/queries/monitors"
import type { Heartbeat } from "@cronko/shared"
import { calculateUptime } from "@cronko/shared/utils"
import { Hono } from "hono"
import { logger } from "../lib/logger"

export const statsRoute = new Hono()

statsRoute.get("/", async (c) => {
  try {
    const monitors = await findAllMonitors()

    let healthyCount = 0
    let downCount = 0
    let missedCount = 0
    let failedCount = 0
    let pausedCount = 0

    for (const m of monitors) {
      if (m.status === "healthy") healthyCount++
      else if (m.status === "down") downCount++
      else if (m.status === "missed") missedCount++
      else if (m.status === "failed") failedCount++
      else if (m.status === "paused") pausedCount++
    }

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const recentHeartbeats = await findHeartbeatsSince(twentyFourHoursAgo)

    // Exclude heartbeats from paused monitors
    const pausedIds = new Set(
      monitors
        .filter((m: { status: string }) => m.status === "paused")
        .map((m: { id: string }) => m.id),
    )
    const activeHeartbeats = recentHeartbeats.filter(
      (hb: { monitorId: string }) => !pausedIds.has(hb.monitorId),
    )

    const totalHeartbeats = activeHeartbeats.length

    let uptimeTotal = 0
    let monitorsWithHeartbeats = 0

    for (const monitor of monitors) {
      // Skip paused monitors — they are not expected to receive heartbeats
      if (monitor.status === "paused") continue

      const monitorHeartbeats = activeHeartbeats.filter(
        (hb: { monitorId: string }) => hb.monitorId === monitor.id,
      )

      const uptime = calculateUptime(monitorHeartbeats as unknown as Heartbeat[], {
        expectedIntervalSeconds: monitor.expectedIntervalSeconds,
      })
      uptimeTotal += uptime
      monitorsWithHeartbeats++
    }

    const uptimePercent =
      monitorsWithHeartbeats > 0
        ? Math.round((uptimeTotal / monitorsWithHeartbeats) * 100) / 100
        : 0

    const heartbeatsByHour = Array.from({ length: 24 }, (_, i) => {
      const hourStart = new Date(twentyFourHoursAgo.getTime() + i * 60 * 60 * 1000)
      const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000)
      return activeHeartbeats.filter(
        (hb: { receivedAt: Date }) => hb.receivedAt >= hourStart && hb.receivedAt < hourEnd,
      ).length
    })

    return c.json({
      data: {
        healthyCount,
        downCount,
        missedCount,
        failedCount,
        pausedCount,
        totalHeartbeats,
        uptimePercent,
        heartbeatsByHour,
      },
    })
  } catch (err) {
    logger.error({ err }, "stats route error")
    return c.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, 500)
  }
})
