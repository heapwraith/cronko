import { findMonitorById } from "@cronko/database/queries/monitors"
import {
  deleteDeliveriesOlderThan,
  enqueueDeliveries,
  findDueDeliveries,
  findEnabledNotificationChannels,
  markDeliveryAttemptFailed,
  markDeliverySent,
} from "@cronko/database/queries/notifications"
import { env } from "../env"
import { logger } from "../lib/logger"
import { type ChannelRow, DeliveryError, deliver } from "./channels"

export type NotificationEvent =
  | "missed"
  | "down"
  | "failed"
  | "recovered"
  | "slow"
  // Opt-in analytics alerts: informative, they change neither state nor incidents.
  | "unusual"
  | "overlap"

const messages: Record<NotificationEvent, (name: string) => string> = {
  missed: (name) => `⚠️ ${name} não executou no tempo esperado`,
  down: (name) => `🔴 ${name} está down`,
  failed: (name) => `❌ ${name} falhou`,
  recovered: (name) => `✅ ${name} voltou a executar normalmente`,
  slow: (name) => `🐢 ${name} excedeu a duração máxima configurada`,
  unusual: (name) => `🐌 ${name} demorou bem mais que o normal`,
  overlap: (name) => `⚠️ ${name} começou antes da execução anterior terminar`,
}

/** Delay before retry N (1-based): 30s, 1m, 2m, 5m, 10m — then give up. */
/** Absolute link into the web app, or undefined when PUBLIC_URL is not configured. */
export function appLink(path: string): string | undefined {
  return env.PUBLIC_URL ? `${env.PUBLIC_URL.replace(/\/+$/, "")}${path}` : undefined
}

export const RETRY_DELAYS_MS = [30_000, 60_000, 120_000, 300_000, 600_000]
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1

/**
 * Queue an alert for every enabled channel. Returns immediately: delivery (and
 * its retries) happens in the outbox worker, so a slow or failing channel can
 * never stall the scheduler, and queued alerts survive a restart.
 */
export async function sendNotification(
  monitor: { id?: string; name: string },
  event: NotificationEvent,
  detail?: string,
  path?: string,
) {
  // A muted monitor (maintenance) still changes state and opens incidents, but stays quiet.
  if (monitor.id) {
    const mutedUntil = (await findMonitorById(monitor.id))?.mutedUntil
    if (mutedUntil && mutedUntil.getTime() > Date.now()) {
      logger.info({ monitor: monitor.name, event }, "alert suppressed: monitor muted")
      return
    }
  }
  const link = path ? appLink(path) : undefined
  const message =
    messages[event](monitor.name) + (detail ? ` (${detail})` : "") + (link ? `\n${link}` : "")
  const channels = await findEnabledNotificationChannels()
  if (channels.length === 0) return

  const now = new Date()
  await enqueueDeliveries(
    channels.map((channel: ChannelRow) => ({
      id: crypto.randomUUID(),
      channelId: channel.id,
      monitorName: monitor.name,
      event,
      message,
    })),
    now,
  )

  void processDueDeliveries()
}

let processing = false

/** Attempt every due delivery once. Safe to call often; runs one pass at a time. */
export async function processDueDeliveries(now = new Date()): Promise<number> {
  if (processing) return 0
  processing = true
  let handled = 0

  try {
    for (const { delivery, channel } of await findDueDeliveries(now)) {
      const attempts = delivery.attempts + 1
      handled++
      try {
        await deliver(channel, delivery.event, delivery.message, delivery.monitorName)
        await markDeliverySent(delivery.id, attempts, new Date())
      } catch (err) {
        const retryable = err instanceof DeliveryError ? err.retryable : true
        const error = err instanceof Error ? err.message : "delivery failed"
        const delay = RETRY_DELAYS_MS[attempts - 1]
        const retryAt = retryable && delay !== undefined ? new Date(now.getTime() + delay) : null

        await markDeliveryAttemptFailed(delivery.id, { attempts, error, retryAt, now: new Date() })
        logger.warn(
          {
            channel: channel.name,
            type: channel.type,
            event: delivery.event,
            attempts,
            error,
            willRetry: retryAt !== null,
          },
          "notification delivery failed",
        )
      }
    }
  } catch (err) {
    logger.error({ err }, "notification worker failed")
  } finally {
    processing = false
  }
  return handled
}

/** Send a one-off test message and report the outcome to the caller. */
export async function sendTestNotification(
  channel: ChannelRow,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await deliver(
      channel,
      "recovered",
      messages.recovered("Test Notification"),
      "Test Notification",
    )
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "delivery failed" }
  }
}

export async function cleanupDeliveries(retentionDays: number) {
  await deleteDeliveriesOlderThan(new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000))
}
