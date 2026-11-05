import type { MONITOR_STATUS } from "./constants"

export type MonitorStatus = (typeof MONITOR_STATUS)[keyof typeof MONITOR_STATUS]

export type NotificationChannelType = "discord" | "telegram" | "email" | "slack"

export type IncidentStatus = "open" | "resolved"

export interface Monitor {
  id: string
  name: string
  slug: string
  token: string
  status: MonitorStatus
  expectedIntervalSeconds: number
  gracePeriodSeconds: number
  paused: boolean
  createdAt: Date
  updatedAt: Date
}

export interface Heartbeat {
  id: string
  monitorId: string
  receivedAt: Date
  sourceIp: string | null
  userAgent: string | null
  durationMs: number | null
  exitCode: number | null
}

export interface Incident {
  id: string
  monitorId: string
  status: IncidentStatus
  startedAt: Date
  resolvedAt: Date | null
}

export interface NotificationChannel {
  id: string
  name: string
  type: NotificationChannelType
  enabled: boolean
  config: DiscordConfig | TelegramConfig | EmailConfig
  createdAt: Date
}

export interface DiscordConfig {
  webhookUrl: string
}

export interface TelegramConfig {
  botToken: string
  chatId: string
}

export interface EmailConfig {
  to: string
}
