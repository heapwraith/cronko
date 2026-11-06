import type { MonitorStatus } from "@cronko/shared/types"

/** Compact interval label: 45 s, 30 min, 6 h, 2 d. */
export function formatInterval(seconds: number): string {
  if (seconds < 60) return `${seconds} s`
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`
  if (seconds < 86_400) return `${Math.round((seconds / 3600) * 10) / 10} h`.replace(".0", "")
  return `${Math.round((seconds / 86_400) * 10) / 10} d`.replace(".0", "")
}

/** Exit code and duration read like board figures: compact, tabular. */
export function formatRunDuration(ms: number | null | undefined): string {
  if (ms == null) return "—"
  if (ms < 1000) return `${Math.round(ms)} ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min ${String(Math.floor(s % 60)).padStart(2, "0")} s`
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`
}

const SEVERITY: Record<MonitorStatus, number> = {
  failed: 0,
  down: 1,
  missed: 2,
  pending: 3,
  healthy: 4,
  paused: 5,
}

export function severityRank(status: string): number {
  return SEVERITY[status as MonitorStatus] ?? 3
}

export const ATTENTION: ReadonlySet<string> = new Set(["failed", "down", "missed"])
