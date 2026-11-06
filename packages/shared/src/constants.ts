export const MONITOR_STATUS = {
  HEALTHY: "healthy",
  MISSED: "missed",
  DOWN: "down",
  FAILED: "failed",
  PAUSED: "paused",
  PENDING: "pending",
} as const

export const DEFAULT_GRACE_PERIOD_SECONDS = 120
export const DEFAULT_EXPECTED_INTERVAL_SECONDS = 86400
export const SCHEDULER_TICK_INTERVAL_MS = 10_000
export const PING_RATE_LIMIT_PER_MINUTE = 60
export const MAX_HEARTBEATS_PER_MONITOR = 500
export const HEARTBEAT_HISTORY_DAYS = 90
