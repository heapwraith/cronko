import {
  createHeartbeat,
  findLatestHeartbeat,
  updateHeartbeatDuration,
} from "@cronko/database/queries/heartbeats"
import { findMonitorByToken } from "@cronko/database/queries/monitors"
import { logger } from "../lib/logger"
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

  if (
    options.pulseType === "finish" &&
    options.durationMs !== undefined &&
    options.durationMs !== null
  ) {
    if (prevPulse && prevPulse.durationMs === null) {
      await updateHeartbeatDuration(prevPulse.id, options.durationMs)
      await createHeartbeat({
        id: heartbeatId,
        monitorId: monitor.id,
        ...(options.sourceIp !== undefined && { sourceIp: options.sourceIp }),
        ...(options.userAgent !== undefined && { userAgent: options.userAgent }),
        durationMs: options.durationMs,
        ...(options.exitCode !== undefined && { exitCode: options.exitCode }),
        body: options.body ?? "pulse:finish",
        kind: "finish",
        // The finish row is what the UI shows for the run, so it carries the flag too.
        overlapped: prevPulse.overlapped,
      })
      stored = true
    }
  } else {
    await createHeartbeat({
      id: heartbeatId,
      monitorId: monitor.id,
      ...(options.sourceIp !== undefined && { sourceIp: options.sourceIp }),
      ...(options.userAgent !== undefined && { userAgent: options.userAgent }),
      ...(options.durationMs !== undefined && { durationMs: options.durationMs }),
      ...(options.exitCode !== undefined && { exitCode: options.exitCode }),
      ...(options.body !== undefined && { body: options.body }),
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
      options.durationMs != null &&
      monitor.maxDurationMs != null &&
      options.durationMs > monitor.maxDurationMs

    const runId = stored ? heartbeatId : undefined
    if (failed) {
      await markFailed(monitor, options.exitCode, new Date(), runId)
    } else if (exceededMax) {
      await markSlow(monitor, new Date(), runId)
    } else {
      await recoverOnPing(monitor)
    }
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
