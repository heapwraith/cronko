import { getSetting, setSetting } from "@cronko/database/queries/settings"
import {
  DEFAULT_EXPECTED_INTERVAL_SECONDS,
  DEFAULT_GRACE_PERIOD_SECONDS,
  HEARTBEAT_HISTORY_DAYS,
  MAX_HEARTBEATS_PER_MONITOR,
  PING_RATE_LIMIT_PER_MINUTE,
  SCHEDULER_TICK_INTERVAL_MS,
} from "@cronko/shared/constants"
import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { z } from "zod"
import { logAuditEvent } from "../services/audit"
import { restartScheduler } from "../services/scheduler"

export const settingsRoute = new Hono()

const updateSettingsSchema = z.object({
  instanceName: z.string().min(1).max(100).optional(),
  timezone: z.string().min(1).optional(),
  schedulerTickMs: z.number().int().min(1000).max(120_000).optional(),
  defaultGracePeriodSeconds: z.number().int().min(0).max(86_400).optional(),
  defaultIntervalSeconds: z.number().int().min(10).max(31_536_000).optional(),
  pingRateLimitPerMinute: z.number().int().min(1).max(600).optional(),
  maxHeartbeatsPerMonitor: z.number().int().min(10).max(10_000).optional(),
  heartbeatHistoryDays: z.number().int().min(1).max(365).optional(),
})

export const currentSettings = {
  schedulerTickMs: SCHEDULER_TICK_INTERVAL_MS,
  defaultGracePeriodSeconds: DEFAULT_GRACE_PERIOD_SECONDS,
  defaultIntervalSeconds: DEFAULT_EXPECTED_INTERVAL_SECONDS,
  pingRateLimitPerMinute: PING_RATE_LIMIT_PER_MINUTE,
  maxHeartbeatsPerMonitor: MAX_HEARTBEATS_PER_MONITOR,
  heartbeatHistoryDays: HEARTBEAT_HISTORY_DAYS,
}

export function updateCurrentSettings(updates: Partial<typeof currentSettings>) {
  Object.assign(currentSettings, updates)
  settingsCache = null
  settingsCacheAt = 0
}

interface CachedSettings {
  instanceName: string
  timezone: string
  schedulerTickMs: number
  defaultGracePeriodSeconds: number
  defaultIntervalSeconds: number
  pingRateLimitPerMinute: number
  maxHeartbeatsPerMonitor: number
  heartbeatHistoryDays: number
}

let settingsCache: CachedSettings | null = null
let settingsCacheAt = 0
const SETTINGS_CACHE_TTL_MS = 30_000 // 30 seconds

async function loadSettings(): Promise<CachedSettings> {
  if (settingsCache && Date.now() - settingsCacheAt < SETTINGS_CACHE_TTL_MS) {
    return settingsCache
  }

  const raw = {
    instanceName: await getSetting("instanceName"),
    timezone: await getSetting("timezone"),
    schedulerTickMs: await getSetting("schedulerTickMs"),
    defaultGracePeriodSeconds: await getSetting("defaultGracePeriodSeconds"),
    defaultIntervalSeconds: await getSetting("defaultIntervalSeconds"),
    pingRateLimitPerMinute: await getSetting("pingRateLimitPerMinute"),
    maxHeartbeatsPerMonitor: await getSetting("maxHeartbeatsPerMonitor"),
    heartbeatHistoryDays: await getSetting("heartbeatHistoryDays"),
  }

  const parsed = {
    instanceName: raw.instanceName ?? "Cronko",
    timezone: raw.timezone ?? "UTC",
    schedulerTickMs: raw.schedulerTickMs
      ? parseInt(raw.schedulerTickMs, 10)
      : SCHEDULER_TICK_INTERVAL_MS,
    defaultGracePeriodSeconds: raw.defaultGracePeriodSeconds
      ? parseInt(raw.defaultGracePeriodSeconds, 10)
      : DEFAULT_GRACE_PERIOD_SECONDS,
    defaultIntervalSeconds: raw.defaultIntervalSeconds
      ? parseInt(raw.defaultIntervalSeconds, 10)
      : DEFAULT_EXPECTED_INTERVAL_SECONDS,
    pingRateLimitPerMinute: raw.pingRateLimitPerMinute
      ? parseInt(raw.pingRateLimitPerMinute, 10)
      : PING_RATE_LIMIT_PER_MINUTE,
    maxHeartbeatsPerMonitor: raw.maxHeartbeatsPerMonitor
      ? parseInt(raw.maxHeartbeatsPerMonitor, 10)
      : MAX_HEARTBEATS_PER_MONITOR,
    heartbeatHistoryDays: raw.heartbeatHistoryDays
      ? parseInt(raw.heartbeatHistoryDays, 10)
      : HEARTBEAT_HISTORY_DAYS,
  }

  updateCurrentSettings(parsed)
  settingsCache = parsed
  settingsCacheAt = Date.now()
  return parsed
}

settingsRoute.get("/", async (c) => {
  const data = await loadSettings()
  return c.json({ data })
})

settingsRoute.post("/", zValidator("json", updateSettingsSchema), async (c) => {
  const body = c.req.valid("json")
  let schedulerChanged = false

  if (body.instanceName !== undefined) await setSetting("instanceName", body.instanceName)
  if (body.timezone !== undefined) await setSetting("timezone", body.timezone)
  if (body.schedulerTickMs !== undefined) {
    await setSetting("schedulerTickMs", String(body.schedulerTickMs))
    schedulerChanged = true
  }
  if (body.defaultGracePeriodSeconds !== undefined)
    await setSetting("defaultGracePeriodSeconds", String(body.defaultGracePeriodSeconds))
  if (body.defaultIntervalSeconds !== undefined)
    await setSetting("defaultIntervalSeconds", String(body.defaultIntervalSeconds))
  if (body.pingRateLimitPerMinute !== undefined)
    await setSetting("pingRateLimitPerMinute", String(body.pingRateLimitPerMinute))
  if (body.maxHeartbeatsPerMonitor !== undefined)
    await setSetting("maxHeartbeatsPerMonitor", String(body.maxHeartbeatsPerMonitor))
  if (body.heartbeatHistoryDays !== undefined)
    await setSetting("heartbeatHistoryDays", String(body.heartbeatHistoryDays))

  const data = await loadSettings()

  if (schedulerChanged) {
    restartScheduler()
  }

  logAuditEvent({
    userId: (c.get("jwtPayload") as { sub: string })?.sub,
    action: "settings.updated",
    resourceType: "settings",
    metadata: body as Record<string, unknown>,
  }).catch(() => {})

  return c.json({ data })
})
