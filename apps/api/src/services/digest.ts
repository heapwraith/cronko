import { findRunOutcomesBetween } from "@cronko/database/queries/heartbeats"
import { findIncidentsOverlapping } from "@cronko/database/queries/incidents"
import { findAllMonitors } from "@cronko/database/queries/monitors"
import { getSetting, setSetting } from "@cronko/database/queries/settings"
import {
  buildDigest,
  DIGEST_FREQUENCIES,
  type DigestFrequency,
  digestDue,
  digestPeriodMs,
} from "@cronko/shared/digest"
import { logger } from "../lib/logger"
import { appLink, broadcast } from "./notifier"

export const DIGEST_DEFAULT_HOUR = 9
const LAST_SENT_KEY = "digestLastSentAt"

export interface DigestConfig {
  frequency: DigestFrequency
  hour: number
  timezone: string
  instanceName: string
}

export async function loadDigestConfig(): Promise<DigestConfig> {
  const [frequency, hour, timezone, instanceName] = await Promise.all([
    getSetting("digestFrequency"),
    getSetting("digestHour"),
    getSetting("timezone"),
    getSetting("instanceName"),
  ])
  const h = hour === null ? DIGEST_DEFAULT_HOUR : Number.parseInt(hour, 10)
  return {
    frequency: DIGEST_FREQUENCIES.includes(frequency as DigestFrequency)
      ? (frequency as DigestFrequency)
      : "off",
    hour: Number.isInteger(h) && h >= 0 && h <= 23 ? h : DIGEST_DEFAULT_HOUR,
    timezone: timezone ?? "UTC",
    instanceName: instanceName ?? "Cronko",
  }
}

/** Start counting from now, so turning the digest on never sends one for a past slot. */
export async function resetDigestClock(now = new Date()) {
  await setSetting(LAST_SENT_KEY, String(now.getTime()))
}

/** Build the digest for the period ending at `to` and queue it on every channel. */
export async function sendDigest(
  config: DigestConfig & { frequency: Exclude<DigestFrequency, "off"> },
  to: Date,
): Promise<{ queued: number; message: string }> {
  const from = new Date(to.getTime() - digestPeriodMs(config.frequency))
  const monitors = await findAllMonitors()
  const [incidents, runs] = await Promise.all([
    findIncidentsOverlapping(
      monitors.map((m) => m.id),
      from,
    ),
    findRunOutcomesBetween(from, to),
  ])
  const message = buildDigest({
    frequency: config.frequency,
    from,
    to,
    timezone: config.timezone,
    instanceName: config.instanceName,
    monitors,
    // Only what had started by the end of the period.
    incidents: incidents.filter((i) => i.startedAt < to),
    runs,
    link: appLink("/"),
  })
  const label = config.frequency === "daily" ? "Resumo diário" : "Resumo semanal"
  const queued = await broadcast("digest", message, label)
  return { queued, message }
}

/** Called on every scheduler tick: sends the digest once per slot. */
export async function maybeSendDigest(now = new Date()): Promise<boolean> {
  const config = await loadDigestConfig()
  if (config.frequency === "off") return false
  const raw = await getSetting(LAST_SENT_KEY)
  const lastSentAt = raw ? new Date(Number(raw)) : null
  const slot = digestDue({ ...config, now, lastSentAt })
  if (!slot) return false

  // Mark first: a crash mid-send loses one digest rather than repeating it every tick.
  await setSetting(LAST_SENT_KEY, String(now.getTime()))
  const { queued } = await sendDigest({ ...config, frequency: config.frequency }, slot)
  logger.info({ frequency: config.frequency, slot, queued }, "digest queued")
  return true
}
