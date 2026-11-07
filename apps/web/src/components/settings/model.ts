import type { DigestFrequency } from "@cronko/shared/digest"

export type SettingsData = {
  instanceName: string
  timezone: string
  schedulerTickMs: number
  defaultGracePeriodSeconds: number
  defaultIntervalSeconds: number
  pingRateLimitPerMinute: number
  maxHeartbeatsPerMonitor: number
  heartbeatHistoryDays: number
  digestFrequency: DigestFrequency
  digestHour: number
}

export const DEFAULTS: SettingsData = {
  instanceName: "Cronko",
  timezone: "UTC",
  schedulerTickMs: 10000,
  defaultGracePeriodSeconds: 120,
  defaultIntervalSeconds: 86400,
  pingRateLimitPerMinute: 60,
  maxHeartbeatsPerMonitor: 500,
  heartbeatHistoryDays: 90,
  digestFrequency: "off",
  digestHour: 9,
}

export const HOURS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`)
