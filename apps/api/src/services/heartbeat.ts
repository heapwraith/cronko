import {
  createHeartbeat,
  findLatestHeartbeat,
  updateHeartbeatDuration,
} from "@cronko/database/queries/heartbeats"
import { findMonitorByToken } from "@cronko/database/queries/monitors"
import { logger } from "../lib/logger"
import { alertOnRunAnomalies } from "./anomaly-alerts"
import { markFailed, markSlow, recoverOnPing } from "./monitor-state"

export async function processHeartbeat(
  token: string,
  options: {
    sourceIp?: string
    userAgent?: string
    durationMs?: number
    exitCode?: number
    body?: string
    pulseType?: "start" | "finish"
    /** Explicit failure signal (/fail). A non-zero exit code also counts. */
    failed?: boolean
  },
) {
  const monitor = await findMonitorByToken(token)

  if (!monitor) {
    return { ok: false, status: 404, error: "Monitor not found" }
  }

  if (monitor.paused) {
    return { ok: true, data: { status: "paused" } }
  }

  const heartbeatId = crypto.randomUUID()
  let stored = false

  const prevPulse = await findLatestHeartbeat(monitor.id)
  const now = new Date()

  // A start while the previous start never reported its finish means two runs overlap.
  // Past two intervals the old start is treated as abandoned (crashed), not running.
  const overlapped =
    options.pulseType === "start" &&
    prevPulse?.kind === "start" &&
    prevPulse.durationMs === null &&
    now.getTime() - prevPulse.receivedAt.getTime() < monitor.expectedIntervalSeconds * 2_000
  if (overlapped) {
    logger.warn({ monitor: monitor.name }, "run started while the previous run was still open")
  }

  // The /start this /finish closes, if one is still open.
  const openStart =
    options.pulseType === "finish" && prevPulse?.kind === "start" && prevPulse.durationMs === null
      ? prevPulse
      : null
  // Without ?d=, a /finish is timed from its /start.
  const durationMs =
    options.durationMs ??
    (openStart ? Math.max(0, now.getTime() - openStart.receivedAt.getTime()) : undefined)

  if (openStart && durationMs !== undefined) {
    await updateHeartbeatDuration(openStart.id, durationMs)
    await createHeartbeat({
      id: heartbeatId,
      monitorId: monitor.id,
      ...(options.sourceIp !== undefined && { sourceIp: options.sourceIp }),
      ...(options.userAgent !== undefined && { userAgent: options.userAgent }),
      durationMs,
      ...(options.exitCode !== undefined && { exitCode: options.exitCode }),
      body: options.body ?? "pulse:finish",
      receivedAt: now,
      kind: "finish",
      // The finish row is what the UI shows for the run, so it carries the flag too.
      overlapped: openStart.overlapped,
    })
    stored = true
  } else {
    // A plain ping, a /start, or a /finish with no open /start (kept as a plain run).
    await createHeartbeat({
      id: heartbeatId,
      monitorId: monitor.id,
      ...(options.sourceIp !== undefined && { sourceIp: options.sourceIp }),
      ...(options.userAgent !== undefined && { userAgent: options.userAgent }),
      ...(durationMs !== undefined && { durationMs }),
      ...(options.exitCode !== undefined && { exitCode: options.exitCode }),
      ...(options.body !== undefined && { body: options.body }),
      receivedAt: now,
      ...(options.pulseType === "start" && { kind: "start" as const }),
      ...(overlapped && { overlapped: true }),
    })
    stored = true
  }

  // A start pulse only says the job began: it must not recover or fail anything.
  if (options.pulseType !== "start") {
    const failed =
      options.failed === true || (options.exitCode !== undefined && options.exitCode !== 0)
    const exceededMax =
      durationMs != null && monitor.maxDurationMs != null && durationMs > monitor.maxDurationMs

    const runId = stored ? heartbeatId : undefined
    if (failed) {
      await markFailed(monitor, options.exitCode, new Date(), runId)
    } else if (exceededMax) {
      await markSlow(monitor, new Date(), runId)
    } else {
      await recoverOnPing(monitor)
    }

    if (stored) {
      await alertOnRunAnomalies(monitor, {
        id: heartbeatId,
        kind: openStart ? "finish" : null,
        durationMs: durationMs ?? null,
        receivedAt: now,
        overlapped: false,
        alreadyAlerted: failed || exceededMax,
      })
    }
  } else if (stored) {
    await alertOnRunAnomalies(monitor, {
      id: heartbeatId,
      kind: "start",
      durationMs: null,
      receivedAt: now,
      overlapped,
      alreadyAlerted: false,
    })
  }

  return {
    ok: true,
    data: {
      ok: true,
      monitorId: monitor.id,
      receivedAt: prevPulse?.receivedAt.toISOString() ?? new Date().toISOString(),
    },
  }
}
