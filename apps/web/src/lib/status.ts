import type { MonitorStatus } from "@cronko/shared/types"

/** Translation key for a monitor status; keep in sync with `dashboard.*` keys. */
export function statusKey(status: string): string {
  return `dashboard.${status}`
}

export function isMonitorStatus(value: string): value is MonitorStatus {
  return ["healthy", "missed", "down", "failed", "paused", "pending"].includes(value)
}
