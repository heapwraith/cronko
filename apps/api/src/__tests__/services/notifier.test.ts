import type * as NotificationQueries from "@cronko/database/queries/notifications"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { DeliveryError } from "../../services/channels"
import type * as Notifier from "../../services/notifier"
import { setupTestDb } from "../helpers/testDb"

const deliver = vi.fn<(channel: unknown, event: string, text: string) => Promise<void>>()
vi.mock("../../services/channels", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../services/channels")>()),
  deliver: (...args: [unknown, string, string]) => deliver(...args),
}))

describe("notification outbox (real SQLite)", () => {
  let ctx: Awaited<ReturnType<typeof setupTestDb>>
  let q: typeof NotificationQueries
  let notifier: typeof Notifier

  beforeAll(async () => {
    ctx = await setupTestDb()
    q = await import("@cronko/database/queries/notifications")
    notifier = await import("../../services/notifier")
  })

  beforeEach(async () => {
    ctx.reset()
    deliver.mockReset()
    await q.createNotificationChannel({
      id: "ch1",
      name: "ops",
      type: "discord",
      enabled: true,
      config: { webhookUrl: "https://example.test/hook" },
    })
  })

  const deliveries = async () => q.findRecentDeliveries(10)
  const T0 = new Date("2026-11-05T12:00:00Z")

  it("appends a link to the run when PUBLIC_URL is set", async () => {
    const { env } = await import("../../env")
    deliver.mockResolvedValue()
    expect(notifier.appLink("/monitors/m1")).toBeUndefined()

    env.PUBLIC_URL = "https://cronko.example.com/"
    try {
      await notifier.sendNotification(
        { name: "etl" },
        "failed",
        "exit code 2",
        "/monitors/m1/runs/r1",
      )
      await notifier.processDueDeliveries()
      const text = deliver.mock.calls.at(-1)?.[2]
      expect(text).toContain("etl falhou (exit code 2)")
      expect(text).toContain("\nhttps://cronko.example.com/monitors/m1/runs/r1")
    } finally {
      delete env.PUBLIC_URL
    }
  })

  it("queues without waiting and sends on the first pass", async () => {
    deliver.mockResolvedValue()
    await notifier.sendNotification({ name: "backup" }, "down")
    await vi.waitFor(async () => expect((await deliveries())[0]?.status).toBe("sent"))

    expect(deliver).toHaveBeenCalledTimes(1)
    expect(deliver.mock.calls[0]?.[2]).toContain("backup")
    expect((await deliveries())[0]).toMatchObject({ attempts: 1, lastError: null, event: "down" })
  })

  it("retries a transient failure with backoff, then succeeds", async () => {
    deliver.mockRejectedValueOnce(new DeliveryError("discord: HTTP 503", true)).mockResolvedValue()
    await q.enqueueDeliveries(
      [{ id: "d1", channelId: "ch1", monitorName: "backup", event: "down", message: "x" }],
      T0,
    )

    await notifier.processDueDeliveries(T0)
    expect((await deliveries())[0]).toMatchObject({
      status: "pending",
      attempts: 1,
      lastError: "discord: HTTP 503",
    })

    // Not due yet: the backoff has not elapsed.
    expect(await notifier.processDueDeliveries(new Date(T0.getTime() + 10_000))).toBe(0)

    await notifier.processDueDeliveries(new Date(T0.getTime() + 31_000))
    expect((await deliveries())[0]).toMatchObject({ status: "sent", attempts: 2, lastError: null })
  })

  it("does not retry a permanent failure (e.g. HTTP 404)", async () => {
    deliver.mockRejectedValue(new DeliveryError("discord: HTTP 404", false))
    await q.enqueueDeliveries(
      [{ id: "d1", channelId: "ch1", monitorName: "backup", event: "down", message: "x" }],
      T0,
    )
    await notifier.processDueDeliveries(T0)

    expect((await deliveries())[0]).toMatchObject({ status: "failed", attempts: 1 })
    expect(await notifier.processDueDeliveries(new Date(T0.getTime() + 3_600_000))).toBe(0)
  })

  it("gives up after the last backoff step and keeps the error visible", async () => {
    deliver.mockRejectedValue(new DeliveryError("discord: HTTP 500", true))
    await q.enqueueDeliveries(
      [{ id: "d1", channelId: "ch1", monitorName: "backup", event: "down", message: "x" }],
      T0,
    )

    let now = T0.getTime()
    for (const delay of [0, ...notifier.RETRY_DELAYS_MS]) {
      now += delay
      await notifier.processDueDeliveries(new Date(now))
    }

    expect(deliver).toHaveBeenCalledTimes(notifier.MAX_ATTEMPTS)
    expect((await deliveries())[0]).toMatchObject({
      status: "failed",
      attempts: notifier.MAX_ATTEMPTS,
      lastError: "discord: HTTP 500",
    })
  })

  it("one failing channel does not block the others", async () => {
    await q.createNotificationChannel({
      id: "ch2",
      name: "backup-channel",
      type: "slack",
      enabled: true,
      config: { webhookUrl: "https://example.test/slack" },
    })
    deliver.mockImplementation(async (channel) => {
      if ((channel as { id: string }).id === "ch1")
        throw new DeliveryError("discord: HTTP 500", true)
    })
    await q.enqueueDeliveries(
      [
        { id: "d1", channelId: "ch1", monitorName: "m", event: "down", message: "x" },
        { id: "d2", channelId: "ch2", monitorName: "m", event: "down", message: "x" },
      ],
      T0,
    )
    await notifier.processDueDeliveries(T0)

    const byChannel = Object.fromEntries((await deliveries()).map((d) => [d.channelId, d.status]))
    expect(byChannel).toEqual({ ch1: "pending", ch2: "sent" })
  })

  it("test notifications report the real outcome", async () => {
    const channel = (await q.findNotificationChannelById("ch1"))!
    deliver.mockResolvedValueOnce()
    expect(await notifier.sendTestNotification(channel)).toEqual({ ok: true })

    deliver.mockRejectedValueOnce(new DeliveryError("discord: HTTP 401", false))
    expect(await notifier.sendTestNotification(channel)).toEqual({
      ok: false,
      error: "discord: HTTP 401",
    })
  })
})
