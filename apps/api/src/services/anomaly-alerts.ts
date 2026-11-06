import { findRunSamples } from "@cronko/database/queries/heartbeats"
import { BASELINE_RUNS, durationStats, isUnusuallySlow, slowFactor } from "@cronko/shared/run-stats"
import { logger } from "../lib/logger"
import { sendNotification } from "./notifier"

type Monitor = { id: string; name: string; alertOnAnomalies: boolean }

type StoredRun = {
  id: string
  kind: "start" | "finish" | null
  durationMs: number | null
  receivedAt: Date
  overlapped: boolean
  /** The run already raised a failed or max-duration alert; do not pile on. */
  alreadyAlerted: boolean
}

/** Exact enough for an alert: "41.2 s", "2 min 30 s", "1 h 05 min". */
export function humanDuration(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`
  const totalS = Math.round(ms / 1000)
  const m = Math.floor(totalS / 60)
  if (m < 60) return `${m} min ${String(totalS % 60).padStart(2, "0")} s`
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`
}

/**
 * Opt-in alerts for analytics findings. They are informative: they change neither
 * the monitor's state nor its incidents, and they never throw into the ping path.
 */
export async function alertOnRunAnomalies(monitor: Monitor, run: StoredRun): Promise<void> {
  if (!monitor.alertOnAnomalies) return
  const target = { id: monitor.id, name: monitor.name }
  const link = `/monitors/${monitor.id}/runs/${run.id}`

  try {
    // Only the start reports the overlap; its finish row carries the flag too.
    if (run.kind === "start") {
      if (run.overlapped) await sendNotification(target, "overlap", undefined, link)
      return
    }

    if (run.alreadyAlerted || run.durationMs == null) return
    const earlier = await findRunSamples(monitor.id, {
      limit: BASELINE_RUNS,
      before: run.receivedAt,
    })
    const baseline = durationStats(earlier.map((s) => s.durationMs))
    if (!isUnusuallySlow(run.durationMs, baseline) || !baseline) return

    const factor = slowFactor(run.durationMs, baseline)
    await sendNotification(
      target,
      "unusual",
      `${humanDuration(run.durationMs)}, ${factor}× a mediana de ${humanDuration(baseline.p50)}`,
      link,
    )
  } catch (err) {
    logger.error({ err, monitor: monitor.name }, "anomaly alert check failed")
  }
}
