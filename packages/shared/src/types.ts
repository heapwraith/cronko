import type { MONITOR_STATUS } from "./constants"

export type MonitorStatus = (typeof MONITOR_STATUS)[keyof typeof MONITOR_STATUS]

export type NotificationChannelType =
  | "discord"
  | "telegram"
  | "email"
  | "slack"
  | "webhook"
  | "ntfy"
  | "pushover"
  | "teams"
  | "pagerduty"
  | "googlechat"
  | "mattermost"
  | "rocketchat"
  | "gotify"
  | "matrix"

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
  config:
    | DiscordConfig
    | TelegramConfig
    | EmailConfig
    | WebhookConfig
    | NtfyConfig
    | PushoverConfig
    | TeamsConfig
    | PagerDutyConfig
    | GotifyConfig
    | MatrixConfig
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

/** Generic webhook: Cronko POSTs a JSON body ({ event, monitor, message, sentAt }). */
export interface WebhookConfig {
  url: string
  /** Extra request headers, one "Name: value" per line. Values are secrets. */
  headers?: string | undefined
  /** Custom body with {{placeholders}}; empty keeps the fixed JSON payload. */
  bodyTemplate?: string | undefined
}

/** ntfy.sh or a self-hosted ntfy server. */
export interface NtfyConfig {
  topic: string
  serverUrl?: string | undefined
  token?: string | undefined
}

/** Pushover: an application token and the user (or group) key to notify. */
export interface PushoverConfig {
  appToken: string
  userKey: string
}

/** Microsoft Teams "Workflows" webhook (the successor of Office 365 connectors). */
export interface TeamsConfig {
  webhookUrl: string
}

/** PagerDuty Events API v2 integration (routing) key of a service. */
export interface PagerDutyConfig {
  routingKey: string
}

/** Gotify server: the app token of an application created in its UI. */
export interface GotifyConfig {
  serverUrl: string
  appToken: string
}

/** Matrix room: homeserver base URL, an access token for the sending user, and the room id. */
export interface MatrixConfig {
  homeserverUrl: string
  accessToken: string
  roomId: string
}
