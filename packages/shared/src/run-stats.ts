/**
 * Run duration analytics, shared by the API and the web app so both sides agree.
 *
 * A "run sample" is a heartbeat that carries a duration and is not the start half
 * of a /start + /finish pair (the finish row carries the same run), so each run is
 * counted once.
 */

export interface DurationStats {
  /** Number of runs the figures are based on. */
  count: number
  p50: number
  p95: number
  max: number
}

/** Runs a baseline needs before Cronko calls anything "unusual". */
export const MIN_BASELINE_RUNS = 5
/** How many earlier runs form the baseline. */
export const BASELINE_RUNS = 100

/** Nearest-rank percentile of an ascending array (p in 0..1). */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0
  const rank = Math.ceil(p * sorted.length)
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1] ?? 0
}

export function durationStats(durations: readonly number[]): DurationStats | null {
  const valid = durations.filter((d) => Number.isFinite(d) && d >= 0)
  if (valid.length === 0) return null
  const sorted = [...valid].sort((a, b) => a - b)
  return {
    count: sorted.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted[sorted.length - 1] ?? 0,
  }
}

export function isRunSample(row: { durationMs: number | null; kind?: string | null }): boolean {
  return row.durationMs != null && row.kind !== "start"
}

/**
 * True when a run took clearly longer than usual. All conditions must hold, so a
 * noisy job or a short history does not produce false alarms:
 * - at least MIN_BASELINE_RUNS earlier runs;
 * - more than 1.5 × the p95 of those runs;
 * - at least 2 × their median;
 * - at least 5 s more than the median (2 s → 5 s is not worth a flag).
 */
export function isUnusuallySlow(
  durationMs: number | null,
  baseline: DurationStats | null,
): boolean {
  if (durationMs == null || !baseline || baseline.count < MIN_BASELINE_RUNS) return false
  return (
    durationMs > baseline.p95 * 1.5 &&
    durationMs >= baseline.p50 * 2 &&
    durationMs - baseline.p50 >= 5_000
  )
}

/** How many times the median a run took, rounded to one decimal (null without a baseline). */
export function slowFactor(
  durationMs: number | null,
  baseline: DurationStats | null,
): number | null {
  if (durationMs == null || !baseline || baseline.p50 <= 0) return null
  return Math.round((durationMs / baseline.p50) * 10) / 10
}
