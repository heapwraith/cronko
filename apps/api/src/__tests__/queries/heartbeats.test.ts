import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { setupTestDb } from "../helpers/testDb"

describe("findLatestHeartbeats (real SQLite)", () => {
  let ctx: Awaited<ReturnType<typeof setupTestDb>>
  let monitors: typeof import("@cronko/database/queries/monitors")
  let hbq: typeof import("@cronko/database/queries/heartbeats")

  beforeAll(async () => {
    ctx = await setupTestDb()
    monitors = await import("@cronko/database/queries/monitors")
    hbq = await import("@cronko/database/queries/heartbeats")
  })
  beforeEach(() => ctx.reset())

  const make = (name: string) =>
    monitors.createMonitor({
      id: crypto.randomUUID(),
      name,
      slug: name,
      token: crypto.randomUUID(),
      expectedIntervalSeconds: 60,
      gracePeriodSeconds: 30,
      now: new Date(),
    })

  const beat = (
    monitorId: string,
    at: string,
    extra: { durationMs?: number; exitCode?: number } = {},
  ) =>
    hbq.createHeartbeat({ id: crypto.randomUUID(), monitorId, receivedAt: new Date(at), ...extra })

  it("returns only the newest heartbeat per monitor, with its exit code", async () => {
    const a = await make("a")
    const b = await make("b")
    await beat(a.id, "2026-11-05T10:00:00Z", { exitCode: 0 })
    await beat(a.id, "2026-11-05T12:00:00Z", { exitCode: 2, durationMs: 900 })
    await beat(a.id, "2026-11-05T11:00:00Z", { exitCode: 0 })
    await beat(b.id, "2026-11-05T09:00:00Z")

    const latest = await hbq.findLatestHeartbeats([a.id, b.id])

    expect(latest.size).toBe(2)
    expect(latest.get(a.id)).toMatchObject({ exitCode: 2, durationMs: 900 })
    expect(latest.get(a.id)?.receivedAt.toISOString()).toBe("2026-11-05T12:00:00.000Z")
    expect(latest.get(b.id)?.exitCode).toBeNull()
  })

  it("handles no ids and monitors without heartbeats", async () => {
    expect((await hbq.findLatestHeartbeats([])).size).toBe(0)
    const m = await make("quiet")
    expect((await hbq.findLatestHeartbeats([m.id])).has(m.id)).toBe(false)
  })
})
